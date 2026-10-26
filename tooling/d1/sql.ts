// @boundary server
import { type SQL } from "drizzle-orm";
import { SQLiteDialect } from "drizzle-orm/sqlite-core";

const dialect = new SQLiteDialect();

/**
 * Serialize a Drizzle SQL object for Wrangler's D1 CLI, which cannot bind
 * positional parameters. Author SQL with Drizzle; this only inlines params.
 */
export function toSqlStatement(query: SQL): string {
  return `${dialect.sqlToQuery(query.inlineParams()).sql};`;
}
