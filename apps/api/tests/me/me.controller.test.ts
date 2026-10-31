import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JWT_VERIFIER, SupabaseJwtGuard } from "../auth/jwt.guard";
import { InstallationsService } from "../installations/installations.service";
import { MeController } from "./me.controller";

const USER = "5f0c1f9e-1d1a-4b0e-9a49-3f1f3b1f6a10";
const svc = { me: vi.fn(), linkUser: vi.fn() };
let app: INestApplication;

beforeAll(async () => {
  const mod = await Test.createTestingModule({
    controllers: [MeController],
    providers: [
      SupabaseJwtGuard,
      { provide: JWT_VERIFIER, useValue: async () => ({ id: USER }) },
      { provide: InstallationsService, useValue: svc },
    ],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterAll(() => app.close());
beforeEach(() => vi.clearAllMocks());

const auth = { Authorization: "Bearer t" };

describe("/me", () => {
  it("returns the signed-in user", async () => {
    svc.me.mockResolvedValue({ id: USER, githubLogin: "teja", avatarUrl: null });
    const r = await request(app.getHttpServer()).get("/me").set(auth);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: USER, githubLogin: "teja", avatarUrl: null });
  });

  it("404s before the user has linked GitHub", async () => {
    svc.me.mockResolvedValue(undefined);
    expect((await request(app.getHttpServer()).get("/me").set(auth)).status).toBe(404);
  });

  it("links GitHub with the provider token", async () => {
    svc.linkUser.mockResolvedValue({ id: USER, githubLogin: "teja", avatarUrl: null });
    const r = await request(app.getHttpServer())
      .post("/me/github-link")
      .set(auth)
      .send({ githubToken: "gho_x" });
    expect(r.status).toBe(200);
    expect(svc.linkUser).toHaveBeenCalledWith(USER, "gho_x");
  });

  it("rejects a link request without a token", async () => {
    const r = await request(app.getHttpServer()).post("/me/github-link").set(auth).send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toBeTruthy();
    expect(svc.linkUser).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    expect((await request(app.getHttpServer()).get("/me")).status).toBe(401);
  });
});
