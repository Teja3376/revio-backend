import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Severity } from "@revio/core";
import { repoRoot } from "../git";

const START = "# >>> revio >>>";
const END = "# <<< revio <<<";
const BLOCK = new RegExp(`${START}[\\s\\S]*?${END}\\n?`, "g");

/** Path of pre-commit, honoring core.hooksPath; husky v9 keeps user hooks in .husky/, not .husky/_. */
async function hookFile(cwd: string): Promise<string> {
  const root = await repoRoot(cwd);
  const { stdout } = await promisify(execFile)("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
  });
  const dir = resolve(root, stdout.trim());
  const isHusky = basename(dir) === "_" && basename(dirname(dir)) === ".husky";
  return join(isHusky ? dirname(dir) : dir, "pre-commit");
}

/** Missing file → ""; any other read error is thrown so we never overwrite a hook we couldn't read. */
async function readHook(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw e;
  }
}

function revioBlock(blockOn?: Severity): string {
  const run = `$REVIO review --staged${blockOn ? ` --block-on ${blockOn}` : " || true"}`;
  // prefer a global install on PATH; GUI git clients and other node versions may not see npx's
  return `${START}\nREVIO="revio"\ncommand -v revio >/dev/null 2>&1 || REVIO="npx --no-install revio"\n${run}\n${END}\n`;
}

export async function installHook(cwd: string, opts: { blockOn?: Severity } = {}): Promise<string> {
  const file = await hookFile(cwd);
  const lines = (await readHook(file)).replace(BLOCK, "").trimEnd().split("\n").filter(Boolean);
  if (!lines[0]?.startsWith("#!")) lines.unshift("#!/bin/sh");
  // insert right after the shebang so an existing `exec ...` or `exit` can't skip us
  const [shebang, ...rest] = lines;
  const content = [shebang, revioBlock(opts.blockOn).trimEnd(), ...rest].join("\n");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${content}\n`);
  await chmod(file, 0o755);
  return file;
}

export async function uninstallHook(cwd: string): Promise<void> {
  const file = await hookFile(cwd);
  const existing = await readHook(file);
  if (!existing.includes(START)) return;
  const rest = existing.replace(BLOCK, "").trimEnd();
  if (!rest || rest === "#!/bin/sh") await rm(file);
  else await writeFile(file, `${rest}\n`);
}
