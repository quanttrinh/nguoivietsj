/** Failure reported by a command launched for a backfill. */
export class CommandError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "CommandError";
    this.exitCode = exitCode;
  }
}
