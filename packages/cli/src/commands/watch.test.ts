import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ReviewError } from "@revio/core";
import { describe, expect, it, vi } from "vitest";
import { tempRepo } from "../test-utils";
import { startWatch } from "./watch";

const DEBOUNCE = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(DEBOUNCE * 6);

function fakeWatcher() {
  const handlers: ((p: string) => void)[] = [];
  return {
    on: (_ev: "change" | "add", cb: (p: string) => void) => {
      handlers.push(cb);
    },
    close: async () => {},
    emit: (p: string) => {
      for (const h of handlers) h(p);
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
    await settle();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(lines.join("\n")).toContain("Bad");
    await stop();
  });

  it("reviews each changed file separately", async () => {
    const { generate, save, stop } = await setup();
    save("a.ts", "export const a = 2;\n");
    save("b.ts", "export const b = 1;\n");
    await settle();
    expect(generate).toHaveBeenCalledTimes(2);
    await stop();
  });

  it("skips a save whose diff has not changed", async () => {
    const { generate, save, stop } = await setup();
    save("a.ts", "export const a = 2;\n");
    await settle();
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
    await settle();
    expect(lines).toEqual(["Could not reach Gemini."]);
    save("a.ts", "export const a = 5;\n");
    await settle();
    expect(lines.join("\n")).toContain("Bad");
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
