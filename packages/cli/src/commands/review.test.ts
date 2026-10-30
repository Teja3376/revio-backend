import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReviewError } from "@revio/core";
import { describe, expect, it, vi } from "vitest";
import { tempRepo } from "../test-utils";
import { runReview } from "./review";

const changedRepo = () => {
  const dir = tempRepo();
  writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
  return dir;
};

const issueJson = (severity: string) =>
  JSON.stringify({
    issues: [{ file: "a.ts", line: 1, severity, category: "bug", message: "Wrong value" }],
  });

const setup = (generate = vi.fn(async () => issueJson("error"))) => {
  const lines: string[] = [];
  return { client: { generate }, lines, out: (s: string) => lines.push(s) };
};

const env = { GEMINI_API_KEY: "k" };

describe("runReview", () => {
  it("says so and skips the model when there are no changes", async () => {
    const { client, lines, out } = setup();
    expect(await runReview({ cwd: tempRepo(), env, client, out })).toBe(0);
    expect(lines).toEqual(["No changes to review."]);
    expect(client.generate).not.toHaveBeenCalled();
  });

  it("prints issues and exits 0 without blockOn", async () => {
    const { client, lines, out } = setup();
    expect(await runReview({ cwd: changedRepo(), env, client, out })).toBe(0);
    expect(lines.join("\n")).toContain("a.ts:1");
    expect(lines.join("\n")).toContain("Wrong value");
  });

  it("prints a clean message when there are no issues", async () => {
    const { client, lines, out } = setup(vi.fn(async () => JSON.stringify({ issues: [] })));
    expect(await runReview({ cwd: changedRepo(), env, client, out })).toBe(0);
    expect(lines).toEqual(["No issues found."]);
  });

  it("exits 1 when an issue meets blockOn, 0 when below it", async () => {
    const err = setup();
    expect(
      await runReview({
        cwd: changedRepo(),
        env,
        blockOn: "error",
        client: err.client,
        out: err.out,
      }),
    ).toBe(1);
    const warn = setup(vi.fn(async () => issueJson("warning")));
    expect(
      await runReview({
        cwd: changedRepo(),
        env,
        blockOn: "error",
        client: warn.client,
        out: warn.out,
      }),
    ).toBe(0);
    const warn2 = setup(vi.fn(async () => issueJson("warning")));
    expect(
      await runReview({
        cwd: changedRepo(),
        env,
        blockOn: "warning",
        client: warn2.client,
        out: warn2.out,
      }),
    ).toBe(1);
  });

  it("asks for GEMINI_API_KEY when it is missing", async () => {
    const { lines, out } = setup();
    expect(await runReview({ cwd: changedRepo(), env: {}, out })).toBe(2);
    expect(lines).toEqual(["Set GEMINI_API_KEY to use Revio."]);
  });

  it("explains when it is not in a git repo", async () => {
    const { client, lines, out } = setup();
    const dir = mkdtempSync(join(tmpdir(), "revio-nogit-"));
    expect(await runReview({ cwd: dir, env, client, out })).toBe(2);
    expect(lines).toEqual(["Revio needs a git repository."]);
  });

  it("prints one line for Gemini errors and exits 2", async () => {
    const generate = vi.fn(async () => {
      throw new ReviewError(
        "rate_limit",
        "Gemini rate limit reached. Wait a minute and try again.",
      );
    });
    const { client, lines, out } = setup(generate);
    expect(await runReview({ cwd: changedRepo(), env, client, out })).toBe(2);
    expect(lines).toEqual(["Gemini rate limit reached. Wait a minute and try again."]);
  });

  it("exits 2 with the problem when .revio.json is invalid", async () => {
    const dir = changedRepo();
    writeFileSync(join(dir, ".revio.json"), '{"depth":{"cli":"deep"}}');
    const { client, lines, out } = setup();
    expect(await runReview({ cwd: dir, env, client, out })).toBe(2);
    expect(lines.join("\n")).toContain("depth.cli");
  });

  it("picks depth from the flag, then .revio.json, then quick", async () => {
    const prompts = async (depth: "normal" | undefined, cfg?: object) => {
      const dir = changedRepo();
      if (cfg) writeFileSync(join(dir, ".revio.json"), JSON.stringify(cfg));
      const generate = vi.fn(async (_req: { prompt: string }) => JSON.stringify({ issues: [] }));
      await runReview({ cwd: dir, env, depth, client: { generate }, out: () => {} });
      return generate.mock.calls[0]?.[0].prompt ?? "";
    };
    expect(await prompts(undefined)).not.toContain("performance");
    expect(await prompts(undefined, { depth: { cli: "normal" } })).toContain("performance");
    expect(await prompts("normal", { depth: { cli: "quick" } })).toContain("performance");
  });
});

describe("runReview git failures", () => {
  it("exits 2 with git's message for a bad base", async () => {
    const { client, lines, out } = setup();
    expect(await runReview({ cwd: tempRepo(), env, base: "nope", client, out })).toBe(2);
    expect(lines.join("\n")).toMatch(/nope/);
  });
});
