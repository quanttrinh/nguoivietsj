// @boundary server
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { CommandError } from "../manage/errors";
import { ROOT } from "../root";
import { databaseFor, wranglerArgs, type TargetConfig } from "./config";

const SHELL_SAFE = new Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_./:=+-");

/**
 * Format an argument for logs only. Commands are spawned without a shell, so
 * this is never relied on for execution safety; escaping newlines/control
 * characters just keeps command traces unambiguous.
 */
function displayArg(arg: string) {
  return arg.split("").every((char) => SHELL_SAFE.has(char)) ? arg : JSON.stringify(arg);
}

async function isExecutable(filePath: string) {
  try {
    await access(filePath, constants.X_OK);
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function findExecutable(name: string) {
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
    ["yarn", "npx"].map(async (runner) => {
      const executable = await findExecutable(runner);
      return executable === null ? null : [executable, "wrangler"];
    }),
  );
  const runner = runners.find((candidate): candidate is string[] => candidate !== null);

  if (runner !== undefined) {
    return runner;
  }

  throw new Error("Wrangler is not installed. Run `yarn install` first.");
}

function spawnChild(command: string[], stdio: "inherit" | "pipe"): ReturnType<typeof spawn> {
  const [executable, ...args] = command;
  if (executable === undefined) {
    throw new Error("Cannot run an empty command.");
  }

  return spawn(executable, args, {
    cwd: ROOT,
    shell: false,
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
  console.log(`+ ${command.map((part) => displayArg(part)).join(" ")}`);
  const child = spawnChild(command, "inherit");
  const exitCode = await waitForExit(child);
  if (exitCode !== 0) {
    throw new CommandError(
      `command failed: ${command.map((part) => displayArg(part)).join(" ")}`,
      exitCode,
    );
  }
}

export async function runQuiet(command: string[], log = true): Promise<string> {
  if (log) {
    console.log(`+ ${command.map((part) => displayArg(part)).join(" ")}`);
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
      `command failed: ${command.map((part) => displayArg(part)).join(" ")}`,
      exitCode,
    );
  }

  return stdout;
}

export async function runWrangler(target: TargetConfig, args: string[]): Promise<void> {
  await run([...(await wranglerCommand()), ...args, ...wranglerArgs(target)]);
}

// oxlint-disable-next-line eslint/max-params -- target, binding, filename, and SQL are all required.
export async function runWranglerFile(
  target: TargetConfig,
  binding: string,
  name: string,
  sql: string,
): Promise<void> {
  const wranglerDir = path.join(ROOT, ".wrangler");
  await mkdir(wranglerDir, { recursive: true });
  // A fresh 0700 directory avoids collisions and symlink attacks on a
  // predictable filename, and keeps the SQL (which may include user data)
  // unreadable to other local users.
  const tempDir = await mkdtemp(path.join(wranglerDir, "backfill-"));
  const filePath = path.join(tempDir, path.basename(name));
  try {
    await writeFile(filePath, sql, { mode: 0o600 });
    await runQuiet([
      ...(await wranglerCommand()),
      "d1",
      "execute",
      databaseFor(target, binding).name,
      "--file",
      filePath,
      ...wranglerArgs(target),
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
