import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export class NotAGitRepoError extends Error {
  override name = "NotAGitRepoError";
  constructor() {
    super("Revio needs a git repository.");
  }
}

type GitResult = { stdout: string; code: number };

async function git(cwd: string, args: string[], okCodes = [0]): Promise<GitResult> {
  try {
    const { stdout } = await run("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return { stdout, code: 0 };
  } catch (e) {
    const err = e as { code?: number | string; stdout?: string };
    if (typeof err.code === "number" && okCodes.includes(err.code)) {
      return { stdout: err.stdout ?? "", code: err.code };
    }
    throw e;
  }
}

export async function repoRoot(cwd: string): Promise<string> {
  try {
    return (await git(cwd, ["rev-parse", "--show-toplevel"])).stdout.trim();
  } catch {
    throw new NotAGitRepoError(); // also covers git not being installed
  }
}

const hasCommits = async (root: string) =>
  (await git(root, ["rev-parse", "--verify", "-q", "HEAD"], [0, 1])).code === 0;

const isTracked = async (root: string, file: string) =>
  (await git(root, ["ls-files", "--error-unmatch", "--", file], [0, 1])).code === 0;

// git reports resolved paths (e.g. macOS /var -> /private/var), so compare like with like.
const realPath = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p; // deleted file
  }
};

export type DiffOptions = { cwd: string; staged?: boolean; base?: string; file?: string };

/** Default: working tree vs HEAD. `staged`: index vs HEAD. `base`: `<base>...HEAD`. `file`: limit to one path. */
export async function getDiff(opts: DiffOptions): Promise<string> {
  const root = await repoRoot(opts.cwd);
  const file = opts.file ? relative(root, realPath(resolve(opts.cwd, opts.file))) : undefined;
  const flags = ["diff", "--no-color", "--no-ext-diff"];

  if (file && !(await isTracked(root, file))) {
    // --no-index exits 1 when files differ
    return (await git(root, [...flags, "--no-index", "--", "/dev/null", file], [0, 1])).stdout;
  }

  let range: string[];
  if (opts.base) range = [`${opts.base}...HEAD`];
  else if (opts.staged || !(await hasCommits(root))) range = ["--cached"];
  else range = ["HEAD"];

  return (await git(root, [...flags, ...range, ...(file ? ["--", file] : [])])).stdout;
}
