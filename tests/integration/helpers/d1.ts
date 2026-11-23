import { Miniflare } from "miniflare";

import { seedEventSql, seedUsersSql } from "../../../src/backfills/seed";

type D1 = Awaited<ReturnType<Miniflare["getD1Database"]>>;
type KV = Awaited<ReturnType<Miniflare["getKVNamespace"]>>;

/** Import the SQL so Vitest's dependency graph includes migrations. */
export const APP_MIGRATIONS = import.meta.glob<string>("../../../drizzle/app/*/migration.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});
export const EVENT_MIGRATIONS = import.meta.glob<string>(
  "../../../drizzle/events/*/migration.sql",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

/** Split a generated SQL script into statements without breaking quoted text. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of sql) {
    current += char;

    if (char === "'") {
      quoted = !quoted;
    } else if (char === ";" && !quoted) {
      statements.push(current.trim());
      current = "";
    }
  }

  if (current.trim().length > 0) {
    statements.push(current.trim());
  }

  return statements.filter((statement) => statement.length > 0);
}

export async function applyMigrations(db: D1, migrations: Record<string, string>): Promise<void> {
  const scripts = Object.keys(migrations)
    .toSorted()
    .map((path) => migrations[path] ?? "");

  for (const sql of scripts) {
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();

      if (trimmed.length > 0) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- migrations must run in order.
        await db.prepare(trimmed).run();
      }
    }
  }
}

export async function runScript(db: D1, sql: string): Promise<void> {
  await db.batch(splitStatements(sql).map((statement) => db.prepare(statement)));
}

export async function seedDatabase(app: D1, events: D1): Promise<void> {
  await runScript(app, await seedUsersSql());
  await runScript(events, seedEventSql().sql);
}

export interface TestDatabase {
  app: D1;
  events: D1;
  kv: KV;
  dispose: () => Promise<void>;
}

export async function startDatabase(): Promise<TestDatabase> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-08-06",
    d1Databases: { APP_DB: "app", EVENT_ENGINE_DB: "events" },
    kvNamespaces: ["AUTH_SESSION_KV"],
  });

  const app = await mf.getD1Database("APP_DB");
  const events = await mf.getD1Database("EVENT_ENGINE_DB");
  const kv = await mf.getKVNamespace("AUTH_SESSION_KV");

  await applyMigrations(app, APP_MIGRATIONS);
  await applyMigrations(events, EVENT_MIGRATIONS);
  await seedDatabase(app, events);

  return { app, events, kv, dispose: () => mf.dispose() };
}
