import type { Issue } from "@revio/types";
import { describe, expect, it } from "vitest";
import { formatIssues } from "../src/format";

const ANSI = "\u001b[";

const issue = (over: Partial<Issue>): Issue => ({
  file: "src/a.ts",
  line: 1,
  severity: "warning",
  category: "bug",
  message: "m",
  ...over,
});

describe("formatIssues", () => {
  it("prints one line per issue, sorted by file then line, with suggestions indented", () => {
    const out = formatIssues(
      [
        issue({ file: "src/b.ts", line: 3 }),
        issue({
          file: "src/a.ts",
          line: 42,
          severity: "error",
          category: "security",
          message: "Timing attack",
          suggestion: "timingSafeEqual(a, b)",
        }),
        issue({ file: "src/a.ts", line: 7, severity: "info", message: "Hmm" }),
      ],
      { color: false },
    );
    expect(out.split("\n")).toEqual([
      "src/a.ts:7  ℹ info  [bug] Hmm",
      "src/a.ts:42  ✖ error  [security] Timing attack",
      "    → timingSafeEqual(a, b)",
      "src/b.ts:3  ⚠ warning  [bug] m",
    ]);
  });

  it("emits no ANSI codes when color is off", () => {
    expect(formatIssues([issue({})], { color: false })).not.toContain(ANSI);
  });

  it("colors output when color is on", () => {
    expect(formatIssues([issue({})], { color: true })).toContain(ANSI);
  });
});
