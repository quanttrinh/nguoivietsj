interface RegistrationRuntime {
  init: () => void;
  mount: (root: HTMLElement) => Promise<void>;
}
let runtimePromise: Promise<RegistrationRuntime> | null = null;
export function registrationRuntime(): Promise<RegistrationRuntime> {
  runtimePromise ??= Promise.all([
    import("~/shared/client/qui-public"),
    import("~/shared/client/turnstile"),
    import("~/events/registration/islands/registration"),
  ]).then(([, turnstile, registration]) => ({
    init: registration.initEngineRegistrationForm,
    mount: turnstile.mountTurnstileWidgets,
  }));
  return runtimePromise;
}
