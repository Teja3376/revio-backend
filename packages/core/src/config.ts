import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type RevioConfig, RevioConfigSchema } from "@revio/types";

export class ConfigError extends Error {
  override name = "ConfigError";
}

/** Reads `<cwd>/.revio.json`; a missing file means defaults. */
export async function loadConfig(cwd: string): Promise<RevioConfig> {
  const file = join(cwd, ".revio.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new ConfigError(`Could not read ${file}: ${(e as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new ConfigError(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  const parsed = RevioConfigSchema.safeParse(json);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new ConfigError(`Invalid ${file}:\n  ${problems.join("\n  ")}`);
  }
  return parsed.data;
}
