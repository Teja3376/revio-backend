import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env";

const base = {
  DATABASE_URL: "postgresql://u:p@h:6543/postgres",
  DIRECT_URL: "postgresql://u:p@h:5432/postgres",
  SUPABASE_JWKS_URL: "https://x.supabase.co/auth/v1/.well-known/jwks.json",
  GITHUB_APP_ID: "123",
  GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
  GITHUB_WEBHOOK_SECRET: "s3cret",
  GEMINI_API_KEY: "g",
};

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.REVIO_DAILY_REVIEW_CAP).toBe(50);
    expect(env.WEB_ORIGIN).toBe("http://localhost:3000");
  });

  it("turns escaped newlines in the private key into real ones", () => {
    expect(loadEnv(base).GITHUB_PRIVATE_KEY).toContain("\nabc\n");
  });

  it("names a missing variable", () => {
    const { GITHUB_WEBHOOK_SECRET: _, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/GITHUB_WEBHOOK_SECRET/);
  });

  it("reads numbers from strings", () => {
    expect(loadEnv({ ...base, PORT: "8080", REVIO_DAILY_REVIEW_CAP: "5" })).toMatchObject({
      PORT: 8080,
      REVIO_DAILY_REVIEW_CAP: 5,
    });
  });
});
