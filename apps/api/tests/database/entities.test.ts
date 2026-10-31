import "reflect-metadata";
import { getMetadataArgsStorage } from "typeorm";
import { describe, expect, it } from "vitest";
import { ENTITIES } from "./entities";

const storage = getMetadataArgsStorage();
const tableOf = (target: unknown) => storage.tables.find((t) => t.target === target)?.name;
const columnsOf = (target: unknown) => storage.columns.filter((c) => c.target === target);

describe("entities", () => {
  it("map to the six tables in the spec", () => {
    expect(ENTITIES.map(tableOf).sort()).toEqual([
      "installations",
      "repos",
      "review_issues",
      "reviews",
      "user_installations",
      "users",
    ]);
  });

  it("give every column an explicit database type (the bundle emits no decorator metadata)", () => {
    for (const entity of ENTITIES) {
      for (const col of columnsOf(entity)) {
        expect(col.options.type, `${tableOf(entity)}.${col.propertyName}`).toBeTruthy();
      }
    }
  });

  it("never reviews the same commit twice: unique (repo_id, pr_number, head_sha)", () => {
    const review = ENTITIES.find((e) => tableOf(e) === "reviews");
    const unique = storage.indices.find((i) => i.target === review && i.unique);
    expect(unique?.columns).toEqual(["repoId", "prNumber", "headSha"]);
  });

  it("enables repos at full depth with no ignore patterns by default", () => {
    const repo = ENTITIES.find((e) => tableOf(e) === "repos");
    const byName = Object.fromEntries(columnsOf(repo).map((c) => [c.propertyName, c.options]));
    expect(byName.enabled?.default).toBe(true);
    expect(byName.depth?.default).toBe("full");
    expect(byName.ignoreGlobs?.array).toBe(true);
  });

  it("stores no code or diffs", () => {
    const names = ENTITIES.flatMap((e) => columnsOf(e).map((c) => c.propertyName.toLowerCase()));
    expect(names.filter((n) => n.includes("diff") || n.includes("patch") || n === "code")).toEqual(
      [],
    );
  });
});
