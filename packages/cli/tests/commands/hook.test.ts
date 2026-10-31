import {
  chmodSync,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
    expect(hook).toContain("$REVIO review --staged || true");
    expect(hook).toContain('command -v revio >/dev/null 2>&1 || REVIO="npx --no-install revio"');
    expect(statSync(hookPath(dir)).mode & 0o111).not.toBe(0);
  });

  it("blocks on the given severity when asked", async () => {
    const dir = tempRepo();
    await installHook(dir, { blockOn: "error" });
    expect(read(dir)).toContain("$REVIO review --staged --block-on error\n");
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
    expect(readFileSync(join(dir, ".githooks", "pre-commit"), "utf8")).toContain(
      "$REVIO review --staged",
    );
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

describe("installHook with other hook managers", () => {
  it("runs before an existing hook's exec/exit line", async () => {
    const dir = tempRepo();
    writeFileSync(hookPath(dir), "#!/bin/sh\nexec lint-staged\n", { mode: 0o755 });
    await installHook(dir);
    const hook = read(dir);
    expect(hook.indexOf("# >>> revio >>>")).toBeLessThan(hook.indexOf("exec lint-staged"));
    expect(hook.startsWith("#!/bin/sh\n")).toBe(true);
  });

  it("writes to .husky/pre-commit in husky v9 repos", async () => {
    const dir = tempRepo();
    git(dir, "config", "core.hooksPath", ".husky/_");
    const file = await installHook(dir);
    expect(file).toBe(join(realpathSync(dir), ".husky", "pre-commit"));
    expect(readFileSync(join(dir, ".husky", "pre-commit"), "utf8")).toContain(
      "$REVIO review --staged",
    );
    await uninstallHook(dir);
    expect(existsSync(join(dir, ".husky", "pre-commit"))).toBe(false);
  });

  it("refuses to overwrite a hook it cannot read", async () => {
    const dir = tempRepo();
    writeFileSync(hookPath(dir), "#!/bin/sh\nmine\n");
    chmodSync(hookPath(dir), 0o200); // writable but unreadable
    await expect(installHook(dir)).rejects.toThrow();
    chmodSync(hookPath(dir), 0o644);
    expect(read(dir)).toBe("#!/bin/sh\nmine\n");
  });
});
