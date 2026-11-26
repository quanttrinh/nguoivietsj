#!/usr/bin/env node
/**
 * Database management for the NguoiVietSJ event engine.
 *
 * Run `node manage.ts --help` for the command list.
 */

import { exit } from "node:process";

import { main } from "./src/platform/jobs/tooling/manage/cli.ts";

exit(await main(process.argv.slice(2)));
