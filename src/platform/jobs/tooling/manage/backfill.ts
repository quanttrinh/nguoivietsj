// @boundary server
import { glob } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ROOT } from "../root";

/** Context passed by the generic manager to every backfill. */
export interface BackfillContext {
  /** Raw `--target` value; D1 backfills resolve and validate it themselves. */
  target: string | undefined;
  /** Global dry-run flag. Backfills decide what it means for them. */
  dryRun: boolean;
  /** Writes a progress line to stdout. */
  log: (message: string) => void;
}

/** A command that can be discovered and run by `manage.ts`. */
export interface Backfill {
  /** One-line summary shown by `node --import ./scripts/register-node.ts manage.ts list`. */
  description: string;
  /** Optional CLI synopsis shown by `node --import ./scripts/register-node.ts manage.ts help <name>`. */
  usage?: string;
  /** Receives only arguments after the `--` separator. */
  run: (context: BackfillContext, args: string[]) => Promise<void> | void;
}

export interface LoadedBackfill extends Backfill {
  /** Folder name under `src/platform/jobs/backfills/`. */
  name: string;
}

/** Identity helper that gives backfill modules a typed default export. */
export function defineBackfill(backfill: Backfill): Backfill {
  return backfill;
}

export const BACKFILLS_DIR = path.join(ROOT, "src", "platform", "jobs", "backfills");

function isBackfill(value: unknown): value is Backfill {
  return (
    typeof value === "object" &&
    value !== null &&
    "description" in value &&
    typeof value.description === "string" &&
    "run" in value &&
    typeof value.run === "function"
  );
}

/** Normalize a backfill name or path to its folder name. */
export function backfillName(input: string): string {
  const normalized = input.replaceAll("\\", "/");
  const withoutEntry = normalized.endsWith("/index.ts")
    ? normalized.slice(0, -"/index.ts".length)
    : normalized;

  return path.posix.basename(withoutEntry);
}

/** Discover every `src/platform/jobs/backfills/<name>/index.ts` module. */
export async function loadBackfills(): Promise<Map<string, LoadedBackfill>> {
  const modulePaths = await Array.fromAsync(glob(path.join(BACKFILLS_DIR, "*/index.ts")));
  const loaded = await Promise.all(
    modulePaths.map(async (modulePath): Promise<[string, LoadedBackfill]> => {
      const name = path.basename(path.dirname(modulePath));
      const module: unknown = await import(pathToFileURL(modulePath).href);
      const exported =
        typeof module === "object" && module !== null && "default" in module
          ? module.default
          : undefined;

      if (!isBackfill(exported)) {
        throw new Error(`Backfill "${name}" must default export defineBackfill({...})`);
      }

      return [name, { ...exported, name }];
    }),
  );

  return new Map(loaded.toSorted(([left], [right]) => left.localeCompare(right)));
}
