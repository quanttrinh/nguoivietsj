import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

interface SessionStorage {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

interface SentOtp {
  email: string;
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
}

type SendOTP = (input: SentOtp) => Promise<void>;

interface CapturedOptions {
  plugins: {
    id: string;
    options?: { sendVerificationOTP?: SendOTP };
  }[];
  secondaryStorage?: SessionStorage;
  secret: string;
  baseURL: unknown;
  basePath: string;
  database: unknown;
}

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn<(options: CapturedOptions) => unknown>(),
  drizzle: vi.fn<(db: unknown, config: unknown) => unknown>(),
  drizzleAdapter: vi.fn<(db: unknown, config: unknown) => unknown>(),
  enqueueTwoFactorCodeEmail: vi.fn<(env: unknown, input: unknown) => Promise<boolean>>(),
  kvGet: vi.fn<(key: string) => Promise<string | null>>(),
  kvPut:
    vi.fn<(key: string, value: string, options?: { expirationTtl: number }) => Promise<void>>(),
  kvDelete: vi.fn<(key: string) => Promise<void>>(),
}));

vi.mock("better-auth/minimal", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("drizzle-orm/d1", () => ({ drizzle: mocks.drizzle }));
vi.mock("@better-auth/drizzle-adapter/relations-v2", () => ({
  drizzleAdapter: mocks.drizzleAdapter,
}));
vi.mock("~/auth/server/email/two-factor", () => ({
  enqueueTwoFactorCodeEmail: mocks.enqueueTwoFactorCodeEmail,
}));

const { auth } = await import("../../../../src/auth/server/auth");

interface TestEnv {
  APP_DB: { name: string };
  AUTH_SESSION_KV?:
    | {
        get: typeof mocks.kvGet;
        put: typeof mocks.kvPut;
        delete: typeof mocks.kvDelete;
      }
    | undefined;
  BETTER_AUTH_SECRET: string;
  AUTH_PASSWORD_CONFIG: string;
}

function makeEnv(withKv = true): TestEnv {
  return {
    APP_DB: { name: "app-db" },
    AUTH_SESSION_KV: withKv
      ? { get: mocks.kvGet, put: mocks.kvPut, delete: mocks.kvDelete }
      : undefined,
    BETTER_AUTH_SECRET: "test-secret",
    AUTH_PASSWORD_CONFIG:
      '{"iterations":1000,"saltBytes":8,"keyBits":128,"prefix":"pbkdf2_test","pepper":"cGVwcGVyLXZhbHVlLTEyMzQ"}',
  };
}

function createAuthFor(env: TestEnv): ReturnType<typeof auth> {
  return auth(env);
}

function lastOptions(): CapturedOptions {
  const options = mocks.betterAuth.mock.lastCall?.[0];
  if (options === undefined) {
    throw new Error("betterAuth was not called");
  }
  return options;
}

function storageFrom(options: CapturedOptions): SessionStorage {
  if (options.secondaryStorage === undefined) {
    throw new Error("secondary storage was not configured");
  }
  return options.secondaryStorage;
}

function sendOtpFrom(options: CapturedOptions): SendOTP {
  const plugin = options.plugins.find((candidate) => candidate.id === "email-otp");
  const sendOTP = plugin?.options?.sendVerificationOTP;
  if (sendOTP === undefined) {
    throw new Error("email-otp sendVerificationOTP callback was not configured");
  }
  return sendOTP;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__WORKER_ORIGIN__", "https://example.com");
  mocks.kvGet.mockResolvedValue(null);
  mocks.kvPut.mockResolvedValue(undefined);
  mocks.kvDelete.mockResolvedValue(undefined);
  mocks.drizzle.mockReturnValue({ fakeDb: true });
  mocks.drizzleAdapter.mockReturnValue({ fakeAdapter: true });
  mocks.betterAuth.mockImplementation((options) => ({ options, marker: "auth-instance" }));
  mocks.enqueueTwoFactorCodeEmail.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth", () => {
  test("returns the same Better Auth instance for the same environment", () => {
    const env = makeEnv();

    const first = createAuthFor(env);
    const second = createAuthFor(env);

    expect(second).toBe(first);
    expect(mocks.betterAuth).toHaveBeenCalledOnce();
  });

  test("wires the adapter, secret, and base path into Better Auth", () => {
    const env = makeEnv();
    createAuthFor(env);

    expect(mocks.drizzle).toHaveBeenCalledOnce();
    expect(mocks.drizzle.mock.calls[0]?.[0]).toBe(env.APP_DB);
    expect(mocks.drizzle.mock.calls[0]?.[1]).toHaveProperty("relations");
    expect(mocks.drizzle.mock.calls[0]?.[1]).toHaveProperty("logger");
    expect(mocks.drizzleAdapter).toHaveBeenCalledOnce();
    expect(mocks.drizzleAdapter.mock.calls[0]?.[0]).toEqual({ fakeDb: true });
    expect(mocks.drizzleAdapter.mock.calls[0]?.[1]).toHaveProperty("provider", "sqlite");
    const options = lastOptions();
    expect(options.database).toEqual({ fakeAdapter: true });
    expect(options.secret).toBe("test-secret");
    expect(options.baseURL).toBe("https://example.com");
    expect(options.basePath).toBe("/api/auth");
    expect(options.plugins.map((plugin) => plugin.id)).toContain("email-otp");
    expect(options.secondaryStorage).toBeDefined();
  });

  test("reads and deletes session values through the KV binding", async () => {
    mocks.kvGet.mockResolvedValueOnce("stored-session");
    createAuthFor(makeEnv());
    const storage = storageFrom(lastOptions());

    await expect(storage.get("session:1")).resolves.toBe("stored-session");
    await storage.delete("session:1");

    expect(mocks.kvGet).toHaveBeenCalledExactlyOnceWith("session:1");
    expect(mocks.kvDelete).toHaveBeenCalledExactlyOnceWith("session:1");
  });

  test("writes KV values without an expiry when no TTL is provided", async () => {
    createAuthFor(makeEnv());
    const storage = storageFrom(lastOptions());

    await storage.set("session:1", "value");

    expect(mocks.kvPut).toHaveBeenCalledExactlyOnceWith("session:1", "value");
  });

  test("clamps short KV TTLs to Cloudflare's 60-second minimum", async () => {
    createAuthFor(makeEnv());
    const storage = storageFrom(lastOptions());

    await storage.set("short", "value", 10);
    await storage.set("long", "value", 300);

    expect(mocks.kvPut).toHaveBeenNthCalledWith(1, "short", "value", { expirationTtl: 60 });
    expect(mocks.kvPut).toHaveBeenNthCalledWith(2, "long", "value", { expirationTtl: 300 });
  });

  test("omits secondary storage when the KV binding is absent", () => {
    createAuthFor(makeEnv(false));

    expect(lastOptions().secondaryStorage).toBeUndefined();
    expect(mocks.kvGet).not.toHaveBeenCalled();
  });

  test("queues a sign-in code email from the plugin callback", async () => {
    const env = makeEnv();
    createAuthFor(env);
    const sendOTP = sendOtpFrom(lastOptions());

    await sendOTP({ email: "staff@example.com", otp: "123456", type: "sign-in" });

    expect(mocks.enqueueTwoFactorCodeEmail).toHaveBeenCalledExactlyOnceWith(env, {
      email: "staff@example.com",
      code: "123456",
      expiresMinutes: 10,
    });
  });

  test("throws when the sign-in code email cannot be queued", async () => {
    createAuthFor(makeEnv());
    const sendOTP = sendOtpFrom(lastOptions());
    mocks.enqueueTwoFactorCodeEmail.mockResolvedValueOnce(false);

    await expect(
      sendOTP({ email: "staff@example.com", otp: "123456", type: "sign-in" }),
    ).rejects.toThrow("Sign-in code email could not be queued");
  });
});
