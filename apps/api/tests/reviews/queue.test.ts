import { describe, expect, it, vi } from "vitest";
import { PgBossReviewQueue, QUEUE_NAME } from "../../src/reviews/queue";

function fakeBoss() {
  return {
    on: vi.fn(),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    createQueue: vi.fn(async () => {}),
    send: vi.fn(async () => "job-1"),
    work: vi.fn(async (_queue: string, _handler: unknown) => "worker-1"),
  };
}

const job = { installationId: 7, githubRepoId: 42, prNumber: 3, headSha: "abc" };

describe("PgBossReviewQueue", () => {
  it("creates the queue with 3 retries and exponential backoff on start", async () => {
    const boss = fakeBoss();
    await new PgBossReviewQueue(boss as never, { handle: vi.fn() }).onModuleInit();
    expect(boss.start).toHaveBeenCalled();
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUE_NAME, {
      retryLimit: 3,
      retryBackoff: true,
      retryDelay: 30,
    });
  });

  it("queues one job per commit, even if GitHub sends the event twice", async () => {
    const boss = fakeBoss();
    await new PgBossReviewQueue(boss as never, { handle: vi.fn() }).enqueue(job);
    expect(boss.send).toHaveBeenCalledWith(QUEUE_NAME, job, { singletonKey: "42:3:abc" });
  });

  it("hands each job to the worker", async () => {
    const boss = fakeBoss();
    const worker = { handle: vi.fn(async () => {}) };
    await new PgBossReviewQueue(boss as never, worker).onModuleInit();
    const handler = boss.work.mock.calls[0]?.[1] as (jobs: { data: unknown }[]) => Promise<void>;
    await handler([{ data: job }]);
    expect(worker.handle).toHaveBeenCalledWith(job);
  });

  it("stops the queue on shutdown", async () => {
    const boss = fakeBoss();
    await new PgBossReviewQueue(boss as never, { handle: vi.fn() }).onModuleDestroy();
    expect(boss.stop).toHaveBeenCalled();
  });
});
