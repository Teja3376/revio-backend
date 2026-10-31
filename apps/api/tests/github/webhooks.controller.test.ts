import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "@octokit/webhooks-methods";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../config/env";
import { INSTALLATION_EVENTS, REVIEW_QUEUE } from "./tokens";
import { WebhooksController } from "./webhooks.controller";

const SECRET = "hook-secret";
const queue = { enqueue: vi.fn() };
const installs = { onInstallation: vi.fn(), onRepositories: vi.fn() };
let app: INestApplication;

beforeAll(async () => {
  const mod = await Test.createTestingModule({
    controllers: [WebhooksController],
    providers: [
      { provide: ENV, useValue: { GITHUB_WEBHOOK_SECRET: SECRET } },
      { provide: REVIEW_QUEUE, useValue: queue },
      { provide: INSTALLATION_EVENTS, useValue: installs },
    ],
  }).compile();
  app = mod.createNestApplication({ rawBody: true });
  await app.init();
});
afterAll(() => app.close());
beforeEach(() => vi.clearAllMocks());

async function send(event: string, payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  return request(app.getHttpServer())
    .post("/webhooks/github")
    .set("Content-Type", "application/json")
    .set("X-GitHub-Event", event)
    .set("X-Hub-Signature-256", signature ?? (await sign(SECRET, body)))
    .send(body);
}

const pr = (action: string, over: Record<string, unknown> = {}) => ({
  action,
  installation: { id: 7 },
  repository: { id: 42, full_name: "a/b" },
  pull_request: { number: 3, draft: false, state: "open", head: { sha: "abc123" }, ...over },
});

describe("POST /webhooks/github", () => {
  it("rejects a bad signature and queues nothing", async () => {
    await send("pull_request", pr("opened"), "sha256=deadbeef").then((r) =>
      expect(r.status).toBe(401),
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("rejects a missing signature", async () => {
    const r = await request(app.getHttpServer())
      .post("/webhooks/github")
      .set("X-GitHub-Event", "pull_request")
      .send(pr("opened"));
    expect(r.status).toBe(401);
  });

  it.each(["opened", "synchronize", "reopened", "ready_for_review"])(
    "queues a review on %s",
    async (action) => {
      const r = await send("pull_request", pr(action));
      expect(r.status).toBe(202);
      expect(queue.enqueue).toHaveBeenCalledWith({
        installationId: 7,
        githubRepoId: 42,
        prNumber: 3,
        headSha: "abc123",
      });
    },
  );

  it("ignores closed pull requests and drafts", async () => {
    await send("pull_request", pr("closed", { state: "closed" }));
    await send("pull_request", pr("opened", { draft: true }));
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("passes installation events on", async () => {
    const payload = {
      action: "created",
      installation: { id: 7, account: { login: "a", type: "User" } },
      repositories: [],
    };
    expect((await send("installation", payload)).status).toBe(202);
    expect(installs.onInstallation).toHaveBeenCalledWith(payload);
  });

  it("passes repository add/remove events on", async () => {
    const payload = {
      action: "added",
      installation: { id: 7, account: { login: "a", type: "User" } },
      repositories_added: [{ id: 42, full_name: "a/b" }],
      repositories_removed: [],
    };
    expect((await send("installation_repositories", payload)).status).toBe(202);
    expect(installs.onRepositories).toHaveBeenCalledWith(payload);
  });

  it("answers 400 to a signed but malformed pull_request payload", async () => {
    expect((await send("pull_request", { action: "opened" })).status).toBe(400);
  });

  it("accepts and ignores other events", async () => {
    expect((await send("star", { action: "created" })).status).toBe(202);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
