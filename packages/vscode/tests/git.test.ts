import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitDiff, parentOf } from "./git";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "revio-vsc-"));
  git(dir, "init", "-q", "-b", "main");
  return dir;
}
const commit = (dir: string, file: string, content: string, msg = file) => {
  writeFileSync(join(dir, file), content);
  git(dir, "add", ".");
  git(dir, "commit", "-qm", msg);
  return git(dir, "rev-parse", "HEAD");
};

describe("commitDiff", () => {
  it("contains only that commit's changes", async () => {
    const dir = repo();
    commit(dir, "a.ts", "old\n");
    const sha = commit(dir, "b.ts", "new\n");
    const diff = await commitDiff(dir, sha);
    expect(diff).toContain("+new");
    expect(diff).not.toContain("+old");
  });

  it("works for the first commit", async () => {
    const dir = repo();
    const sha = commit(dir, "a.ts", "first\n");
    expect(await commitDiff(dir, sha)).toContain("+first");
  });

  it("diffs a merge commit against its first parent only", async () => {
    const dir = repo();
    commit(dir, "a.ts", "base\n");
    git(dir, "checkout", "-qb", "feature");
    commit(dir, "f.ts", "feature\n");
    git(dir, "checkout", "-q", "main");
    commit(dir, "m.ts", "mainline\n");
    git(dir, "merge", "-q", "--no-ff", "feature", "-m", "merge");
    const diff = await commitDiff(dir, git(dir, "rev-parse", "HEAD"));
    expect(diff).toContain("+feature");
    expect(diff).not.toContain("+mainline");
  });
});

describe("parentOf", () => {
  it("returns the first parent, or undefined for the root commit", async () => {
    const dir = repo();
    const first = commit(dir, "a.ts", "1\n");
    const second = commit(dir, "a.ts", "2\n");
    expect(await parentOf(dir, second)).toBe(first);
    expect(await parentOf(dir, first)).toBeUndefined();
  });
});
