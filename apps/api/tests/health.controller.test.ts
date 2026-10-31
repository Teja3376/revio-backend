import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";
import { HealthController } from "./health.controller";

describe("GET /health", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it("answers ok without auth", async () => {
    await request(app.getHttpServer()).get("/health").expect(200, { ok: true });
  });
});
