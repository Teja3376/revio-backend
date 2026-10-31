import { PGlite } from "@electric-sql/pglite";
import type { QueryRunner } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Init1761900000000 } from "../../src/database/migrations/1761900000000-init";

// Runs the hand-written migration on a real Postgres (PGlite, in this process).
const db = new PGlite();
const runner = { query: (sql: string) => db.exec(sql) } as unknown as QueryRunner;

beforeAll(async () => {
  await new Init1761900000000().up(runner);
});
afterAll(() => db.close());

async function seedRepo() {
  const inst = await db.query<{ id: string }>(
    "insert into installations (github_installation_id, account_login, account_type) values (1, 'a', 'User') returning id",
  );
  const repo = await db.query<{
    id: string;
    enabled: boolean;
    depth: string;
    ignore_globs: string[];
  }>(
    "insert into repos (installation_id, github_repo_id, full_name) values ($1, 10, 'a/b') returning *",
    [inst.rows[0]?.id],
  );
  return repo.rows[0];
}

describe("init migration", () => {
  it("creates repos enabled at full depth with no ignore patterns", async () => {
    expect(await seedRepo()).toMatchObject({ enabled: true, depth: "full", ignore_globs: [] });
  });

  it("refuses a second review of the same commit", async () => {
    const repo = (await db.query<{ id: string }>("select id from repos limit 1")).rows[0];
    const insert = () =>
      db.query(
        "insert into reviews (repo_id, pr_number, pr_title, pr_url, head_sha, base_sha, status) values ($1, 1, 't', 'u', 'abc', 'def', 'queued')",
        [repo?.id],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/unique/i);
  });

  it("deletes a repo's reviews and issues with it", async () => {
    await db.exec("delete from installations");
    const counts = await db.query<{ n: number }>(
      "select (select count(*) from repos) + (select count(*) from reviews) + (select count(*) from review_issues) as n",
    );
    expect(Number(counts.rows[0]?.n)).toBe(0);
  });

  it("rejects an unknown status", async () => {
    await expect(
      db.query(
        "insert into reviews (repo_id, pr_number, pr_title, pr_url, head_sha, base_sha, status) values (gen_random_uuid(), 1, 't', 'u', 'x', 'y', 'weird')",
      ),
    ).rejects.toThrow();
  });
});
