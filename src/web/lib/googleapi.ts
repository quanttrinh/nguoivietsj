async function callScript<T>(
  functionName: string,
  userObject: any = null,
  ...parameters: any[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    (window as any).google.script.run
      .withUserObject(userObject)
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      [functionName](...parameters);
  });
}

export { callScript };
