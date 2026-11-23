// @boundary server
import {
  databaseFor,
  targetConfig,
  targetName,
  type TargetConfig,
  type TargetName,
} from "./config";
import { runWranglerFile } from "./wrangler";

/** D1-specific services for backfills that need the database. */
export interface D1BackfillContext {
  target: TargetName;
  targetConfig: TargetConfig;
  dryRun: boolean;
  log: (message: string) => void;
  database: {
    name: (binding: string) => string;
    execute: (binding: string, sql: string) => Promise<void>;
    executeFile: (binding: string, name: string, sql: string) => Promise<void>;
  };
}

/** Opt-in D1 context for backfills that execute SQL. */
export async function createD1Context(
  target: string | undefined,
  dryRun: boolean,
  log: (message: string) => void,
): Promise<D1BackfillContext> {
  const resolved = await targetName(target);
  const config = await targetConfig(resolved);

  const executeFile = async (binding: string, name: string, sql: string): Promise<void> => {
    if (dryRun) {
      log(`[dry-run] ${databaseFor(config, binding).name} (${name}):\n${sql}`);
      return;
    }

    await runWranglerFile(config, binding, name, sql);
  };

  return {
    target: resolved,
    targetConfig: config,
    dryRun,
    log,
    database: {
      name: (binding: string): string => databaseFor(config, binding).name,
      execute: (binding: string, sql: string): Promise<void> =>
        executeFile(binding, `backfill-${process.pid}.sql`, sql),
      executeFile,
    },
  };
}
