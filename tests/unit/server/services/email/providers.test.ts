import { describe, expect, test, vi } from "vitest";

import {
  createEmailRegistry,
  registeredEmailProviders,
  resolveEmailProvider,
} from "~/platform/server/email/providers";
import {
  EmailError,
  type EmailCapabilities,
  type EmailProvider,
} from "~/platform/server/email/types";

import { expectEmailError } from "../../../helpers/email";

const ALL_CAPABILITIES: EmailCapabilities = {
  templates: true,
  direct: true,
  attachments: true,
};

function provider(name: string, capabilities: EmailCapabilities = ALL_CAPABILITIES): EmailProvider {
  return {
    name,
    capabilities,
    isConfigured: vi.fn<EmailProvider["isConfigured"]>().mockReturnValue(true),
    send: vi.fn<EmailProvider["send"]>().mockResolvedValue(undefined),
  };
}

describe("createEmailRegistry", () => {
  test("registers providers and lists them in registration order", () => {
    const registry = createEmailRegistry();
    const first = provider("first");
    const second = provider("second");

    registry.register(first);
    registry.register(second);

    expect(registry.all()).toEqual([first, second]);
  });

  test("returns the sole provider when no selector is set", () => {
    const registry = createEmailRegistry();
    const only = provider("only");

    registry.register(only);

    expect(registry.resolve({})).toBe(only);
  });

  test("honours an explicit provider selector", () => {
    const registry = createEmailRegistry();
    const first = provider("first");
    const second = provider("second");
    registry.register(first);
    registry.register(second);

    expect(registry.resolve({ EMAIL_PROVIDER: "second" })).toBe(second);
  });

  test("throws a clear error for an unknown selected provider", () => {
    const registry = createEmailRegistry();
    registry.register(provider("known"));

    expectEmailError(() => {
      registry.resolve({ EMAIL_PROVIDER: "missing" });
    }, "email_provider_unknown: missing");
  });

  test("throws an ambiguous error when no provider is registered", () => {
    const registry = createEmailRegistry();

    expectEmailError(() => {
      registry.resolve({});
    }, "email_provider_ambiguous: ");
  });

  test("throws an ambiguous error listing names when several providers are registered", () => {
    const registry = createEmailRegistry();
    registry.register(provider("alpha"));
    registry.register(provider("beta"));

    expectEmailError(() => {
      registry.resolve({});
    }, "email_provider_ambiguous: alpha, beta");
  });

  test("rejects a duplicate name registered with a different object", () => {
    const registry = createEmailRegistry();
    registry.register(provider("same"));

    expectEmailError(() => {
      registry.register(provider("same"));
    }, "email_provider_duplicate: same");
    expect(registry.all()).toHaveLength(1);
  });

  test("accepts re-registering the same provider object", () => {
    const registry = createEmailRegistry();
    const existing = provider("same");
    registry.register(existing);

    expect(() => {
      registry.register(existing);
    }).not.toThrow();
    expect(registry.all()).toEqual([existing]);
  });
});

describe("default registry helpers", () => {
  test("exposes the shared registry through read-only helpers", () => {
    expect(Array.isArray(registeredEmailProviders())).toBe(true);
    expect(() => {
      resolveEmailProvider({ EMAIL_PROVIDER: "definitely-not-registered" });
    }).toThrow(EmailError);
  });
});
