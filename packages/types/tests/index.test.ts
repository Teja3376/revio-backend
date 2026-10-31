import { describe, expect, it } from "vitest";
import { IssueSchema, RevioConfigSchema } from "../src/index";

const issue = { file: "src/a.ts", line: 3, severity: "error", category: "bug", message: "x" };

describe("RevioConfigSchema", () => {
  it("accepts an empty config", () => {
    expect(RevioConfigSchema.parse({})).toEqual({});
  });

  it("accepts depth and ignore", () => {
    const cfg = { depth: { cli: "quick" }, ignore: ["**/*.snap"] };
    expect(RevioConfigSchema.parse(cfg)).toEqual(cfg);
  });

  it("rejects an unknown depth", () => {
    expect(RevioConfigSchema.safeParse({ depth: { cli: "deep" } }).success).toBe(false);
  });
});

describe("IssueSchema", () => {
  it("accepts a valid issue", () => {
    expect(IssueSchema.parse(issue)).toEqual(issue);
  });

  it.each([0, -1, 1.5])("rejects line %s", (line) => {
    expect(IssueSchema.safeParse({ ...issue, line }).success).toBe(false);
  });
});
