import type { Issue } from "@revio/types";
import { describe, expect, it, vi } from "vitest";
import { parseDiff } from "./diff";
import { ReviewError } from "./model";
import { buildPrompt } from "./prompt";
import { review } from "./review";

const diffFor = (path: string, added: string[], start = 1) =>
  [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${start},0 +${start},${added.length} @@`,
    ...added.map((l) => `+${l}`),
  ].join("\n");

const DIFF = diffFor("src/auth.ts", ["if (pw == input) {", "  login();", "}"], 40); // lines 40-42

const issue = (over: Partial<Issue> = {}): Issue => ({
  file: "src/auth.ts",
  line: 40,
  severity: "error",
  category: "security",
  message: "Timing-unsafe comparison",
  ...over,
});

const clientReturning = (...outputs: (string | Error)[]) => {
  const generate = vi.fn();
  for (const o of outputs) {
    if (o instanceof Error) generate.mockRejectedValueOnce(o);
    else generate.mockResolvedValueOnce(o);
  }
  return { generate };
};

const ok = (body: object) => JSON.stringify(body);

describe("review", () => {
  it("returns no issues and never calls the model for an empty diff", async () => {
    const client = clientReturning();
    expect(await review({ diff: "", depth: "quick" }, client)).toEqual({
      issues: [],
      warnings: [],
    });
    expect(client.generate).not.toHaveBeenCalled();
  });

  it("skips the model when every file is ignored", async () => {
    const client = clientReturning();
    const res = await review({ diff: diffFor("pnpm-lock.yaml", ["x"]), depth: "quick" }, client);
    expect(res.issues).toEqual([]);
    expect(client.generate).not.toHaveBeenCalled();
  });

  it("returns valid issues on added lines", async () => {
    const client = clientReturning(ok({ issues: [issue()] }));
    expect((await review({ diff: DIFF, depth: "quick" }, client)).issues).toEqual([issue()]);
  });

  it("drops issues on lines that were not added", async () => {
    const client = clientReturning(
      ok({ issues: [issue({ line: 10 }), issue({ file: "other.ts" })] }),
    );
    expect((await review({ diff: DIFF, depth: "quick" }, client)).issues).toEqual([]);
  });

  it("drops categories the depth does not allow", async () => {
    const client = clientReturning(ok({ issues: [issue({ category: "style" })] }));
    expect((await review({ diff: DIFF, depth: "quick" }, client)).issues).toEqual([]);
  });

  it("retries once when the first response is invalid", async () => {
    const client = clientReturning("not json", ok({ issues: [issue()] }));
    const res = await review({ diff: DIFF, depth: "quick" }, client);
    expect(client.generate).toHaveBeenCalledTimes(2);
    expect(res.issues).toEqual([issue()]);
  });

  it("returns a warning after two invalid responses", async () => {
    const client = clientReturning("nope", ok({ issues: [{ line: "x" }] }));
    const res = await review({ diff: DIFF, depth: "quick" }, client);
    expect(res.issues).toEqual([]);
    expect(res.warnings).toEqual([
      "Revio could not read the AI response for src/auth.ts. Try again.",
    ]);
  });

  it.each([
    [Object.assign(new Error("Too many"), { status: 429 }), "rate_limit"],
    [Object.assign(new Error("Denied"), { status: 403 }), "auth"],
    [Object.assign(new Error("API key not valid"), { status: 400 }), "auth"],
    [new TypeError("fetch failed"), "network"],
    [new Error("weird"), "unknown"],
  ])("maps %s to ReviewError kind %s", async (err, kind) => {
    const promise = review({ diff: DIFF, depth: "quick" }, clientReturning(err));
    await expect(promise).rejects.toBeInstanceOf(ReviewError);
    await expect(promise).rejects.toMatchObject({ kind });
  });

  it("splits large diffs into batches and merges the issues", async () => {
    const big = (name: string) =>
      diffFor(
        name,
        Array.from({ length: 1500 }, (_, i) => `l${i}`),
      );
    const diff = [big("a.ts"), big("b.ts"), big("c.ts")].join("\n");
    const client = {
      generate: vi.fn(async ({ prompt }: { prompt: string }) => {
        const file = ["a.ts", "b.ts", "c.ts"].find((f) => prompt.includes(`File: ${f}`));
        return ok({ issues: [issue({ file, line: 1, category: "bug" })] });
      }),
    };
    const res = await review({ diff, depth: "quick" }, client);
    expect(client.generate).toHaveBeenCalledTimes(3);
    expect(res.issues.map((i) => i.file)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("returns summary and risk only at full depth", async () => {
    const body = ok({ issues: [], summary: "Adds login", risk: "high" });
    const full = await review({ diff: DIFF, depth: "full" }, clientReturning(body));
    expect(full).toMatchObject({ summary: "Adds login", risk: "high" });
    const quick = await review({ diff: DIFF, depth: "quick" }, clientReturning(body));
    expect(quick.summary).toBeUndefined();
    expect(quick.risk).toBeUndefined();
  });

  it("uses the configured model, else the depth default", async () => {
    const client = clientReturning(ok({ issues: [] }), ok({ issues: [] }));
    await review({ diff: DIFF, depth: "quick", config: { model: "my-model" } }, client);
    await review({ diff: DIFF, depth: "full" }, client);
    expect(client.generate.mock.calls.map((c) => c[0].model)).toEqual([
      "my-model",
      "gemini-pro-latest",
    ]);
  });
});

describe("buildPrompt", () => {
  const files = parseDiff(DIFF);

  it("includes custom rules verbatim", () => {
    expect(buildPrompt(files, "quick", "Never use any.")).toContain("Never use any.");
  });

  it("lists only the depth's categories", () => {
    const p = buildPrompt(files, "quick");
    expect(p).toContain("bug, security");
    expect(p).not.toContain("performance");
  });

  it("numbers the added lines with new-file line numbers", () => {
    expect(buildPrompt(files, "quick")).toContain("40 +if (pw == input) {");
  });
});

describe("ReviewError messages", () => {
  it("keeps Gemini's own reason for auth errors", async () => {
    const err = Object.assign(
      new Error(
        '{"error":{"message":"The Gemini API free tier is not available for this project."}}',
      ),
      { status: 403 },
    );
    await expect(review({ diff: DIFF, depth: "quick" }, clientReturning(err))).rejects.toThrow(
      "Gemini refused the request (403): The Gemini API free tier is not available for this project.",
    );
  });
});
