# Events data export — design

Status: draft · Branch: `feature/events-export-design` · Date: 2026-11-23

## 1. Goal

Let authorized staff download all event data as CSV (and optionally Excel) without
a single request that risks the Worker's CPU or memory budget. Prefer an
off-the-shelf serialization library over maintaining our own CSV/zip encoder.

## 2. Constraints and the "10 ms" requirement

The phrase "fit in 10 ms" is interpreted as the **Cloudflare Workers Free per-request
CPU budget (10 ms)**; the Paid plan defaults to 30 s. CPU time excludes time waiting
on D1/network I/O, so a chunked reader can stay under budget even for large exports.
If the requirement was actually a **10 MB file size**, the same design applies — a
chunked export can be assembled into a file of any size up to what the browser can
hold, and CSV compresses well.

Other hard constraints:

- 128 MB isolate memory. Deep exports must not be buffered in one Worker invocation.
- No `nodejs_compat` compatibility flag is enabled. Libraries must use Web APIs only
  (`ReadableStream`, `TransformStream`, `TextEncoder`, `Blob`).
- No response-body size limit is enforced by Cloudflare, but a single giant response
  would still consume isolate memory and CPU to build.
- Existing code caps inbound bodies at 1 MB and all list queries via `LIMITS`.
- No export code, CSV library, or download helper exists today.

## 3. What "all events data" means

The event schema is deeply relational (`src/db/events/schemas/**`). A registration
fans out to contacts (1–5), tickets (1–100), form answers (0–200, each ≤4 KB JSON),
one payment, one check-in; an event also has form versions (≤64 KB each), ticket
types, and audit rows with unbounded metadata.

Two useful shapes:

| Shape | Content | Use |
| --- | --- | --- |
| **Flat** | One row per registration, with answers/tickets/contacts flattened into columns | Spreadsheet filtering, mail merge |
| **Sectioned** | One file/sheet per entity type (`events`, `registrations`, `contacts`, `answers`, `tickets`, `payments`, `checkins`) | Lossless, relational, easier to re-import |

Recommendation: **sectioned** as the primary shape (no information loss, no column
explosion), with a flat "registrations" sheet as a convenience. For Excel, use one
worksheet per section; for CSV, produce a ZIP of per-section CSV files or let the
user pick a section. A single CSV cannot represent multiple sections cleanly.

Clarify with the requester whether "all events" means every event or a selected
event/subtree; the design supports both via a scope parameter.

## 4. Options considered

| Option | Worker CPU | Memory | Complexity | Notes |
| --- | --- | --- | --- | --- |
| Single-request server CSV | ❌ deep export exceeds 10 ms/128 MB | ❌ | Low | Only viable for metadata + counts |
| Server streaming CSV (`TransformStream`) | ⚠️ shallow only | ✅ if streamed | Medium | No existing streaming precedent; xlsx needs ZIP |
| **Chunked endpoint + client assembly** | ✅ each request bounded | ✅ | **Medium** | Reuses keyset pagination and auth; no new infra |
| Background job → R2 + polling | ✅ | ✅ | High | Needs R2, queue consumer, status store, UI |
| `wrangler d1 export` (ops) | N/A | N/A | None | Zero-code backup path, not an in-app feature |

**Recommendation: chunked endpoint + client assembly** (phase 1). It keeps every
Worker invocation tiny, avoids buffering, and needs no new infrastructure. Add the
R2 job only if exports grow beyond what a browser can comfortably assemble.

## 5. Recommended architecture

```text
Admin UI (Export button)
   │  1. GET /api/admin/events/export/scope   (events + counts, or selected event)
   │  2. loop: GET /api/admin/events/export?section=registrations&eventId=…&cursor=…
   │     ← { rows: [...], meta: { nextCursor, hasNext } }  (≤100 rows/request)
   │  3. feed rows into csv-pipe (CSV) or write-excel-file (xlsx) in the browser
   └──4. Blob → object URL → <a download> click
```

### 5.1 Server

- New route file `src/server/routes/events/export.ts`, mounted under `/api/admin/events/export`
  in `src/server/root.ts`.
- Permission: add an `export` action to the events statements in
  `src/auth/access/events.ts` (admin-only initially). Do not reuse `event:read`
  implicitly — export crosses event boundaries and exposes PII.
- Query: use the existing keyset cursor helpers (`src/server/pagination/keyset.ts`)
  and `LIMITS.list` page sizes. Fetch `limit + 1` rows, return a base64url cursor,
  never `COUNT(*)` on the full set.
- Sections are separate query paths so each can use its own index and row shape:
  `events`, `registrations` (with answers/contacts/tickets), `payments`, `checkins`,
  `formVersions`, `ticketTypes`, `audit`.
- Cap `limit` (e.g. 100) and total rows per export client-side; the server stays
  stateless and bounded.
- Response stays in the normal `apiSuccess` envelope so existing auth, localization,
  error, and rate-limit middleware apply unchanged.

### 5.2 Client

- New helper `src/shared/client/download.ts`: `fetch` all chunks → `Blob` →
  `URL.createObjectURL` → anchor with `download` → revoke URL. No such helper exists.
- Use the library encoder on the assembled rows (see §6).
- `<qui-button href="…" download="events.csv">` is another option —
  `src/shared/client/router-links.ts` already leaves `download` links to the browser —
  but it cannot assemble multiple chunks, so the Blob helper is required.
- Surface progress ("exporting 3 of 12 events…") and a cancel button; aborting stops
  the fetch loop.
- Localize labels through `admin.content.ts` and add keys to the page-level `pick()`
  subset (e.g. `admin-detail-types.ts`) rather than duplicating strings.

## 6. Library evaluation

All candidates below are MIT-licensed. Versions checked against the npm registry on
2026-11-23.

| Library | Version | Runtime deps | Runs in Workers/browser | Notes |
| --- | --- | --- | --- | --- |
| **`csv-pipe`** | 2.1.0 | 0 | Yes (Web Streams, no Node built-ins) | **Recommended for CSV.** Typed `columns`, RFC 4180, Web `ReadableStream`, `sanitizeFormulas` option handles spreadsheet injection, ~2 kB/direction. Low adoption (≈13 stars) — pin the version and add a small adapter test. |
| `@cfworker/csv` | 4.0.6 | 0 | Yes (built for Workers) | Streaming `encode()`; very small. Minimal README and no documented formula-escaping option, so we would still need our own guard. Alternative if we later generate CSV in the Worker. |
| `papaparse` | 5.7.x | 0 | Browser/Workers via `unparse` | Huge adoption, but primarily a parser; no built-in formula escaping and streaming is Node-stream oriented. |
| `csv-stringify` | 6.9.0 | 1 | Browser ESM build needs polyfills | Node `stream.Transform` API; avoid given no `nodejs_compat`. |
| `@portable/csv` | 0.1.0 | 3 | Yes | Has `escapeFormulas`/`bom` and Web streams, but brand new (0.1.0, Node ≥24). Watchlist, not production pick. |
| **`write-excel-file`** | 4.1.1 | 1 (`fflate`) | Browser/universal builds | **Recommended for xlsx (if required).** Mature (≈3.2M weekly downloads), `toBlob()` in `/universal`, no Node APIs. `/browser` uses Web Workers. |
| `@xlsxflow/core` | current | 0 | Yes, streaming xlsx on Web APIs | Attractive for future server-side streaming xlsx; newer/low adoption. Watchlist. |
| `exceljs`, SheetJS | — | many / CDN-only | Poor | Heavy, CJS/eval or npm-distribution issues. Avoid. |

**Decision:** adopt `csv-pipe` for CSV now (its `sanitizeFormulas` directly satisfies
the security requirement in §7). Add `write-excel-file` only if xlsx is confirmed
required. Keep both behind a small `src/events/export/format.ts` adapter so the
library can be swapped without touching routes or UI.

No library does the *domain flattening* (which answer becomes which column); that
stays in our code as a pure, unit-testable mapper — a small, stable surface.

## 7. Security

- **Authorization**: dedicated `export` permission, admin-only at launch. Every chunk
  request re-checks the session and permission via existing middleware.
- **CSV/formula injection**: user-controlled names, notes and free-text answers can
  start with `=`, `+`, `-`, `@`. Use `csv-pipe`'s `sanitizeFormulas`; verify with tests
  containing `=HYPERLINK(...)`, `@SUM(...)`, leading tab/CR.
- **PII**: export contains emails, phone numbers, mailing addresses, payment notes.
  Do not log row contents; do not include OTP hashes/tokens or session tokens in any
  section (exclude `registration_status_otps`, `registration_status_sessions`).
- **Bounded work**: per-request row cap, cursor-based paging, no unbounded scans,
  no `audit.metadata` dump unless explicitly requested.
- **Download safety**: fixed filename, `Content-Disposition` only if serving a file
  directly; revoke object URLs; no user-controlled filename in headers.
- **Audit**: record who exported what scope and when in `audit_events` (without row
  data), consistent with existing admin actions.

## 8. API sketch

```text
GET /api/admin/events/export/scope
  → { events: [{ id, slug, title, registrationCount }], sections: [...] }

GET /api/admin/events/export?section=registrations&eventId=<id>&cursor=<opaque>&limit=100
  → { rows: [...], meta: { keyset: { pageSize, hasNext, nextCursor } } }
```

`eventId` optional for cross-event sections. Invalid section/cursor → 400 via the
existing `defaultValidationHandler`. Empty scope → empty `rows`, no error.

## 9. Testing

- Unit: section mappers (flattening, null handling, formula escaping via `csv-pipe`),
  cursor encode/decode, format adapter output snapshot.
- Integration (`tests/integration/api/admin-events.test.ts` or a new export file):
  permission denial, invalid section/cursor, empty export, multi-page cursor walk,
  capped `limit`, exclusion of OTP/session tables.
- Browser (only if the browser project is runnable): button → blob download. Chromium
  is currently unavailable in the dev container, so keep download logic in a pure
  helper that can be unit-tested without a browser.
- No docs should mention internal CI/Doppler details.

## 10. Rollout

1. Phase 1 — CSV, sectioned, admin-only, chunked endpoint + client assembly.
2. Phase 2 — xlsx via `write-excel-file` if requested; flat registration sheet.
3. Phase 3 — R2 background job only if measured exports exceed browser capacity.

## 11. Open questions

- Is "10 ms" the CPU budget or a 10 MB file-size target? (Design handles both.)
- One combined workbook/file for all events, or per-event files?
- Which sections are in scope — do audit logs and payment notes need to be included?
- Should `event_staff` be allowed to export events they can already manage?
