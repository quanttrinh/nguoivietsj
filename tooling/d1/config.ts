import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const TARGETS = ["local", "staging", "production"] as const;
export const DATABASES = ["app", "events", "all"] as const;
export const ROLES = ["event_staff", "admin"] as const;

export type TargetName = (typeof TARGETS)[number];
export type DatabaseName = (typeof DATABASES)[number];
export type Role = (typeof ROLES)[number];

export interface TargetConfig {
  local: boolean;
  env: string | null;
  appDb: string;
  eventsDb: string;
}

export const TARGET_CONFIGS: Record<TargetName, TargetConfig> = {
  local: {
    local: true,
    env: null,
    appDb: "nguoivietsj-db",
    eventsDb: "nguoivietsj-event-engine-db",
  },
  staging: {
    local: false,
    env: "staging",
    appDb: "nguoivietsj-staging-db",
    eventsDb: "nguoivietsj-staging-event-engine-db",
  },
  production: {
    local: false,
    env: null,
    appDb: "nguoivietsj-db",
    eventsDb: "nguoivietsj-event-engine-db",
  },
};

export function selectedDatabases(database: DatabaseName): Exclude<DatabaseName, "all">[] {
  return database === "all" ? ["app", "events"] : [database];
}

export function databaseName(target: TargetConfig, database: Exclude<DatabaseName, "all">): string {
  return database === "app" ? target.appDb : target.eventsDb;
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
