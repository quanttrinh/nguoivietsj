import { fc } from "@fast-check/vitest";
import type { Arbitrary } from "fast-check";
import { expect } from "vitest";

export { fc, test as fcTest } from "@fast-check/vitest";

/** Keep fuzz runs bounded locally; CI can raise this via FUZZ_RUNS. */
export const FUZZ_RUNS = Number(process.env.FUZZ_RUNS ?? 20);

/** Parameters forwarded to fast-check by `fcTest.prop`. */
export const FUZZ_PARAMS = { numRuns: FUZZ_RUNS } as const;

const PUNCTUATION = [
  "'",
  '"',
  "\\",
  "/",
  "<",
  ">",
  "&",
  ";",
  "%",
  "?",
  "#",
  "=",
  "\n",
  "\t",
  "\u0000",
  "é",
  "🙂",
] as const;

/** Inputs that stress escaping, Unicode, control characters, and length limits. */
export const nastyText = fc.oneof(
  fc.constant(""),
  fc.string({ minLength: 1, maxLength: 30 }),
  fc.string({ unit: fc.constantFrom(...PUNCTUATION), minLength: 1, maxLength: 30 }),
  fc.string({ minLength: 256, maxLength: 600 }),
);

export const safeSlug = fc.constantFrom("test-event-2027", "summer-picnic-2027");

/** A path segment: either a real slug/id or an encoded hostile value. */
export const pathSegment = fc.oneof(
  safeSlug,
  nastyText.map((value) => encodeURIComponent(value)),
);

export const unknownId = fc.constant("01900000-0000-7000-8000-000000000000");

export const idSegment = fc.oneof(
  unknownId,
  fc.uuid(),
  nastyText.map((value) => encodeURIComponent(value)),
);

export const locale = fc.oneof(
  fc.constantFrom("en", "fr"),
  fc.constantFrom("zz", "EN", ""),
  nastyText.map((value) => value.slice(0, 24)),
);

const jsonArray = fc.array(fc.jsonValue(), { maxLength: 3 });

/** Structured but mostly schema-invalid JSON bodies. */
export const jsonBody = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.jsonValue(),
  fc.record({
    fullName: nastyText,
    contacts: jsonArray,
    tickets: jsonArray,
    consent: fc.boolean(),
    formVersion: fc.integer(),
  }),
);

/** Arbitrary query parameters, including unknown keys and hostile values. */
export const query = fc.oneof(
  fc.constant(""),
  fc.array(fc.tuple(nastyText, nastyText), { maxLength: 4 }).map((pairs) => {
    const params = new URLSearchParams();

    for (const [key, value] of pairs) {
      params.append(key, value);
    }

    return params.toString();
  }),
);

export interface FuzzInit {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

export function fuzzInit(sample: FuzzInit): RequestInit {
  const headers = new Headers(sample.headers);

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const canHaveBody = sample.method !== "GET";

  return {
    method: sample.method,
    headers,
    // A missing body with content-type: application/json makes Hono's validator
    // throw a plain-text 400 before the route runs. Sending `null` still feeds
    // hostile input to the app's own validators while keeping the JSON envelope.
    ...(canHaveBody ? { body: JSON.stringify(sample.body ?? null) } : {}),
  };
}

export async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Universal safety properties: a fuzzed request must produce a real HTTP
 * response with a parseable body, and never an unhandled 500.
 */
// oxlint-disable-next-line eslint(require-await), typescript/require-await -- async API keeps property callbacks uniform.
export async function expectSafeResponse(response: Response, _body: unknown): Promise<void> {
  expect(Number.isInteger(response.status)).toBe(true);
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(600);
  expect(response.status).not.toBe(500);

  // Hono's built-in 404/405 bodies are plain text; API-owned responses are JSON.
  const contentType = response.headers.get("content-type");

  if (contentType !== null && response.status !== 405) {
    expect(contentType).toContain("application/json");
  }
}

/** Hono API routes all return the standard { status, data|error } envelope. */
export async function expectApiEnvelope(response: Response, body: unknown): Promise<void> {
  await expectSafeResponse(response, body);

  // Hono can short-circuit with plain-text 404/405 before our routes run.
  if (typeof body !== "object" || body === null) {
    expect([404, 405]).toContain(response.status);
    return;
  }

  expect(body).toMatchObject({ status: /^(?:success|error)$/u });

  if ((body as { status: string }).status === "error") {
    expect(body).toHaveProperty("error.code");
    expect((body as { error: { code: string } }).error.code.length).toBeGreaterThan(0);
  }
}

export type TableName =
  | "events"
  | "event_aliases"
  | "event_slug_claims"
  | "event_ticket_types"
  | "registrations"
  | "registration_contacts"
  | "registration_tickets"
  | "checkins"
  | "payments"
  | "registration_status_otps"
  | "registration_status_sessions"
  | "user"
  | "account";

export type TableCounts = Record<TableName, number>;

/** Snapshot row counts so 4xx fuzz cases can prove no partial writes happened. */
export async function snapshotCounts(
  db: { prepare: (sql: string) => { first: <TRow>() => Promise<TRow | null> } },
  tables: readonly TableName[],
): Promise<Partial<TableCounts>> {
  const result: Partial<TableCounts> = {};

  for (const table of tables) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each snapshot is a separate D1 read.
    const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
      .first<{ count: number }>();
    result[table] = row?.count ?? 0;
  }

  return result;
}

export function expectCountsUnchanged(
  before: Partial<TableCounts>,
  after: Partial<TableCounts>,
): void {
  expect(after).toEqual(before);
}

/* Shared building blocks for the endpoint-specific fuzz suites. */

/** JSON bodies that always reach the app's validators (never a missing body). */
export const apiJsonBody = jsonBody.map((body) => (body === undefined ? null : body));

/** HTTP header values must be visible ASCII; strip bytes the fetch Headers guard rejects. */
export function safeHeaderValue(value: string): string {
  return value.replaceAll(/[^\u0020-\u007E]/gu, "");
}

/** Header-safe locale values: hostile bytes are stripped so requests reach the app. */
export const headerValue = locale.map((value) => safeHeaderValue(value));

export const apiMethod = fc.constantFrom<"GET" | "POST" | "PATCH" | "PUT" | "DELETE">(
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
);

/** Tables checked for partial writes by mutation fuzz properties. */
export const API_TABLES = [
  "events",
  "registrations",
  "registration_contacts",
  "registration_tickets",
  "checkins",
  "payments",
  "registration_status_otps",
  "registration_status_sessions",
  "user",
  "account",
] as const satisfies readonly TableName[];

/** Derive an id arbitrary from ids loaded from a seeded database. */
export function seededIdFrom(pool: readonly string[]): Arbitrary<string> {
  return fc.nat().map((index) => pool[index % pool.length] ?? "");
}

export function withQuery(path: string, rawQuery: string): string {
  return rawQuery.length > 0 ? `${path}?${rawQuery}` : path;
}

/** Read + assert the standard Hono API envelope in one call. */
export async function expectApiResponse(response: Response): Promise<void> {
  await expectApiEnvelope(response, await readBody(response));
}

/** Read + assert the universal safety properties in one call. */
export async function expectSafeApiResponse(response: Response): Promise<void> {
  await expectSafeResponse(response, await readBody(response));
}

/** Assert that a rejected request left the committed database unchanged. */
export async function expectNoWrites(
  db: Parameters<typeof snapshotCounts>[0],
  before: Partial<TableCounts>,
  tables: readonly TableName[] = API_TABLES,
): Promise<void> {
  expectCountsUnchanged(before, await snapshotCounts(db, tables));
}
