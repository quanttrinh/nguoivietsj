// @boundary server
import { EmailError, type EmailEnv, type EmailProvider } from "./types";

export interface EmailRegistry {
  register: (provider: EmailProvider) => void;
  resolve: (env: EmailEnv) => EmailProvider;
  all: () => readonly EmailProvider[];
}

/** Build an isolated provider registry (useful for tests and custom runtimes). */
export function createEmailRegistry(): EmailRegistry {
  const providers = new Map<string, EmailProvider>();

  return {
    register(provider: EmailProvider): void {
      const existing = providers.get(provider.name);
      if (existing !== undefined && existing !== provider) {
        throw new EmailError(`email_provider_duplicate: ${provider.name}`, 0, false);
      }
      providers.set(provider.name, provider);
    },
    resolve(env: EmailEnv): EmailProvider {
      const selected = env.EMAIL_PROVIDER;
      if (selected !== undefined) {
        const provider = providers.get(selected);
        if (provider === undefined) {
          throw new EmailError(`email_provider_unknown: ${selected}`, 0, false);
        }
        return provider;
      }

      const registered = [...providers.values()];
      const only = registered.length === 1 ? registered[0] : undefined;
      if (only !== undefined) {
        return only;
      }

      throw new EmailError(
        `email_provider_ambiguous: ${[...providers.keys()].join(", ")}`,
        0,
        false,
      );
    },
    all(): readonly EmailProvider[] {
      return [...providers.values()];
    },
  };
}

/** Default registry shared by the generic email layer. */
export const emailRegistry = createEmailRegistry();

export function registerEmailProvider(provider: EmailProvider): void {
  emailRegistry.register(provider);
}

export function registeredEmailProviders(): readonly EmailProvider[] {
  return emailRegistry.all();
}

export function resolveEmailProvider(env: EmailEnv): EmailProvider {
  return emailRegistry.resolve(env);
}
