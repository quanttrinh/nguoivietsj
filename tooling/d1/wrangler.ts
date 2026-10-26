import { spawn } from "node:child_process";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { CommandError } from "../manage/errors";
import { ROOT, databaseName, wranglerArgs, type TargetConfig } from "./config";

function quoteArg(arg: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/u.test(arg) ? arg : JSON.stringify(arg);
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(name: string): Promise<string | null> {
  const candidates = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter((directory) => directory.length > 0)
    .map((directory) => path.join(directory, name));
  const matches = await Promise.all(
    candidates.map(async (candidate) => ((await isExecutable(candidate)) ? candidate : null)),
  );

  return matches.find((match) => match !== null) ?? null;
}

export async function wranglerCommand(): Promise<string[]> {
  const local = path.join(ROOT, "node_modules", ".bin", "wrangler");
  if (await isExecutable(local)) {
    return [local];
  }

  const installed = await findExecutable("wrangler");
  if (installed !== null) {
    return [installed];
  }

  const runners = await Promise.all(
    ["bunx", "npx"].map(async (runner) => {
      const executable = await findExecutable(runner);
      return executable === null ? null : [executable, "wrangler"];
    }),
  );
  const runner = runners.find((candidate): candidate is string[] => candidate !== null);

  if (runner !== undefined) {
    return runner;
  }

  throw new Error("Wrangler is not installed. Run `bun install` first.");
}

function spawnChild(command: string[], stdio: "inherit" | "pipe"): ReturnType<typeof spawn> {
  return spawn(command[0] ?? "", command.slice(1), {
    cwd: ROOT,
    stdio,
  });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  // oxlint-disable-next-line promise/avoid-new -- `child-process` reports exit through callbacks.
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

export async function run(command: string[]): Promise<void> {
  console.log(`+ ${command.map((part) => quoteArg(part)).join(" ")}`);
  const child = spawnChild(command, "inherit");
  const exitCode = await waitForExit(child);
  if (exitCode !== 0) {
    throw new CommandError(
      `command failed: ${command.map((part) => quoteArg(part)).join(" ")}`,
      exitCode,
    );
  }
}

export async function runQuiet(command: string[], log = true): Promise<string> {
  if (log) {
    console.log(`+ ${command.map((part) => quoteArg(part)).join(" ")}`);
  }

  const child = spawnChild(command, "pipe");
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await waitForExit(child);

  if (exitCode !== 0) {
    if (stdout.length > 0) {
      process.stderr.write(stdout);
    }
    if (stderr.length > 0) {
      process.stderr.write(stderr);
    }
    throw new CommandError(
      `command failed: ${command.map((part) => quoteArg(part)).join(" ")}`,
      exitCode,
    );
  }

  return stdout;
}

export async function runWrangler(target: TargetConfig, args: string[]): Promise<void> {
  await run([...(await wranglerCommand()), ...args, ...wranglerArgs(target)]);
}

// oxlint-disable-next-line eslint/max-params -- target, database, filename, and SQL are all required.
export async function runWranglerFile(
  target: TargetConfig,
  database: "app" | "events",
  name: string,
  sql: string,
): Promise<void> {
  const wranglerDir = path.join(ROOT, ".wrangler");
  await mkdir(wranglerDir, { recursive: true });
  const filePath = path.join(wranglerDir, name);
  await writeFile(filePath, sql);
  try {
    await runQuiet([
      ...(await wranglerCommand()),
      "d1",
      "execute",
      databaseName(target, database),
      "--file",
      filePath,
      ...wranglerArgs(target),
    ]);
  } finally {
    await unlink(filePath);
  }
}
