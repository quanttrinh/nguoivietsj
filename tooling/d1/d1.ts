import {
  TARGETS,
  TARGET_CONFIGS,
  databaseName,
  type TargetConfig,
  type TargetName,
} from "./config";
import { runWranglerFile } from "./wrangler";

export type D1Database = "app" | "events";

/** D1-specific services for backfills that need the database. */
export interface D1BackfillContext {
  target: TargetName;
  targetConfig: TargetConfig;
  dryRun: boolean;
  log: (message: string) => void;
  database: {
    name: (database: D1Database) => string;
    execute: (database: D1Database, sql: string) => Promise<void>;
    executeFile: (database: D1Database, name: string, sql: string) => Promise<void>;
  };
}

function targetName(value: string | undefined = "local"): TargetName {
  const target = TARGETS.find((candidate) => candidate === value);

  if (target === undefined) {
    throw new Error(`Invalid target: ${value}`);
  }

  return target;
}

/** Opt-in D1 context for backfills that execute SQL. */
export function createD1Context(
  target: string | undefined,
  dryRun: boolean,
  log: (message: string) => void,
): D1BackfillContext {
  const resolved = targetName(target);
  const targetConfig = TARGET_CONFIGS[resolved];

  const executeFile = async (database: D1Database, name: string, sql: string): Promise<void> => {
    if (dryRun) {
      log(`[dry-run] ${databaseName(targetConfig, database)} (${name}):\n${sql}`);
      return;
    }

    await runWranglerFile(targetConfig, database, name, sql);
  };

  return {
    target: resolved,
    targetConfig,
    dryRun,
    log,
    database: {
      name: (database: D1Database): string => databaseName(targetConfig, database),
      execute: (database: D1Database, sql: string): Promise<void> =>
        executeFile(database, `backfill-${process.pid}.sql`, sql),
      executeFile,
    },
  };
}
