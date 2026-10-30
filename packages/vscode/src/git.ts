import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const git = async (root: string, args: string[]) =>
  (
    await run("git", ["-c", "core.quotePath=false", ...args], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    })
  ).stdout;

export async function parentOf(root: string, sha: string): Promise<string | undefined> {
  try {
    return (await git(root, ["rev-parse", "--verify", "-q", `${sha}^1`])).trim() || undefined;
  } catch {
    return undefined; // root commit
  }
}

/** The changes a commit introduced: vs its first parent, or vs the empty tree for the first commit. */
export async function commitDiff(root: string, sha: string): Promise<string> {
  const base = (await parentOf(root, sha)) ?? EMPTY_TREE;
  return git(root, ["diff", "--no-color", "--no-ext-diff", base, sha]);
}
