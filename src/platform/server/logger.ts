// @boundary server
export const serverLogger = {
  debug: (message: string, context?: unknown): void => {
    if (context === undefined) {
      console.debug(message);
      return;
    }

    console.debug(context, message);
  },
  error: (error: unknown, context?: unknown): void => {
    if (context === undefined) {
      console.error(error);
      return;
    }

    console.error(context, error);
  },
  info: (message: string, context?: unknown): void => {
    if (context === undefined) {
      console.info(message);
    } else {
      console.info(context, message);
    }
  },
  warn: (message: string, context?: unknown): void => {
    if (context === undefined) {
      console.warn(message);
    } else {
      console.warn(context, message);
    }
  },
};
