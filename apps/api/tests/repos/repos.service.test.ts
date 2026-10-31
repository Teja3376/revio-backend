import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ME, STRANGER, seedDashboard } from "../dashboard.test-seed";
import { testDb } from "../database/test-db";
import { ReposService } from "./repos.service";

let db: Awaited<ReturnType<typeof testDb>>;
let repos: Awaited<ReturnType<typeof seedDashboard>>;
let svc: ReposService;

beforeEach(async () => {
  db = await testDb();
  repos = await seedDashboard(db);
  svc = new ReposService(db);
});
afterEach(() => db.close());

describe("ReposService", () => {
  it("lists only the user's repos, by name, in the API's shape", async () => {
    expect(await svc.list(ME)).toEqual([
      { id: repos.one, fullName: "a/one", enabled: true, depth: "full", ignoreGlobs: [] },
      { id: repos.two, fullName: "a/two", enabled: true, depth: "full", ignoreGlobs: [] },
    ]);
  });

  it("updates only the fields sent", async () => {
    const updated = await svc.update(ME, repos.one, { enabled: false, ignoreGlobs: ["docs/**"] });
    expect(updated).toEqual({
      id: repos.one,
      fullName: "a/one",
      enabled: false,
      depth: "full",
      ignoreGlobs: ["docs/**"],
    });
    expect((await svc.update(ME, repos.one, { depth: "quick" }))?.enabled).toBe(false);
  });

  it("hides a repo in the user's installation that GitHub doesn't let them see", async () => {
    expect((await svc.list(ME)).map((r) => r.fullName)).not.toContain("a/hidden");
    expect(await svc.update(ME, repos.hidden, { enabled: false })).toBeUndefined();
  });

  it("treats another user's repo as not found", async () => {
    expect(await svc.update(ME, repos.secret, { enabled: false })).toBeUndefined();
    expect((await svc.list(STRANGER)).map((r) => r.fullName)).toEqual(["z/secret"]);
  });
});
