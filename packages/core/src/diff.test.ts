import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDiff } from "./diff";

const fixture = (name: string) =>
  readFileSync(new URL(`../test/fixtures/${name}.diff`, import.meta.url), "utf8");

describe("parseDiff", () => {
  it("records new-file line numbers of added lines", () => {
    const [f] = parseDiff(fixture("modified"));
    expect(f).toMatchObject({
      path: "src/a.ts",
      status: "modified",
      binary: false,
      addedLines: [11],
    });
    expect(f?.patch).toContain("+  const y = 2;");
  });

  it("returns one entry per file, in order", () => {
    const files = parseDiff(fixture("two-files"));
    expect(files.map((f) => [f.path, f.status, f.addedLines])).toEqual([
      ["src/a.ts", "modified", [1]],
      ["src/new.ts", "added", [1, 2]],
    ]);
  });

  it("marks deleted files with no added lines", () => {
    expect(parseDiff(fixture("deleted"))).toMatchObject([
      { path: "src/old.ts", status: "deleted", addedLines: [] },
    ]);
  });

  it("uses the new name for renamed files", () => {
    expect(parseDiff(fixture("renamed"))).toMatchObject([
      { path: "src/after.ts", status: "renamed", addedLines: [] },
    ]);
  });

  it("flags binary files", () => {
    expect(parseDiff(fixture("binary"))).toMatchObject([
      { path: "assets/logo.png", binary: true, addedLines: [] },
    ]);
  });

  it("tracks line numbers across hunks and ignores no-newline markers", () => {
    expect(parseDiff(fixture("multi-hunk"))[0]?.addedLines).toEqual([2, 21]);
  });

  it("returns [] for an empty diff", () => {
    expect(parseDiff("")).toEqual([]);
  });
});
