// @boundary server
import { serverLogger } from "~/shared/server/logger";

/** One independent maintenance job that can be scheduled by the Worker. */
export interface MaintenanceTask {
  /** Stable name used in logs and metrics. */
  readonly name: string;
  run: (now: Date) => Promise<void>;
}

/** Outcome of one maintenance task. */
export interface MaintenanceResult {
  readonly name: string;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly error?: unknown;
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * Run maintenance tasks independently and report each result.
 *
 * Cross-cutting concerns (logging, timing, error isolation) live here so
 * scheduled jobs only supply a name and a run function.
 */
export function runMaintenance(
  tasks: readonly MaintenanceTask[],
  now: Date = new Date(),
): Promise<readonly MaintenanceResult[]> {
  return Promise.all(
    tasks.map(async (task): Promise<MaintenanceResult> => {
      const startedAt = performance.now();

      try {
        await task.run(now);
        return { name: task.name, ok: true, durationMs: performance.now() - startedAt };
      } catch (error: unknown) {
        serverLogger.error(
          { maintenance: task.name, error: errorName(error) },
          "Maintenance task failed",
        );

        return {
          name: task.name,
          ok: false,
          durationMs: performance.now() - startedAt,
          error,
        };
      }
    }),
  );
}
