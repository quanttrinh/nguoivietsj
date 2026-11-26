// @boundary server
import path from "node:path";

import { ROOT } from "../root";

// `local` selects local D1 state; `production` is the top-level config. Every
// other target is a named Wrangler environment discovered from the config.
const LOCAL_TARGET = "local";
const PRODUCTION_TARGET = "production";

export type TargetName = string;

/** Select every D1 database discovered for the target. */
export const ALL_DATABASES = "all";

/** A D1 database discovered from the Wrangler config for one target. */
export interface D1DatabaseConfig {
  binding: string;
  name: string;
}

export interface TargetConfig {
  target: TargetName;
  local: boolean;
  env: string | null;
  databases: D1DatabaseConfig[];
}

function configFile() {
  return path.resolve(ROOT, process.env.WRANGLER_CONFIG ?? "wrangler.json");
}

/** Target names from the Wrangler config: local, the top level, and each named env. */
export async function availableTargets(): Promise<string[]> {
  const { unstable_readConfig } = await import("wrangler");
  const config = unstable_readConfig({ config: configFile() });
  return [...new Set([LOCAL_TARGET, PRODUCTION_TARGET, ...(config.definedEnvironments ?? [])])];
}

/** Resolve a target name, defaulting to `local`. */
export async function targetName(value: string | undefined = LOCAL_TARGET): Promise<TargetName> {
  const targets = await availableTargets();

  if (!targets.includes(value)) {
    throw new Error(`Invalid target: ${value}. Choose one of: ${targets.join(", ")}.`);
  }

  return value;
}

/** Expand a `--database` value against the bindings discovered for the target. */
export function selectedBindings(
  target: TargetConfig,
  value: string | undefined = ALL_DATABASES,
): string[] {
  if (value === ALL_DATABASES) {
    return target.databases.map((database) => database.binding);
  }

  const database = target.databases.find((candidate) => candidate.binding === value);
  if (database === undefined) {
    const choices = [...target.databases.map((candidate) => candidate.binding), ALL_DATABASES];
    throw new Error(`Invalid database: ${value}. Choose one of: ${choices.join(", ")}.`);
  }

  return [database.binding];
}

/** Look up a discovered database by its Worker binding. */
export function databaseFor(target: TargetConfig, binding: string): D1DatabaseConfig {
  const database = target.databases.find((candidate) => candidate.binding === binding);

  if (database === undefined) {
    throw new Error(`No D1 database bound as ${binding} in the ${target.target} config.`);
  }

  return database;
}

export function wranglerArgs(target: TargetConfig): string[] {
  const args = target.local ? ["--local"] : ["--remote"];
  if (target.env !== null) {
    args.push("--env", target.env);
  }
  if (process.env.WRANGLER_CONFIG !== undefined) {
    args.push("--config", process.env.WRANGLER_CONFIG);
  }
  return args;
}

/**
 * Read the Wrangler config and return the D1 databases for a target.
 *
 * Wrangler resolves JSONC syntax, environment inheritance, and
 * `WRANGLER_CONFIG`; importing it lazily keeps test imports of backfills cheap.
 */
export async function targetConfig(target: TargetName): Promise<TargetConfig> {
  const env = target === LOCAL_TARGET || target === PRODUCTION_TARGET ? null : target;
  const { unstable_readConfig } = await import("wrangler");
  const file = configFile();
  const config = unstable_readConfig(env === null ? { config: file } : { config: file, env });
  const databases: D1DatabaseConfig[] = [];
  for (const database of config.d1_databases) {
    if (database.database_name !== undefined) {
      databases.push({ binding: database.binding, name: database.database_name });
    }
  }

  if (databases.length === 0) {
    throw new Error(`No D1 databases found in ${file} for the ${target} target.`);
  }

  return { target, local: target === LOCAL_TARGET, env, databases };
}
