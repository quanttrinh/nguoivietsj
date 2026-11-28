// @boundary server
import type { Logger } from "drizzle-orm";

import { serverLogger } from "~/platform/server/logger";

const isDev = import.meta.env.DEV;

/**
 * Drizzle query logger shared by both D1 databases.
 *
 * Bound parameter values are only logged in development because they can
 * contain registration PII and authentication data.
 */
export const drizzleLogger: Logger = {
  logQuery(query, params) {
    // Production logging is handled by Workers Observability. Logging every
    // D1 query here burned the daily log-event quota and could include PII.
    if (!isDev) {
      return;
    }

    serverLogger.debug("[drizzle]", { query, params });
  },
};
