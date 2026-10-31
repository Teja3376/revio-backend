import type { ModelClient } from "@revio/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../src/database/db";
import { SUMMARY_MARKER } from "../../src/reviews/comment-format";
import type { PrGithub } from "../../src/reviews/pr-github";
import { ReviewWorker } from "../../src/reviews/review-worker";
import { testDb } from "../database/test-db";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
new file mode 100644
--- /dev/null
+++ b/src/a.ts
@@ -0,0 +1,3 @@
+const a = 1;
+const b = 2;
+export { a, b };
`;

const ISSUE = {
  file: "src/a.ts",
  line: 2,
  severity: "error",
  category: "bug",
  message: "b is never used.",
};
const job = (headSha = "h1", prNumber = 3) => ({
  installationId: 7,
  githubRepoId: 42,
  prNumber,
  headSha,
});

const PULL = {
  title: "Add constants",
  html_url: "https://github.com/teja/app/pull/3",
  draft: false,
  state: "open",
  head: { sha: "h1" },
  base: { sha: "b1" },
};

let db: Db & { close(): Promise<void> };
let gh: { [K in keyof PrGithub]: ReturnType<typeof vi.fn> };
let model: { generate: ReturnType<typeof vi.fn> };
let worker: ReviewWorker;

function answer(issues: unknown[] = [ISSUE]) {
  model.generate.mockResolvedValue(
    JSON.stringify({ issues, summary: "Adds two constants.", risk: "low" }),
  );
}

beforeEach(async () => {
  db = await testDb();
  const [inst] = await db.query<{ id: string }>(
    "insert into installations (github_installation_id, account_login, account_type) values (7, 'teja', 'User') returning id",
  );
  await db.query(
    "insert into repos (installation_id, github_repo_id, full_name) values ($1, 42, 'teja/app')",
    [inst?.id],
  );

  gh = {
    getPull: vi.fn(async (_o: string, _r: string, n: number) => ({
      ...PULL,
      html_url: `https://github.com/teja/app/pull/${n}`,
    })),
    getPullDiff: vi.fn(async () => DIFF),
    compareDiff: vi.fn(async () => DIFF),
    getFile: vi.fn(async () => undefined),
    createReview: vi.fn(async () => {}),
    findSummaryComment: vi.fn(async () => undefined),
    createComment: vi.fn(async () => {}),
    updateComment: vi.fn(async () => {}),
  };
  model = { generate: vi.fn() };
  answer();
  worker = new ReviewWorker(
    db,
    { forInstallation: () => gh as unknown as PrGithub },
    model as ModelClient,
    { dailyCap: 50 },
  );
});
afterEach(() => db.close());

const reviews = () =>
  db.query<{
    head_sha: string;
    status: string;
    issue_count: number;
    risk: string | null;
    error: string | null;
  }>("select head_sha, status, issue_count, risk, error from reviews order by started_at");

describe("ReviewWorker", () => {
  it("reviews an open pull request: inline comments, one summary, results saved", async () => {
    await worker.handle(job());

    expect(gh.createReview).toHaveBeenCalledWith("teja", "app", 3, {
      commitId: "h1",
      comments: [{ path: "src/a.ts", line: 2, body: "**Bug error:** b is never used." }],
    });
    const [, , , summary] = gh.createComment.mock.calls[0] ?? [];
    expect(summary).toContain(SUMMARY_MARKER);
    expect(summary).toContain("**Issues:** 1 error");
    expect(await reviews()).toEqual([
      { head_sha: "h1", status: "done", issue_count: 1, risk: "low", error: null },
    ]);
    expect(await db.query("select file, line, message from review_issues")).toEqual([
      { file: "src/a.ts", line: 2, message: "b is never used." },
    ]);
  });

  it("reviews only the new commits on the next push and edits the summary in place", async () => {
    await worker.handle(job("h1"));
    gh.getPull.mockResolvedValueOnce({ ...PULL, head: { sha: "h2" } });
    gh.findSummaryComment.mockResolvedValue(555);
    await worker.handle(job("h2"));

    expect(gh.compareDiff).toHaveBeenCalledWith("teja", "app", "h1", "h2");
    expect(gh.updateComment).toHaveBeenCalledWith(
      "teja",
      "app",
      555,
      expect.stringContaining(SUMMARY_MARKER),
    );
  });

  it("falls back to the full pull request diff when the compare fails (force-push)", async () => {
    await worker.handle(job("h1"));
    gh.getPull.mockResolvedValueOnce({ ...PULL, head: { sha: "h2" } });
    gh.compareDiff.mockRejectedValueOnce(new Error("No common ancestor"));
    gh.getPullDiff.mockClear();
    await worker.handle(job("h2"));
    expect(gh.getPullDiff).toHaveBeenCalledTimes(1);
    expect((await reviews()).map((r) => r.status)).toEqual(["done", "done"]);
  });

  it("never reviews the same commit twice", async () => {
    await worker.handle(job());
    model.generate.mockClear();
    await worker.handle(job());
    expect(model.generate).not.toHaveBeenCalled();
    expect(await reviews()).toHaveLength(1);
  });

  it("skips a disabled repo without calling Gemini", async () => {
    await db.query("update repos set enabled = false");
    await worker.handle(job());
    expect(model.generate).not.toHaveBeenCalled();
    expect(gh.createComment).not.toHaveBeenCalled();
  });

  it("skips drafts, closed pull requests and stale pushes", async () => {
    const pull = PULL;
    gh.getPull.mockResolvedValueOnce({ ...pull, draft: true });
    await worker.handle(job());
    gh.getPull.mockResolvedValueOnce({ ...pull, state: "closed" });
    await worker.handle(job());
    gh.getPull.mockResolvedValueOnce({ ...pull, head: { sha: "newer" } });
    await worker.handle(job());
    expect(model.generate).not.toHaveBeenCalled();
    expect(await reviews()).toEqual([]);
  });

  it("stops at the daily cap: one short comment, review saved as skipped", async () => {
    worker = new ReviewWorker(
      db,
      { forInstallation: () => gh as unknown as PrGithub },
      model as ModelClient,
      { dailyCap: 1 },
    );
    await worker.handle(job("h1", 3));
    model.generate.mockClear();
    gh.createComment.mockClear();

    await worker.handle(job("h1", 4));
    expect(model.generate).not.toHaveBeenCalled();
    expect(gh.createComment).toHaveBeenCalledWith(
      "teja",
      "app",
      4,
      expect.stringMatching(/1 reviews/),
    );
    expect((await reviews()).map((r) => r.status)).toEqual(["done", "skipped"]);
  });

  it("applies .revio.json from the base branch, merged with the dashboard's ignore list", async () => {
    gh.getFile.mockResolvedValue(JSON.stringify({ ignore: ["src/**"] }));
    await worker.handle(job());
    expect(gh.getFile).toHaveBeenCalledWith("teja", "app", ".revio.json", "b1");
    // everything was ignored, so Gemini was never asked
    expect(model.generate).not.toHaveBeenCalled();
    expect(gh.createComment.mock.calls[0]?.[3]).toContain("**Issues:** none found");
  });

  it("notes an invalid .revio.json in the summary and reviews anyway", async () => {
    gh.getFile.mockResolvedValue(JSON.stringify({ depth: { github: "deep" } }));
    await worker.handle(job());
    expect(model.generate).toHaveBeenCalled();
    expect(gh.createComment.mock.calls[0]?.[3]).toMatch(/Ignored \.revio\.json/);
  });

  it("marks the review failed, posts nothing, and rethrows so the queue retries", async () => {
    model.generate.mockRejectedValue(Object.assign(new Error("boom"), { status: 503 }));
    await expect(worker.handle(job())).rejects.toThrow();
    expect(gh.createReview).not.toHaveBeenCalled();
    expect(gh.createComment).not.toHaveBeenCalled();
    const [row] = await reviews();
    expect(row?.status).toBe("failed");
    expect(row?.error).toBeTruthy();
  });

  it("retries a failed review of the same commit", async () => {
    model.generate.mockRejectedValueOnce(new Error("boom"));
    await expect(worker.handle(job())).rejects.toThrow();
    await worker.handle(job());
    expect((await reviews()).map((r) => r.status)).toEqual(["done"]);
  });

  it("still posts the summary when GitHub rejects the inline comments", async () => {
    gh.createReview.mockRejectedValue(Object.assign(new Error("Unprocessable"), { status: 422 }));
    await worker.handle(job());
    expect(gh.createComment.mock.calls[0]?.[3]).toMatch(/couldn’t place 1 comment/i);
    expect((await reviews())[0]?.status).toBe("done");
  });
});
