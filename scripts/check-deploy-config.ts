#!/usr/bin/env bun
/* oxlint-disable typescript/no-unsafe-type-assertion -- Wrangler configuration is read at this tooling boundary. */
/**
 * Reject a production/staging deploy that still contains the repository
 * placeholders in wrangler.jsonc.
 *
 * Run by the Deploy workflow before building the Worker.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "jsonc-parser";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENV_ARG = process.argv.find((arg) => arg.startsWith("--env="));
const ENV_NAME = ENV_ARG?.slice("--env=".length) ?? "production";

interface WranglerConfig {
  vars?: Record<string, string>;
  d1_databases?: { binding?: string; database_id?: string }[];
  kv_namespaces?: { binding?: string; id?: string }[];
  env?: Record<
    string,
    {
      vars?: Record<string, string>;
      d1_databases?: { binding?: string; database_id?: string }[];
      kv_namespaces?: { binding?: string; id?: string }[];
    }
  >;
}

const config = parse(await readFile(path.join(ROOT, "wrangler.jsonc"), "utf8")) as WranglerConfig;
const environment = ENV_NAME === "production" ? config : config.env?.[ENV_NAME];
const problems: string[] = [];

if (environment === undefined) {
  problems.push(`unknown environment: ${ENV_NAME}`);
} else {
  const vars = environment.vars ?? {};
  const databases = environment.d1_databases ?? [];

  for (const database of databases) {
    if (
      database.binding !== undefined &&
      (database.database_id === undefined || database.database_id.startsWith("00000000-"))
    ) {
      problems.push(`${database.binding} still has a placeholder database_id`);
    }
  }

  for (const namespace of environment.kv_namespaces ?? []) {
    if (
      namespace.binding !== undefined &&
      (namespace.id === undefined || namespace.id.startsWith("00000000-"))
    ) {
      problems.push(`${namespace.binding} still has a placeholder KV id`);
    }
  }

  if (ENV_NAME === "production" && (vars.TURNSTILE_SITE_KEY ?? "").startsWith("1x000000")) {
    problems.push("TURNSTILE_SITE_KEY is still the public test key");
  }

  if (ENV_NAME === "production" && (vars.TURNSTILE_ALLOW_TEST_KEY ?? "").toLowerCase() === "true") {
    problems.push("TURNSTILE_ALLOW_TEST_KEY must be false in production");
  }

  const emailProvider = vars.EMAIL_PROVIDER ?? "gmail";

  if (emailProvider === "gmail") {
    if ((vars.GMAIL_SENDER_EMAIL ?? "").trim().length === 0) {
      problems.push("GMAIL_SENDER_EMAIL is empty; Gmail sending will be disabled");
    }
  } else if (emailProvider === "mailtrap") {
    if ((vars.MAILTRAP_FROM_EMAIL ?? "").trim().length === 0) {
      problems.push("MAILTRAP_FROM_EMAIL is empty; Mailtrap sending will be disabled");
    }
  } else {
    problems.push(`EMAIL_PROVIDER must be gmail or mailtrap, got ${emailProvider}`);
  }
}

if (problems.length > 0) {
  console.error(`Refusing to deploy ${ENV_NAME} with incomplete configuration:`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(`Deploy configuration for ${ENV_NAME} looks complete.`);
