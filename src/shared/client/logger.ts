// @boundary client
/* oxlint-disable eslint/no-console -- this module is the browser-side sink for unexpected errors. */
export const clientLogger = {
  error: (error: unknown, context?: string): void => {
    if (context === undefined) {
      console.error(error);
      return;
    }

    console.error(context, error);
  },
  info: (message: string, context?: string): void => {
    if (context === undefined) {
      console.info(message);
    } else {
      console.info(context, message);
    }
  },
  warn: (message: string, context?: string): void => {
    if (context === undefined) {
      console.warn(message);
    } else {
      console.warn(context, message);
    }
  },
};
