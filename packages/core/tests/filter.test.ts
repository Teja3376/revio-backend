import { describe, expect, it } from "vitest";
import type { FileDiff } from "./diff";
import { categoriesFor, filterFiles } from "./filter";

const f = (path: string, extra: Partial<FileDiff> = {}): FileDiff => ({
  path,
  status: "modified",
  binary: false,
  addedLines: [1],
  patch: "",
  ...extra,
});

describe("filterFiles", () => {
  it("drops lockfiles, build output, minified and map files", () => {
    const files = [
      "pnpm-lock.yaml",
      "web/package-lock.json",
      "yarn.lock",
      "dist/x.js",
      "app/build/y.js",
      "a.min.js",
      "a.js.map",
    ].map((p) => f(p));
    expect(filterFiles(files)).toEqual([]);
  });

  it("drops binary and deleted files", () => {
    expect(filterFiles([f("a.png", { binary: true }), f("b.ts", { status: "deleted" })])).toEqual(
      [],
    );
  });

  it("keeps normal source files", () => {
    expect(filterFiles([f("src/a.ts")]).map((x) => x.path)).toEqual(["src/a.ts"]);
  });

  it("drops files matching user ignore globs", () => {
    const kept = filterFiles([f("src/a.ts"), f("src/a.test.ts")], ["**/*.test.ts"]);
    expect(kept.map((x) => x.path)).toEqual(["src/a.ts"]);
  });
});

describe("categoriesFor", () => {
  it("maps each depth to its categories", () => {
    expect(categoriesFor("quick")).toEqual(["bug", "security"]);
    expect(categoriesFor("normal")).toEqual(["bug", "security", "performance", "quality"]);
    expect(categoriesFor("full")).toEqual(["bug", "security", "performance", "quality", "style"]);
  });
});
