import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JWT_VERIFIER, SupabaseJwtGuard } from "./auth/jwt.guard";
import { ReposController } from "./repos/repos.controller";
import { ReposService } from "./repos/repos.service";
import { ReviewsController } from "./reviews/reviews.controller";
import { ReviewsService } from "./reviews/reviews.service";

const ME = "5f0c1f9e-1d1a-4b0e-9a49-3f1f3b1f6a10";
const ID = "11111111-2222-4333-8444-555555555555";
const repos = { list: vi.fn(), update: vi.fn() };
const reviews = { list: vi.fn(), get: vi.fn() };
let app: INestApplication;

beforeAll(async () => {
  const mod = await Test.createTestingModule({
    controllers: [ReposController, ReviewsController],
    providers: [
      SupabaseJwtGuard,
      { provide: JWT_VERIFIER, useValue: async () => ({ id: ME }) },
      { provide: ReposService, useValue: repos },
      { provide: ReviewsService, useValue: reviews },
    ],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterAll(() => app.close());
beforeEach(() => vi.clearAllMocks());

const http = () => request(app.getHttpServer());
const auth = { Authorization: "Bearer t" };

describe("GET /repos", () => {
  it("wraps the list in items", async () => {
    repos.list.mockResolvedValue([{ id: ID }]);
    const r = await http().get("/repos").set(auth);
    expect(r.body).toEqual({ items: [{ id: ID }] });
    expect(repos.list).toHaveBeenCalledWith(ME);
  });

  it("requires sign-in", async () => {
    expect((await http().get("/repos")).status).toBe(401);
  });
});

describe("PATCH /repos/:id", () => {
  it("updates with a valid body", async () => {
    repos.update.mockResolvedValue({ id: ID, enabled: false });
    const r = await http()
      .patch(`/repos/${ID}`)
      .set(auth)
      .send({ enabled: false, ignoreGlobs: ["docs/**"] });
    expect(r.status).toBe(200);
    expect(repos.update).toHaveBeenCalledWith(ME, ID, { enabled: false, ignoreGlobs: ["docs/**"] });
  });

  it.each([
    [{ depth: "deep" }, /depth/],
    [{ ignoreGlobs: Array(51).fill("x") }, /ignoreGlobs/],
    [{ ignoreGlobs: ["x".repeat(201)] }, /ignoreGlobs/],
    [{}, /Nothing to change/],
    [{ enabled: false, extra: 1 }, /extra|Unrecognized/i],
  ])("rejects %j with 400 { message }", async (body, message) => {
    const r = await http().patch(`/repos/${ID}`).set(auth).send(body);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(message);
    expect(repos.update).not.toHaveBeenCalled();
  });

  it("404s for a repo the user can't see, or a malformed id", async () => {
    repos.update.mockResolvedValue(undefined);
    expect((await http().patch(`/repos/${ID}`).set(auth).send({ enabled: true })).status).toBe(404);
    expect((await http().patch("/repos/not-a-uuid").set(auth).send({ enabled: true })).status).toBe(
      404,
    );
  });
});

describe("GET /reviews", () => {
  it("passes the repo filter and page", async () => {
    reviews.list.mockResolvedValue({ items: [], page: 2, pageSize: 20, total: 0 });
    const r = await http().get(`/reviews?repo=${ID}&page=2`).set(auth);
    expect(r.status).toBe(200);
    expect(reviews.list).toHaveBeenCalledWith(ME, { repo: ID, page: 2 });
  });

  it("defaults to page 1 and rejects a bad page", async () => {
    reviews.list.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    await http().get("/reviews").set(auth);
    expect(reviews.list).toHaveBeenCalledWith(ME, { page: 1 });
    expect((await http().get("/reviews?page=0").set(auth)).status).toBe(400);
  });
});

describe("GET /reviews/:id", () => {
  it("returns the review", async () => {
    reviews.get.mockResolvedValue({ id: ID, issues: [] });
    expect((await http().get(`/reviews/${ID}`).set(auth)).body).toEqual({ id: ID, issues: [] });
  });

  it("404s when it isn't the user's", async () => {
    reviews.get.mockResolvedValue(undefined);
    expect((await http().get(`/reviews/${ID}`).set(auth)).status).toBe(404);
  });
});
