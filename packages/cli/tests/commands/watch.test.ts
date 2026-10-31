import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ReviewError } from "@revio/core";
import { describe, expect, it, vi } from "vitest";
import { isIgnoredPath, startWatch } from "../../src/commands/watch";
import { tempRepo } from "../test-utils";

const DEBOUNCE = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(DEBOUNCE * 6);
// Reviews run git; under CI load that can take far longer than the debounce, so wait for the outcome.
const until = (check: () => void) => vi.waitFor(check, { timeout: 5000, interval: 20 });

function fakeWatcher() {
  const handlers: Record<string, ((arg: never) => void)[]> = {};
  return {
    on: (ev: string, cb: (arg: never) => void) => {
      handlers[ev] = [...(handlers[ev] ?? []), cb];
    },
    close: async () => {},
    emit: (p: string) => {
      for (const h of [...(handlers.change ?? []), ...(handlers.add ?? [])]) h(p as never);
    },
    fail: (e: Error) => {
      for (const h of handlers.error ?? []) h(e as never);
    },
  };
}

const issues = (file = "a.ts") =>
  JSON.stringify({
    issues: [{ file, line: 1, severity: "error", category: "bug", message: "Bad" }],
  });

async function setup(
  generate = vi.fn(async ({ prompt }: { prompt: string }) =>
    issues(prompt.includes("File: b.ts") ? "b.ts" : "a.ts"),
  ),
) {
  const dir = tempRepo();
  const watcher = fakeWatcher();
  const lines: string[] = [];
  const w = await startWatch({
    cwd: dir,
    debounceMs: DEBOUNCE,
    client: { generate },
    out: (s) => lines.push(s),
    watcher,
  });
  const save = (name: string, content: string) => {
    writeFileSync(join(dir, name), content);
    watcher.emit(join(dir, name));
  };
  return { dir, watcher, lines, generate, save, stop: w.stop };
}

describe("startWatch", () => {
  it("debounces rapid saves of one file into one review", async () => {
    const { generate, save, lines, stop } = await setup();
    save("a.ts", "export const a = 2;\n");
    save("a.ts", "export const a = 3;\n");
    save("a.ts", "export const a = 4;\n");
    await until(() => expect(lines.join("\n")).toContain("Bad"));
    await settle();
    expect(generate).toHaveBeenCalledTimes(1);
    await stop();
  });

  it("reviews each changed file separately", async () => {
    const { generate, save, stop } = await setup();
    save("a.ts", "export const a = 2;\n");
    save("b.ts", "export const b = 1;\n");
    await until(() => expect(generate).toHaveBeenCalledTimes(2));
    await stop();
  });

  it("skips a save whose diff has not changed", async () => {
    const { generate, save, stop } = await setup();
    save("a.ts", "export const a = 2;\n");
    await until(() => expect(generate).toHaveBeenCalledTimes(1));
    save("a.ts", "export const a = 2;\n");
    await settle();
    expect(generate).toHaveBeenCalledTimes(1);
    await stop();
  });

  it("stays silent when the change was reverted", async () => {
    const { generate, save, lines, stop } = await setup();
    save("a.ts", "export const a = 1;\n");
    await settle();
    expect(generate).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
    await stop();
  });

  it("prints nothing when the review finds no issues", async () => {
    const { save, lines, stop } = await setup(vi.fn(async () => JSON.stringify({ issues: [] })));
    save("a.ts", "export const a = 2;\n");
    await settle();
    expect(lines).toEqual([]);
    await stop();
  });

  it("prints one line on a Gemini error and keeps watching", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new ReviewError("network", "Could not reach Gemini."))
      .mockResolvedValue(issues());
    const { save, lines, stop } = await setup(generate);
    save("a.ts", "export const a = 2;\n");
    await until(() => expect(lines).toEqual(["Could not reach Gemini."]));
    save("a.ts", "export const a = 5;\n");
    await until(() => expect(lines.join("\n")).toContain("Bad"));
    await stop();
  });

  it("does not review after stop", async () => {
    const { generate, save, stop } = await setup();
    save("a.ts", "export const a = 2;\n");
    await stop();
    await settle();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("watch safety", () => {
  it("never sends gitignored files like .env to the model", async () => {
    const { dir, generate, save, stop } = await setup();
    writeFileSync(join(dir, ".gitignore"), ".env\n");
    save(".env", "SECRET=1\n");
    await settle();
    expect(generate).not.toHaveBeenCalled();
    await stop();
  });

  it("prints watcher errors and keeps running", async () => {
    const { watcher, save, lines, stop } = await setup();
    watcher.fail(new Error("EMFILE: too many open files"));
    expect(lines).toEqual(["Revio watch error: EMFILE: too many open files"]);
    save("a.ts", "export const a = 2;\n");
    await until(() => expect(lines.join("\n")).toContain("Bad"));
    await stop();
  });
});

describe("isIgnoredPath", () => {
  it("checks paths relative to the repo root", () => {
    expect(isIgnoredPath("/home/me/build/app", "/home/me/build/app/src/a.ts")).toBe(false);
    expect(isIgnoredPath("/home/me/app", "/home/me/app/node_modules/x/i.js")).toBe(true);
    expect(isIgnoredPath("/home/me/app", "/home/me/app/.git/HEAD")).toBe(true);
    expect(isIgnoredPath("/home/me/app", "/home/me/app/dist/a.js")).toBe(true);
  });
});
