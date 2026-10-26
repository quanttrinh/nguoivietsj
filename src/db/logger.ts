// @boundary server
import { type Logger } from "drizzle-orm";

import { serverLogger } from "~/shared/server/logger";

const isDev = import.meta.env.DEV;

/**
 * Drizzle query logger shared by both D1 databases.
 *
 * Bound parameter values are only logged in development because they can
 * contain registration PII and authentication data.
 */
export const drizzleLogger: Logger = {
  logQuery(query, params) {
    if (isDev) {
      serverLogger.debug("[drizzle]", { query, params });
      return;
    }

    serverLogger.debug("[drizzle]", { query });
  },
};
