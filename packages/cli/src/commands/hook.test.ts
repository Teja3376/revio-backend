import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { git, tempRepo } from "../test-utils";
import { installHook, uninstallHook } from "./hook";

const hookPath = (dir: string) => join(dir, ".git", "hooks", "pre-commit");
const read = (dir: string) => readFileSync(hookPath(dir), "utf8");
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("installHook", () => {
  it("creates an executable, non-blocking pre-commit hook", async () => {
    const dir = tempRepo();
    await installHook(dir);
    const hook = read(dir);
    expect(hook.startsWith("#!/bin/sh")).toBe(true);
    expect(hook).toContain("# >>> revio >>>");
    expect(hook).toContain("npx --no-install revio review --staged || true");
    expect(statSync(hookPath(dir)).mode & 0o111).not.toBe(0);
  });

  it("blocks on the given severity when asked", async () => {
    const dir = tempRepo();
    await installHook(dir, { blockOn: "error" });
    expect(read(dir)).toContain("npx --no-install revio review --staged --block-on error\n");
  });

  it("does not duplicate the block when installed twice", async () => {
    const dir = tempRepo();
    await installHook(dir);
    await installHook(dir, { blockOn: "warning" });
    expect(count(read(dir), "# >>> revio >>>")).toBe(1);
    expect(read(dir)).toContain("--block-on warning");
  });

  it("keeps the user's existing hook lines", async () => {
    const dir = tempRepo();
    writeFileSync(hookPath(dir), "#!/bin/sh\nnpm run lint\n", { mode: 0o755 });
    await installHook(dir);
    expect(read(dir)).toContain("npm run lint");
    expect(read(dir)).toContain("# >>> revio >>>");
  });

  it("respects core.hooksPath", async () => {
    const dir = tempRepo();
    git(dir, "config", "core.hooksPath", ".githooks");
    await installHook(dir);
    expect(readFileSync(join(dir, ".githooks", "pre-commit"), "utf8")).toContain("revio review");
  });
});

describe("uninstallHook", () => {
  it("removes only the revio block", async () => {
    const dir = tempRepo();
    writeFileSync(hookPath(dir), "#!/bin/sh\nnpm run lint\n", { mode: 0o755 });
    await installHook(dir);
    await uninstallHook(dir);
    expect(read(dir)).toBe("#!/bin/sh\nnpm run lint\n");
  });

  it("deletes the hook file when nothing else is left", async () => {
    const dir = tempRepo();
    await installHook(dir);
    await uninstallHook(dir);
    expect(existsSync(hookPath(dir))).toBe(false);
  });

  it("does nothing when no hook exists", async () => {
    await expect(uninstallHook(tempRepo())).resolves.toBeUndefined();
  });
});
