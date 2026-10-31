import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", ...args], {
    cwd,
    encoding: "utf8",
  });

/** A temp git repo with one committed file `a.ts`. Pass `commit: false` for a repo with no commits. */
export function tempRepo({ commit = true } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "revio-git-"));
  git(dir, "init", "-q", "-b", "main");
  if (commit) {
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "init");
  }
  return dir;
}
