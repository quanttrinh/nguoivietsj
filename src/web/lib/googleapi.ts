import type { ServerApi } from '~/server/index';

type ServerCallableKeys = {
  [K in keyof ServerApi]: ServerApi[K] extends (...args: any[]) => any ? K : never;
}[keyof ServerApi];

async function callScript<K extends ServerCallableKeys>(
  functionName: K,
  userObject: any = null,
  ...parameters: Parameters<ServerApi[K]>
): Promise<Awaited<ReturnType<ServerApi[K]>>> {
  return new Promise<Awaited<ReturnType<ServerApi[K]>>>((resolve, reject) => {
    (window as any).google.script.run
      .withUserObject(userObject)
      .withSuccessHandler(resolve)
      .withFailureHandler((error: Error) => {
        error.message = error.message.substring(7); // Remove "Error: " prefix
        reject(error);
      })
      [functionName](...parameters);
  });
}

export { callScript };
