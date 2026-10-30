import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Severity } from "@revio/core";
import { repoRoot } from "../git";

const START = "# >>> revio >>>";
const END = "# <<< revio <<<";
const BLOCK = new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`, "g");

/** Path of pre-commit, honoring core.hooksPath. */
async function hookFile(cwd: string): Promise<string> {
  const root = await repoRoot(cwd);
  const { stdout } = await promisify(execFile)("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
  });
  return join(resolve(root, stdout.trim()), "pre-commit");
}

const readOr = (file: string) => readFile(file, "utf8").catch(() => "");

export async function installHook(cwd: string, opts: { blockOn?: Severity } = {}): Promise<string> {
  const file = await hookFile(cwd);
  const existing = (await readOr(file)).replace(BLOCK, "\n").trimEnd();
  const cmd = `npx --no-install revio review --staged${opts.blockOn ? ` --block-on ${opts.blockOn}` : " || true"}`;
  const head = existing || "#!/bin/sh";
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, `${head}\n${START}\n${cmd}\n${END}\n`);
  await chmod(file, 0o755);
  return file;
}

export async function uninstallHook(cwd: string): Promise<void> {
  const file = await hookFile(cwd);
  const existing = await readOr(file);
  if (!existing.includes(START)) return;
  const rest = existing.replace(BLOCK, "\n").trimEnd();
  if (!rest || rest === "#!/bin/sh") await rm(file);
  else await writeFile(file, `${rest}\n`);
}
