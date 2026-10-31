import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config";

const dirWith = (content?: string) => {
  const dir = mkdtempSync(join(tmpdir(), "revio-cfg-"));
  if (content !== undefined) writeFileSync(join(dir, ".revio.json"), content);
  return dir;
};

describe("loadConfig", () => {
  it("returns {} when there is no .revio.json", async () => {
    expect(await loadConfig(dirWith())).toEqual({});
  });

  it("parses a valid file", async () => {
    const cfg = { depth: { cli: "normal" }, ignore: ["docs/**"], rules: "No any." };
    expect(await loadConfig(dirWith(JSON.stringify(cfg)))).toEqual(cfg);
  });

  it("names the bad field for schema errors", async () => {
    const p = loadConfig(dirWith('{"depth":{"cli":"deep"}}'));
    await expect(p).rejects.toBeInstanceOf(ConfigError);
    await expect(p).rejects.toThrow("depth.cli");
  });

  it("names the file for invalid JSON", async () => {
    await expect(loadConfig(dirWith("{bad json"))).rejects.toThrow(/\.revio\.json/);
  });
});
