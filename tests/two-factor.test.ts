import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, test } from "vitest";

import { authPlugins, baseAuthConfig } from "../src/auth/server/config";
import { hashPassword } from "../src/auth/server/password";

const PASSWORD = "correct horse battery";
const BASE_URL = "http://localhost:4321";

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

// oxlint-disable-next-line typescript/explicit-function-return-type -- infer the concrete test auth instance.
function createTestAuth(sent: string[]) {
  return betterAuth({
    ...baseAuthConfig,
    rateLimit: { enabled: false },
    session: { ...baseAuthConfig.session, storeSessionInDatabase: true },
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      twoFactor: [],
      rateLimit: [],
    }),
    secret: "test-secret-test-secret-test-secret",
    baseURL: BASE_URL,
    plugins: authPlugins(({ otp }) => {
      sent.push(otp);
    }),
  });
}

// oxlint-disable-next-line typescript/explicit-function-return-type -- infer the concrete test auth instance.
async function setup() {
  const sent: string[] = [];
  const auth = createTestAuth(sent);

  const context = await auth.$context;
  const email = "staff@example.com";
  const user = await context.internalAdapter.createUser(
    {
      email,
      name: "Staff",
      emailVerified: true,
      role: "event_staff",
      twoFactorEnabled: true,
    },
    { method: "admin" },
  );

  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await hashPassword(PASSWORD),
  });

  return { auth, sent, email };
}

describe("two-factor sign-in", () => {
  test("requires a second step and accepts an emailed code", async () => {
    const { auth, sent, email } = await setup();
    const signIn = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      asResponse: true,
    });
    const body: unknown = await signIn.json();

    expect(body).toMatchObject({ twoFactorRedirect: true });

    const headers = new Headers({ cookie: cookieHeader(signIn), origin: BASE_URL });

    await auth.api.sendTwoFactorOTP({ headers, body: {} });
    expect(sent).toHaveLength(1);

    const wrong = await auth.api.verifyTwoFactorOTP({
      headers,
      body: { code: sent[0] === "000000" ? "111111" : "000000" },
      asResponse: true,
    });
    expect(wrong.status).toBe(401);

    const verified = await auth.api.verifyTwoFactorOTP({
      headers,
      body: { code: sent[0] ?? "" },
      asResponse: true,
    });
    expect(verified.status).toBe(200);
    expect(cookieHeader(verified)).toContain("session_token");
  });
});
