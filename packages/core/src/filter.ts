import type { Category, Depth } from "@revio/types";
import picomatch from "picomatch";
import type { FileDiff } from "./diff";

export const DEFAULT_IGNORES = [
  "**/pnpm-lock.yaml",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/dist/**",
  "**/build/**",
  "**/*.min.*",
  "**/*.map",
];

/** Drops binary, deleted, default-ignored and user-ignored files. */
export function filterFiles(files: FileDiff[], ignore: string[] = []): FileDiff[] {
  const isIgnored = picomatch([...DEFAULT_IGNORES, ...ignore], { dot: true });
  return files.filter((f) => !f.binary && f.status !== "deleted" && !isIgnored(f.path));
}

const DEPTH_CATEGORIES: Record<Depth, Category[]> = {
  quick: ["bug", "security"],
  normal: ["bug", "security", "performance", "quality"],
  full: ["bug", "security", "performance", "quality", "style"],
};

export const categoriesFor = (depth: Depth): Category[] => DEPTH_CATEGORIES[depth];
