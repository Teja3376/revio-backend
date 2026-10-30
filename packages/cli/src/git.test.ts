import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDiff, NotAGitRepoError, repoRoot } from "./git";
import { git, tempRepo } from "./test-utils";

describe("getDiff", () => {
  it("includes modified tracked files", async () => {
    const dir = tempRepo();
    writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
    expect(await getDiff({ cwd: dir })).toContain("+export const a = 2;");
  });

  it("returns staged-only changes with staged: true, and the default diff covers HEAD", async () => {
    const dir = tempRepo();
    writeFileSync(join(dir, "a.ts"), "export const a = 3;\n");
    git(dir, "add", "a.ts");
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n"); // working tree back to HEAD
    expect(await getDiff({ cwd: dir, staged: true })).toContain("+export const a = 3;");
    expect(await getDiff({ cwd: dir })).toBe("");
  });

  it("diffs against a base branch", async () => {
    const dir = tempRepo();
    git(dir, "checkout", "-qb", "feature");
    writeFileSync(join(dir, "b.ts"), "export const b = 1;\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "b");
    expect(await getDiff({ cwd: dir, base: "main" })).toContain("+export const b = 1;");
  });

  it("returns an empty string for a clean repo", async () => {
    expect(await getDiff({ cwd: tempRepo() })).toBe("");
  });

  it("throws NotAGitRepoError outside a repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "revio-nogit-"));
    await expect(getDiff({ cwd: dir })).rejects.toBeInstanceOf(NotAGitRepoError);
    await expect(repoRoot(dir)).rejects.toBeInstanceOf(NotAGitRepoError);
  });

  it("falls back to staged changes in a repo with no commits", async () => {
    const dir = tempRepo({ commit: false });
    writeFileSync(join(dir, "n.ts"), "export const n = 1;\n");
    git(dir, "add", "n.ts");
    expect(await getDiff({ cwd: dir })).toContain("+export const n = 1;");
  });

  it("includes an untracked file when it is named", async () => {
    const dir = tempRepo();
    writeFileSync(join(dir, "new.ts"), "export const fresh = 1;\n");
    const diff = await getDiff({ cwd: dir, file: join(dir, "new.ts") });
    expect(diff).toContain("+export const fresh = 1;");
    expect(diff).toContain("b/new.ts");
  });

  it("limits the diff to the named tracked file", async () => {
    const dir = tempRepo();
    writeFileSync(join(dir, "a.ts"), "export const a = 9;\n");
    writeFileSync(join(dir, "c.ts"), "x\n");
    git(dir, "add", "c.ts");
    const diff = await getDiff({ cwd: dir, file: join(dir, "a.ts") });
    expect(diff).toContain("a/a.ts");
    expect(diff).not.toContain("c.ts");
  });
});

describe("repoRoot", () => {
  it("returns the top-level directory", async () => {
    const dir = tempRepo();
    expect(await repoRoot(dir)).toMatch(/revio-git-/);
  });
});
