import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReviewsService } from "../../src/reviews/reviews.service";
import { ME, seedDashboard } from "../dashboard.test-seed";
import { testDb } from "../database/test-db";

let db: Awaited<ReturnType<typeof testDb>>;
let repos: Awaited<ReturnType<typeof seedDashboard>>;
let svc: ReviewsService;

async function addReview(repoId: string, pr: number, sha: string, startedAt: string) {
  const [row] = await db.query<{ id: string }>(
    `insert into reviews (repo_id, pr_number, pr_title, pr_url, head_sha, base_sha, status, summary, risk, issue_count, started_at, finished_at)
     values ($1, $2, $5, $6, $3, 'b', 'done', 'Sum', 'low', 1, $4, $4)
     returning id`,
    [repoId, pr, sha, startedAt, `Title ${pr}`, `https://github.com/x/pull/${pr}`],
  );
  await db.query(
    "insert into review_issues (review_id, file, line, severity, category, message, suggestion) values ($1, 'a.ts', 3, 'error', 'bug', 'Boom', null)",
    [row?.id],
  );
  return row?.id as string;
}

beforeEach(async () => {
  db = await testDb();
  repos = await seedDashboard(db);
  svc = new ReviewsService(db);
});
afterEach(() => db.close());

describe("ReviewsService", () => {
  it("lists the user's reviews newest first with paging info", async () => {
    await addReview(repos.one, 1, "s1", "2026-10-01T10:00:00Z");
    await addReview(repos.two, 2, "s2", "2026-10-02T10:00:00Z");
    await addReview(repos.secret, 3, "s3", "2026-10-03T10:00:00Z");
    const page = await svc.list(ME, { page: 1 });
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(page.items.map((r) => [r.repoFullName, r.prNumber])).toEqual([
      ["a/two", 2],
      ["a/one", 1],
    ]);
    expect(page.items[0]).toMatchObject({
      prTitle: "Title 2",
      prUrl: "https://github.com/x/pull/2",
      status: "done",
      issueCount: 1,
      startedAt: "2026-10-02T10:00:00.000Z",
    });
  });

  it("filters by repo and pages by 20", async () => {
    for (let i = 1; i <= 23; i++)
      await addReview(repos.one, i, `s${i}`, `2026-10-01T10:${String(i).padStart(2, "0")}:00Z`);
    await addReview(repos.two, 99, "x", "2026-10-02T10:00:00Z");
    const second = await svc.list(ME, { repo: repos.one, page: 2 });
    expect(second.total).toBe(23);
    expect(second.items).toHaveLength(3);
  });

  it("returns one review with its issues", async () => {
    const id = await addReview(repos.one, 1, "s1", "2026-10-01T10:00:00Z");
    expect(await svc.get(ME, id)).toMatchObject({
      id,
      summary: "Sum",
      risk: "low",
      error: null,
      issues: [{ file: "a.ts", line: 3, severity: "error", category: "bug", message: "Boom" }],
    });
  });

  it("hides reviews of a repo the user can't see, even in their installation", async () => {
    const id = await addReview(repos.hidden, 1, "s1", "2026-10-01T10:00:00Z");
    expect(await svc.get(ME, id)).toBeUndefined();
    expect((await svc.list(ME, { page: 1 })).total).toBe(0);
  });

  it("treats another user's review as not found", async () => {
    const id = await addReview(repos.secret, 1, "s1", "2026-10-01T10:00:00Z");
    expect(await svc.get(ME, id)).toBeUndefined();
  });
});
