// @boundary server
import { parseArgs } from "node:util";

import { backfillName, loadBackfills, type BackfillContext, type LoadedBackfill } from "./backfill";
import { CommandError } from "./errors";

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function printHelp() {
  console.log(`Usage: node --import ./scripts/register-node.ts manage.ts <command> [options] [-- <backfill args>]

Commands:
  list                  List available backfills
  help [name]           Show manager or backfill usage
  backfill <name>       Run a backfill
  <name>                Shorthand for "backfill <name>"

Options:
  --target <name>        Passed to the backfill; D1 backfills default to local
  --dry-run              Print SQL helpers instead of executing them
  -h, --help             Show this help

Arguments after "--" are passed to the backfill:

  node --import ./scripts/register-node.ts manage.ts backfill create-user --target production -- admin@example.com --role admin
  node --import ./scripts/register-node.ts manage.ts backfill registration-stats --target staging --dry-run

Each backfill is a root-level folder:

  src/platform/jobs/backfills/<name>/index.ts

It must default export defineBackfill({ description, run, usage? }).`);
}

function printBackfills(backfills: Map<string, LoadedBackfill>) {
  const width = Math.max(...[...backfills.keys()].map((name) => name.length), 4);

  for (const backfill of backfills.values()) {
    console.log(`${backfill.name.padEnd(width)}  ${backfill.description}`);
  }
}

function printBackfill(backfill: LoadedBackfill) {
  console.log(backfill.name);
  console.log(`  ${backfill.description}`);

  if (backfill.usage !== undefined) {
    console.log(`  Usage: ${backfill.usage}`);
  }
}

export async function main(argv: string[]): Promise<number> {
  const separator = argv.indexOf("--");
  const managerArgv = separator === -1 ? argv : argv.slice(0, separator);
  const backfillArgs = separator === -1 ? [] : argv.slice(separator + 1);

  try {
    const { values, positionals } = parseArgs({
      args: managerArgv,
      allowPositionals: true,
      options: {
        target: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    });

    const command = positionals[0];

    if (command === undefined) {
      printHelp();
      return values.help ? 0 : 2;
    }

    const backfills = await loadBackfills();

    if (command === "list") {
      if (positionals.length > 1 || backfillArgs.length > 0) {
        throw new CliError("manage: list does not accept arguments");
      }

      printBackfills(backfills);
      return 0;
    }

    if (command === "help") {
      const requested = positionals[1];

      if (requested === undefined) {
        printHelp();
        return 0;
      }

      const backfill = backfills.get(backfillName(requested));

      if (backfill === undefined) {
        throw new CliError(`manage: unknown backfill: ${requested}`);
      }

      printBackfill(backfill);
      return 0;
    }

    const requested =
      command === "backfill"
        ? positionals[1]
        : (() => {
            if (positionals.length > 1) {
              throw new CliError(
                `manage: unexpected argument "${positionals[1]}"; pass backfill arguments after --`,
              );
            }

            return command;
          })();

    if (requested === undefined) {
      throw new CliError("manage: backfill name is required");
    }

    if (command === "backfill" && positionals.length > 2) {
      throw new CliError("manage: only one backfill name is accepted; use -- for its arguments");
    }

    const backfill = backfills.get(backfillName(requested));

    if (backfill === undefined) {
      throw new CliError(
        `manage: unknown backfill: ${requested}\nRun "node --import ./scripts/register-node.ts manage.ts list".`,
      );
    }

    if (values.help) {
      printBackfill(backfill);
      return 0;
    }

    const context: BackfillContext = {
      target: values.target,
      dryRun: values["dry-run"],
      log: (message: string): void => {
        console.log(message);
      },
    };
    await backfill.run(context, backfillArgs);
    return 0;
  } catch (error) {
    if (error instanceof CommandError || error instanceof CliError) {
      console.error(`manage: ${error.message}`);
      return error.exitCode;
    }

    if (error instanceof Error && error.name === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      console.error(`manage: ${error.message}`);
      return 2;
    }

    if (error instanceof Error) {
      console.error(`manage: ${error.message}`);
      return 1;
    }

    throw error;
  }
}
