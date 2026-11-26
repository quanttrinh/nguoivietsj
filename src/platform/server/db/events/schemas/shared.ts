// @boundary server
import { sql } from "drizzle-orm";
import { snakeCase, text } from "drizzle-orm/sqlite-core";

import type { LocalizedText } from "~/features/events/domain/types";

/** Tables derive physical column names from camelCase properties. */
export const defineTable = snakeCase.table;

export const localizedText = () => text({ mode: "json" }).$type<LocalizedText>();

export const timestamp = () =>
  text()
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** Text timestamps stay ISO strings, so `$onUpdate` returns a string, not a Date. */
export const updatedTimestamp = () => timestamp().$onUpdate(() => new Date().toISOString());
