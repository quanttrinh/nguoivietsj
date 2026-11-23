// @boundary server
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";

/** Columns for every table, read in a single query. */
export const COLUMNS_SQL = `SELECT m.name AS table_name, p.name AS column_name
FROM sqlite_master AS m
JOIN pragma_table_info(m.name) AS p
WHERE m.type = 'table'
  AND m.name NOT LIKE 'sqlite_%'
  AND m.name NOT LIKE '_cf_%'`;

export function expectedColumns(tables: readonly SQLiteTable[]): Map<string, string[]> {
  return new Map(
    tables.map((table) => {
      const config = getTableConfig(table);

      return [config.name, config.columns.map((column) => column.name)];
    }),
  );
}

export function parseColumns(rows: readonly Record<string, unknown>[]): Map<string, Set<string>> {
  const actual = new Map<string, Set<string>>();

  for (const row of rows) {
    const table = String(row.table_name);
    const column = String(row.column_name);
    const columns = actual.get(table) ?? new Set<string>();

    columns.add(column);
    actual.set(table, columns);
  }

  return actual;
}

/** Compare a live SQLite schema with the Drizzle table definitions. */
export function compareColumns(
  expected: Map<string, string[]>,
  actual: Map<string, Set<string>>,
): string[] {
  const problems: string[] = [];

  for (const [table, columns] of expected) {
    const actualColumns = actual.get(table);

    if (actualColumns === undefined) {
      problems.push(`missing table: ${table}`);
    } else {
      for (const column of columns) {
        if (!actualColumns.has(column)) {
          problems.push(`missing column: ${table}.${column}`);
        }
      }
    }
  }

  return problems;
}
