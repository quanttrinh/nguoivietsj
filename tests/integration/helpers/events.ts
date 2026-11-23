import { expect } from "vitest";

import type { TestDatabase } from "./d1";

/** Look up a seeded event id by slug, failing when the event is missing. */
export async function eventIdBySlug(db: TestDatabase, slug: string): Promise<string> {
  const row = await db.events
    .prepare("SELECT id FROM events WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();
  expect.assert(row !== null, `expected seeded event ${slug}`);

  return row.id;
}
