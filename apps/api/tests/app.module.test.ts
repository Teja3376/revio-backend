import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";
import { AppModule, DATA_SOURCE } from "../src/app.module";
import { ENV, loadEnv } from "../src/config/env";
import { PG_BOSS } from "../src/reviews/queue";

const env = loadEnv({
  DATABASE_URL: "postgresql://u:p@localhost:6543/postgres",
  DIRECT_URL: "postgresql://u:p@localhost:5432/postgres",
  SUPABASE_JWKS_URL: "https://x.supabase.co/auth/v1/.well-known/jwks.json",
  GITHUB_APP_ID: "1",
  GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
  GITHUB_WEBHOOK_SECRET: "s",
  GEMINI_API_KEY: "g",
});

const boss = {
  on() {},
  async start() {},
  async stop() {},
  async createQueue() {},
  async work() {},
  async send() {},
};

let app: INestApplication;
beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .overrideProvider(DATA_SOURCE)
    .useValue({ query: async () => [], destroy: async () => {} })
    .overrideProvider(PG_BOSS)
    .useValue(boss)
    .compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
});
afterAll(() => app.close());

describe("AppModule", () => {
  it("wires every route", async () => {
    const http = request(app.getHttpServer());
    await http.get("/health").expect(200);
    await http.get("/me").expect(401);
    await http.get("/repos").expect(401);
    await http.get("/reviews").expect(401);
    await http.post("/webhooks/github").send({}).expect(401);
  });
});
