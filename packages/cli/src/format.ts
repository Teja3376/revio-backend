import type { Issue, Severity } from "@revio/types";
import pc from "picocolors";

const ICON: Record<Severity, string> = { error: "✖", warning: "⚠", info: "ℹ" };

export function formatIssues(issues: Issue[], opts: { color: boolean }): string {
  const c = pc.createColors(opts.color);
  const paint: Record<Severity, (s: string) => string> = {
    error: c.red,
    warning: c.yellow,
    info: c.blue,
  };
  const sorted = [...issues].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return sorted
    .flatMap((i) => {
      const head = `${c.bold(`${i.file}:${i.line}`)}  ${paint[i.severity](`${ICON[i.severity]} ${i.severity}`)}  ${c.dim(`[${i.category}]`)} ${i.message}`;
      return i.suggestion ? [head, c.green(`    → ${i.suggestion}`)] : [head];
    })
    .join("\n");
}

export const useColor = () => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
