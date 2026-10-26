#!/usr/bin/env bun
/* oxlint-disable typescript/no-unsafe-type-assertion -- wrangler.jsonc is validated by jsonc-parser. */
/**
 * Cloudflare deployment helper.
 *
 * Commands:
 *   sync          Copy non-secret OpenTofu outputs into wrangler.jsonc.
 *   secrets       Push the Worker secrets in one `wrangler secret bulk` request.
 *   push-doppler  Copy generated secrets from OpenTofu into Doppler.
 *   apply         Run `sync` and then `secrets`.
 *
 * Run secret handling through Doppler so the values and Cloudflare credentials
 * are available:
 *
 *   doppler run -- bun scripts/infra.ts apply --env staging
 */

import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from "jsonc-parser";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_CONFIG = path.join(ROOT, "wrangler.jsonc");
const DEFAULT_TERRAFORM_DIR = path.join(ROOT, "infra", "cloudflare");
const WRANGLER_BIN = path.join(ROOT, "node_modules", ".bin", "wrangler");
const DOPPLER_PROJECT = "web";
const DOPPLER_CONFIGS: Record<Environment, string> = { staging: "stg", production: "prd" };
const FORMATTING_OPTIONS = { insertSpaces: true, tabSize: 2, eol: "\n" };

/** Secrets shared by both email providers. */
const SHARED_SECRETS = ["BETTER_AUTH_SECRET"] as const;

/** Provider-specific secrets. The inactive provider is kept when present. */
const PROVIDER_SECRETS = {
  gmail: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
  mailtrap: ["MAILTRAP_API_TOKEN"],
} as const;

type EmailProvider = keyof typeof PROVIDER_SECRETS;

function emailProvider(): EmailProvider {
  // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- generated Env narrows EMAIL_PROVIDER to a literal.
  const value = String(process.env.EMAIL_PROVIDER);
  return value === "mailtrap" ? "mailtrap" : "gmail";
}

type Command = "sync" | "secrets" | "push-doppler" | "apply";
type Environment = "staging" | "production";

interface SyncOptions {
  check: boolean;
  config: string;
  terraformDir: string;
  tofu: string;
}

interface D1Binding {
  binding?: string;
  database_name?: string;
  database_id?: string;
}

interface KvBinding {
  binding?: string;
  id?: string;
}

interface WranglerEnvironment {
  vars?: Record<string, unknown>;
  d1_databases?: D1Binding[];
  kv_namespaces?: KvBinding[];
}

interface WranglerConfig extends WranglerEnvironment {
  env?: Record<string, WranglerEnvironment>;
}

interface Change {
  path: (string | number)[];
  value: string;
  label: string;
}

interface Options {
  check?: boolean;
  env?: string;
  config?: string;
  "terraform-dir"?: string;
  tofu?: string;
  help?: boolean;
}

function fail(message: string): never {
  console.error(`cloudflare: ${message}`);
  process.exit(1);
}

function printHelp(): void {
  console.log(`Usage: bun scripts/infra.ts <command> [options]

Commands:
  sync          Copy non-secret OpenTofu outputs into wrangler.jsonc.
  secrets       Push TURNSTILE_SECRET, BETTER_AUTH_SECRET, and the active email
                provider secrets to the Worker in one bulk request.
  push-doppler  Copy generated OpenTofu secrets (currently TURNSTILE_SECRET)
                into the matching Doppler config (staging -> stg, production -> prd).
  apply         Run \`sync\`, then \`secrets\`.

Options:
  --check                Report wrangler.jsonc drift without writing (sync only).
  --env <name>           staging or production (default: production).
  --config <path>        wrangler.jsonc path (default: ./wrangler.jsonc).
  --terraform-dir <dir>  OpenTofu working directory (default: infra/cloudflare).
  --tofu <bin>           OpenTofu binary (default: $TOFU_BIN or "tofu").
  -h, --help             Show this help.

Secrets are read from the environment, so run them through Doppler:

  doppler run -- bun scripts/infra.ts secrets --env staging

TURNSTILE_SECRET defaults to \`tofu output -raw turnstile_secret\` and can be
overridden by setting TURNSTILE_SECRET. Only allowlisted secrets are sent.

The email provider is selected by EMAIL_PROVIDER (default: gmail).`);
}

function parseEnvironment(value: string | undefined): Environment {
  if (value === undefined) {
    return "production";
  }

  if (value !== "staging" && value !== "production") {
    fail(`unknown environment: ${value} (expected staging or production)`);
  }

  return value;
}

function parseCommand(argv: string[]): Command {
  const command = argv[0];

  if (
    command === "sync" ||
    command === "secrets" ||
    command === "push-doppler" ||
    command === "apply"
  ) {
    return command;
  }

  return fail(`unknown command: ${command ?? "(none)"}`);
}

function parseOptions(argv: string[]): Options {
  try {
    return parseArgs({
      args: argv,
      options: {
        check: { type: "boolean" },
        env: { type: "string" },
        config: { type: "string" },
        "terraform-dir": { type: "string" },
        tofu: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
      strict: true,
    }).values;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function printError(error: unknown): number {
  console.error(error instanceof Error ? error.message : String(error));
  return 1;
}

interface ProcessOptions {
  cwd?: string;
  input?: string;
  inheritOutput?: boolean;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  status: number;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runProcess(
  command: string,
  args: string[],
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  // oxlint-disable-next-line promise/avoid-new -- child processes report completion through callbacks.
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: [
        options.input === undefined ? "ignore" : "pipe",
        options.inheritOutput === true ? "inherit" : "pipe",
        options.inheritOutput === true ? "inherit" : "pipe",
      ],
    });
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
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ stdout, stderr, status: status ?? 1 });
    });

    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    }
  });
}

function parseConfig(text: string): WranglerConfig {
  const errors: ParseError[] = [];
  const parsed = parse(text, errors, { allowTrailingComma: true }) as WranglerConfig;

  if (errors.length > 0) {
    const [first] = errors;
    const detail = first === undefined ? "unknown error" : printParseErrorCode(first.error);
    throw new Error(`Invalid wrangler.jsonc at offset ${first?.offset ?? 0}: ${detail}`);
  }

  return parsed;
}

function outputValue(outputs: Record<string, unknown>, name: string): string | undefined {
  const entry = outputs[name];

  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }

  const value = (entry as { value?: unknown }).value;
  return typeof value === "string" && value !== "" ? value : undefined;
}

async function readOutputs(tofu: string, terraformDir: string): Promise<Record<string, unknown>> {
  const command = [tofu, `-chdir=${terraformDir}`, "output", "-json"];
  let result: ProcessResult;

  try {
    result = await runProcess(tofu, command.slice(1), { cwd: ROOT });
  } catch (error) {
    throw new Error(
      `could not run ${tofu}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(`${command.join(" ")} failed${detail === "" ? "" : `:\n${detail}`}`);
  }

  const parsed: unknown = JSON.parse(result.stdout);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("OpenTofu output was not a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function findBinding(
  items: { binding?: string }[] | undefined,
  binding: string,
  label: string,
): number {
  const index = items?.findIndex((item) => item.binding === binding) ?? -1;

  if (index === -1) {
    throw new Error(`No binding named '${binding}' in ${label}.`);
  }

  return index;
}

function optionalSecret(name: string): string | undefined {
  return process.env[name];
}

function buildChanges(config: WranglerConfig, outputs: Record<string, unknown>): Change[] {
  const changes: Change[] = [];
  const siteKey = outputValue(outputs, "turnstile_site_key");

  if (siteKey !== undefined) {
    changes.push(
      {
        path: ["vars", "TURNSTILE_SITE_KEY"],
        value: siteKey,
        label: "vars.TURNSTILE_SITE_KEY",
      },
      {
        path: ["env", "staging", "vars", "TURNSTILE_SITE_KEY"],
        value: siteKey,
        label: "env.staging.vars.TURNSTILE_SITE_KEY",
      },
    );
  }

  const databases = [
    {
      environment: "production",
      nameOutput: "app_db_name",
      idOutput: "app_db_id",
      binding: "APP_DB",
    },
    {
      environment: "production",
      nameOutput: "events_db_name",
      idOutput: "events_db_id",
      binding: "EVENT_ENGINE_DB",
    },
    {
      environment: "staging",
      nameOutput: "staging_app_db_name",
      idOutput: "staging_app_db_id",
      binding: "APP_DB",
    },
    {
      environment: "staging",
      nameOutput: "staging_events_db_name",
      idOutput: "staging_events_db_id",
      binding: "EVENT_ENGINE_DB",
    },
  ] as const;

  for (const database of databases) {
    const databaseName = outputValue(outputs, database.nameOutput);
    const databaseId = outputValue(outputs, database.idOutput);

    if (databaseName !== undefined || databaseId !== undefined) {
      const basePath: (string | number)[] =
        database.environment === "staging" ? ["env", "staging", "d1_databases"] : ["d1_databases"];
      const items =
        database.environment === "staging"
          ? config.env?.staging?.d1_databases
          : config.d1_databases;
      const index = findBinding(items, database.binding, basePath.join("."));

      if (databaseName !== undefined) {
        changes.push({
          path: [...basePath, index, "database_name"],
          value: databaseName,
          label: `${basePath.join(".")}[${index}].database_name (${database.binding})`,
        });
      }

      if (databaseId !== undefined) {
        changes.push({
          path: [...basePath, index, "database_id"],
          value: databaseId,
          label: `${basePath.join(".")}[${index}].database_id (${database.binding})`,
        });
      }
    }
  }

  const kvNamespaces = [
    { environment: "production", idOutput: "auth_kv_id", binding: "AUTH_SESSION_KV" },
    { environment: "staging", idOutput: "staging_auth_kv_id", binding: "AUTH_SESSION_KV" },
  ] as const;

  for (const namespace of kvNamespaces) {
    const namespaceId = outputValue(outputs, namespace.idOutput);

    if (namespaceId !== undefined) {
      const basePath: (string | number)[] =
        namespace.environment === "staging"
          ? ["env", "staging", "kv_namespaces"]
          : ["kv_namespaces"];
      const items =
        namespace.environment === "staging"
          ? config.env?.staging?.kv_namespaces
          : config.kv_namespaces;
      const index = findBinding(items, namespace.binding, basePath.join("."));

      changes.push({
        path: [...basePath, index, "id"],
        value: namespaceId,
        label: `${basePath.join(".")}[${index}].id (${namespace.binding})`,
      });
    }
  }

  return changes;
}

function applyChanges(text: string, changes: Change[]): { updated: string; labels: string[] } {
  let updated = text;
  const labels: string[] = [];

  for (const change of changes) {
    const edits = modify(updated, change.path, change.value, {
      formattingOptions: FORMATTING_OPTIONS,
    });
    const next = applyEdits(updated, edits);

    if (next !== updated) {
      updated = next;
      labels.push(change.label);
    }
  }

  return { updated, labels: labels.toSorted() };
}

function displayPathFor(filePath: string): string {
  const relative = path.relative(ROOT, filePath);
  return relative.startsWith("..") ? filePath : relative || filePath;
}

async function sync(options: SyncOptions): Promise<number> {
  if (!(await fileExists(options.config))) {
    console.error(`Config file not found: ${options.config}`);
    return 1;
  }

  if (!(await fileExists(options.terraformDir))) {
    console.error(`OpenTofu directory not found: ${options.terraformDir}`);
    return 1;
  }

  try {
    const outputs = await readOutputs(options.tofu, options.terraformDir);
    const original = await readFile(options.config, "utf8");
    const config = parseConfig(original);
    const changes = buildChanges(config, outputs);
    const { updated, labels } = applyChanges(original, changes);
    const displayPath = displayPathFor(options.config);

    if (updated === original) {
      console.log(`${displayPath} is up to date.`);
      return 0;
    }

    if (options.check) {
      console.error(`${displayPath} is out of date:`);

      for (const label of labels) {
        console.error(`  - ${label}`);
      }

      console.error("Run `bun scripts/infra.ts sync` to update it.");
      return 1;
    }

    await writeFile(options.config, updated, "utf8");
    console.log(`Updated ${displayPath}:`);

    for (const label of labels) {
      console.log(`  - ${label}`);
    }

    return 0;
  } catch (error) {
    return printError(error);
  }
}

function requireSecret(name: string): string {
  const value = optionalSecret(name);

  if (value === undefined || value === "") {
    throw new Error(`${name} is not set`);
  }

  return value;
}

async function readTurnstileSecret(tofu: string): Promise<string> {
  const override = optionalSecret("TURNSTILE_SECRET");

  if (override !== undefined && override !== "") {
    return override;
  }

  let result: ProcessResult;

  try {
    result = await runProcess(
      tofu,
      [`-chdir=${DEFAULT_TERRAFORM_DIR}`, "output", "-raw", "turnstile_secret"],
      { cwd: ROOT },
    );
  } catch (error) {
    throw new Error(
      `could not run ${tofu}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (result.status !== 0) {
    throw new Error("tofu output turnstile_secret failed");
  }

  if (result.stdout === "") {
    throw new Error("TURNSTILE_SECRET is empty");
  }

  return result.stdout;
}

async function pushDoppler(environment: Environment, tofu: string): Promise<number> {
  try {
    const secret = await readTurnstileSecret(tofu);
    const directory = await mkdtemp(path.join(tmpdir(), "nguoivietsj-doppler-"));
    const file = path.join(directory, "secrets.json");

    try {
      await writeFile(file, JSON.stringify({ TURNSTILE_SECRET: secret }), { mode: 0o600 });
      let result: ProcessResult;

      try {
        result = await runProcess(
          process.env.DOPPLER_BIN ?? "doppler",
          [
            "secrets",
            "upload",
            file,
            "--project",
            DOPPLER_PROJECT,
            "--config",
            DOPPLER_CONFIGS[environment],
            "--silent",
          ],
          { cwd: ROOT, inheritOutput: true },
        );
      } catch (error) {
        throw new Error(
          `could not run doppler: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      if (result.status !== 0) {
        return result.status;
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }

    console.log(
      `Generated secrets stored in Doppler ${DOPPLER_PROJECT}/${DOPPLER_CONFIGS[environment]}`,
    );
    return 0;
  } catch (error) {
    return printError(error);
  }
}

async function pushSecrets(environment: Environment, tofu: string): Promise<number> {
  if (!(await fileExists(WRANGLER_BIN))) {
    console.error("wrangler is not installed; run `bun install` first");
    return 1;
  }

  if (optionalSecret("CLOUDFLARE_API_TOKEN") === undefined) {
    console.error("CLOUDFLARE_API_TOKEN is required; run this through Doppler.");
    return 1;
  }

  try {
    // Validate every secret before sending anything so a typo cannot leave the
    // Worker with a partial update.
    const secrets: Record<string, string> = {};
    const provider = emailProvider();

    for (const name of [...PROVIDER_SECRETS[provider], ...SHARED_SECRETS]) {
      secrets[name] = requireSecret(name);
    }

    // Keep the inactive provider's token when it is available so switching
    // EMAIL_PROVIDER later does not require a second secret push.
    const inactiveProvider: EmailProvider = provider === "gmail" ? "mailtrap" : "gmail";
    for (const name of PROVIDER_SECRETS[inactiveProvider]) {
      const value = optionalSecret(name);

      if (value !== undefined && value !== "") {
        secrets[name] = value;
      }
    }

    secrets.TURNSTILE_SECRET = await readTurnstileSecret(tofu);

    const wranglerArgs = ["secret", "bulk"];

    if (environment === "staging") {
      wranglerArgs.push("--env", "staging");
    }

    let result: ProcessResult;

    try {
      result = await runProcess(WRANGLER_BIN, wranglerArgs, {
        cwd: ROOT,
        input: JSON.stringify(secrets),
        inheritOutput: true,
      });
    } catch (error) {
      throw new Error(
        `could not run wrangler: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (result.status !== 0) {
      return result.status;
    }

    console.log(`Worker secrets stored for ${environment}`);
    return 0;
  } catch (error) {
    return printError(error);
  }
}

const argv = process.argv.slice(2);

if (argv[0] === undefined || argv[0] === "-h" || argv[0] === "--help") {
  printHelp();
  process.exit(argv[0] === undefined ? 1 : 0);
}

const command = parseCommand(argv);
const values = parseOptions(argv.slice(1));

if (values.help === true) {
  printHelp();
  process.exit(0);
}

const environment = parseEnvironment(values.env);

if (command === "sync" && values.env !== undefined) {
  fail("sync does not accept --env");
}

if (
  (command === "secrets" || command === "push-doppler") &&
  (values.check === true ||
    values.config !== undefined ||
    values["terraform-dir"] !== undefined ||
    values.tofu !== undefined)
) {
  fail(`${command} only accepts --env`);
}

if (command === "apply" && values.check === true) {
  fail("apply does not accept --check");
}

const syncOptions: SyncOptions = {
  check: values.check === true,
  config: values.config ?? DEFAULT_CONFIG,
  terraformDir: values["terraform-dir"] ?? DEFAULT_TERRAFORM_DIR,
  tofu: values.tofu ?? process.env.TOFU_BIN ?? "tofu",
};

let exitCode = 0;

if (command === "sync" || command === "apply") {
  exitCode = await sync(syncOptions);
}

if (exitCode === 0 && (command === "secrets" || command === "apply")) {
  exitCode = await pushSecrets(environment, syncOptions.tofu);
}

if (exitCode === 0 && command === "push-doppler") {
  exitCode = await pushDoppler(environment, syncOptions.tofu);
}

process.exit(exitCode);
