import type { Issue } from "@revio/types";

// The format the landing page shows (revio-frontend …/github-sample.tsx). Keep them in step.

export const SUMMARY_MARKER = "<!-- revio:summary -->";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function inlineComment(issue: Issue): string {
  const head = `**${cap(issue.category)} ${issue.severity}:** ${issue.message}`;
  return issue.suggestion ? `${head}\n\n\`\`\`suggestion\n${issue.suggestion}\n\`\`\`` : head;
}

function counts(issues: Pick<Issue, "severity">[]): string {
  const parts = (["error", "warning", "info"] as const)
    .map((s) => [s, issues.filter((i) => i.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}${n > 1 ? "s" : ""}`);
  return parts.length ? parts.join(", ") : "none found";
}

export function summaryComment(input: {
  headSha: string;
  risk?: "low" | "medium" | "high";
  summary?: string;
  issues: Pick<Issue, "severity">[];
  notes: string[];
}): string {
  return [
    SUMMARY_MARKER,
    "### Revio review",
    "",
    input.risk ? `**Risk:** ${cap(input.risk)}  ` : "",
    `**Issues:** ${counts(input.issues)}`,
    "",
    input.summary ?? "",
    ...(input.notes.length ? ["", ...input.notes.map((n) => `- ${n}`)] : []),
    "",
    `<sub>Reviewed ${input.headSha.slice(0, 7)}. Revio reviews each new push.</sub>`,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}

export function capReachedComment(limit: number): string {
  return `Revio has used today’s ${limit} reviews for this installation, so this push wasn’t reviewed. The next push after the limit resets will be.`;
}
