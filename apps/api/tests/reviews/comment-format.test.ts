import { describe, expect, it } from "vitest";
import {
  capReachedComment,
  inlineComment,
  SUMMARY_MARKER,
  summaryComment,
} from "../../src/reviews/comment-format";

describe("inlineComment", () => {
  it("leads with category and severity, then the message", () => {
    const body = inlineComment({
      file: "a.ts",
      line: 4,
      severity: "error",
      category: "security",
      message: "SQL built from input.",
    });
    expect(body).toBe("**Security error:** SQL built from input.");
  });

  it("adds a GitHub suggestion block the author can commit", () => {
    const body = inlineComment({
      file: "a.ts",
      line: 4,
      severity: "warning",
      category: "bug",
      message: "rows[0] may be undefined.",
      suggestion: "if (!rows[0]) return notFound();",
    });
    expect(body).toBe(
      "**Bug warning:** rows[0] may be undefined.\n\n```suggestion\nif (!rows[0]) return notFound();\n```",
    );
  });
});

describe("summaryComment", () => {
  const base = { headSha: "abcdef1234", issues: [], notes: [] };

  it("carries the hidden marker so the next push edits it in place", () => {
    expect(
      summaryComment({ ...base, risk: "low", summary: "Small change." }).startsWith(SUMMARY_MARKER),
    ).toBe(true);
  });

  it("shows risk, issue counts and the summary", () => {
    const body = summaryComment({
      ...base,
      risk: "high",
      summary: "Adds a user lookup endpoint.",
      issues: [{ severity: "error" }, { severity: "warning" }, { severity: "warning" }] as never,
    });
    expect(body).toContain("**Risk:** High");
    expect(body).toContain("**Issues:** 1 error, 2 warnings");
    expect(body).toContain("Adds a user lookup endpoint.");
    expect(body).toContain("abcdef1");
  });

  it("says plainly when nothing was found", () => {
    expect(summaryComment({ ...base, risk: "low" })).toContain("**Issues:** none found");
  });

  it("lists notes such as an invalid .revio.json", () => {
    expect(
      summaryComment({ ...base, notes: ["Ignored .revio.json: depth.github: Invalid option"] }),
    ).toContain("- Ignored .revio.json: depth.github: Invalid option");
  });
});

describe("capReachedComment", () => {
  it("explains the daily limit", () => {
    expect(capReachedComment(50)).toMatch(/50 reviews/);
  });
});
