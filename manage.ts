#!/usr/bin/env bun
/**
 * Database management for the NguoiVietSJ event engine.
 *
 * Run `bun manage.ts --help` for the command list.
 */

import { exit } from "node:process";

import { main } from "./tooling/manage/cli";

exit(await main(process.argv.slice(2)));
