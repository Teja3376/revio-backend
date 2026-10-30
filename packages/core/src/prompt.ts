import type { Depth } from "@revio/types";
import type { FileDiff } from "./diff";
import { categoriesFor } from "./filter";

const FOCUS: Record<Depth, string> = {
  quick: "Report only real bugs and security problems. Stay silent about anything else.",
  normal: "Report bugs, security problems, performance problems and clear code-quality issues.",
  full: "Do a thorough review: bugs, security, performance, code quality and style. Also write a short summary of what the change does and rate its risk.",
};

/** Prefixes added and context lines with their new-file line number so the model can cite lines. */
function numberPatch(patch: string): string {
  const out: string[] = [];
  let n = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      n = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
      out.push(line);
    } else if (n > 0 && (line.startsWith("+") || line.startsWith(" "))) out.push(`${n++} ${line}`);
    else if (n > 0 && line.startsWith("-")) out.push(`   ${line}`);
  }
  return out.join("\n");
}

export function buildPrompt(files: FileDiff[], depth: Depth, rules?: string): string {
  const parts = [
    "You are Revio, a senior code reviewer. Review only the lines marked with + in the diff below.",
    FOCUS[depth],
    `Allowed categories: ${categoriesFor(depth).join(", ")}.`,
    "Each issue must cite the file path and the new-file line number shown at the start of the line.",
    "Be precise; do not report speculative or trivial problems. If a fix is obvious, put the replacement code in `suggestion`.",
    "If there are no problems, return an empty issues list.",
  ];
  if (rules?.trim()) parts.push(`Project rules from the team:\n${rules.trim()}`);
  for (const f of files) parts.push(`File: ${f.path}\n${numberPatch(f.patch)}`);
  return parts.join("\n\n");
}

/** JSON schema sent to Gemini (limited to the keywords Gemini supports). */
export function responseSchema(depth: Depth): object {
  const schema = {
    type: "object",
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            line: { type: "integer", minimum: 1 },
            endLine: { type: "integer", minimum: 1 },
            severity: { type: "string", enum: ["error", "warning", "info"] },
            category: { type: "string", enum: categoriesFor(depth) },
            message: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["file", "line", "severity", "category", "message"],
        },
      },
      summary: { type: "string" },
      risk: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: depth === "full" ? ["issues", "summary", "risk"] : ["issues"],
  };
  return schema;
}
