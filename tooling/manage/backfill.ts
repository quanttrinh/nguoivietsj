import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

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
  /** One-line summary shown by `bun manage.ts list`. */
  description: string;
  /** Optional CLI synopsis shown by `bun manage.ts help <name>`. */
  usage?: string;
  /** Receives only arguments after the `--` separator. */
  run: (context: BackfillContext, args: string[]) => Promise<void> | void;
}

export interface LoadedBackfill extends Backfill {
  /** Folder name under `src/backfills/`. */
  name: string;
}

/** Identity helper that gives backfill modules a typed default export. */
export function defineBackfill(backfill: Backfill): Backfill {
  return backfill;
}

export const BACKFILLS_DIR = path.join(ROOT, "src", "backfills");

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

/** Normalize `seed`, `src/backfills/seed`, or `src/backfills/seed/index.ts`. */
export function backfillName(input: string): string {
  const normalized = input
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "")
    .replace(/^src\/backfills\//u, "")
    .replace(/^backfills\//u, "")
    .replace(/\/index\.ts$/u, "")
    .replace(/\/$/u, "");

  if (normalized === "" || normalized.includes("/") || normalized.includes("..")) {
    throw new Error(`Invalid backfill path: ${input}`);
  }

  return normalized;
}

/** Discover every `src/backfills/<name>/index.ts` module. */
export async function loadBackfills(): Promise<Map<string, LoadedBackfill>> {
  const directoryEntries = await readdir(BACKFILLS_DIR, { withFileTypes: true });
  const entries = directoryEntries
    .filter((entry) => entry.isDirectory())
    .toSorted((left, right) => left.name.localeCompare(right.name));
  const loaded = await Promise.all(
    entries.map(async (entry): Promise<[string, LoadedBackfill]> => {
      const modulePath = path.join(BACKFILLS_DIR, entry.name, "index.ts");

      try {
        await access(modulePath);
      } catch {
        throw new Error(`Backfill "${entry.name}" is missing index.ts`);
      }

      const module: unknown = await import(pathToFileURL(modulePath).href);
      const exported =
        typeof module === "object" && module !== null && "default" in module
          ? module.default
          : undefined;

      if (!isBackfill(exported)) {
        throw new Error(`Backfill "${entry.name}" must default export defineBackfill({...})`);
      }

      return [entry.name, { ...exported, name: entry.name }];
    }),
  );

  return new Map(loaded);
}
