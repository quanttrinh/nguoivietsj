async function callScript<T>(
  functionName: string,
  userObject: any = null,
  ...parameters: any[]
): Promise<T> {
  return new Promise((resolve, reject) => {
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
