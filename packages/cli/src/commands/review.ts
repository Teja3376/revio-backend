import {
  ConfigError,
  createGeminiClient,
  type Depth,
  loadConfig,
  type ModelClient,
  ReviewError,
  review,
  type Severity,
} from "@revio/core";
import { formatIssues, useColor } from "../format";
import { getDiff, NotAGitRepoError, repoRoot } from "../git";

export type ReviewOptions = {
  cwd: string;
  staged?: boolean;
  base?: string;
  depth?: Depth;
  blockOn?: Severity;
  env: NodeJS.ProcessEnv;
  client?: ModelClient;
  out: (s: string) => void;
};

const RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

/** Exit codes: 0 ok, 1 issues at or above blockOn, 2 usage/config/API error. */
export async function runReview(opts: ReviewOptions): Promise<0 | 1 | 2> {
  const { out } = opts;
  try {
    const root = await repoRoot(opts.cwd);
    const config = await loadConfig(root);
    const diff = await getDiff({ cwd: root, staged: opts.staged, base: opts.base });
    if (!diff.trim()) {
      out("No changes to review.");
      return 0;
    }
    const client = opts.client ?? clientFromEnv(opts.env);
    if (!client) {
      out("Set GEMINI_API_KEY to use Revio.");
      return 2;
    }
    const depth = opts.depth ?? config.depth?.cli ?? "quick";
    const result = await review({ diff, depth, config }, client);
    for (const w of result.warnings) out(w);
    out(
      result.issues.length
        ? formatIssues(result.issues, { color: useColor() })
        : "No issues found.",
    );
    const block = opts.blockOn;
    return block && result.issues.some((i) => RANK[i.severity] >= RANK[block]) ? 1 : 0;
  } catch (e) {
    if (e instanceof NotAGitRepoError || e instanceof ReviewError || e instanceof ConfigError) {
      out(e.message);
      return 2;
    }
    throw e;
  }
}

export const clientFromEnv = (env: NodeJS.ProcessEnv) =>
  env.GEMINI_API_KEY ? createGeminiClient(env.GEMINI_API_KEY) : undefined;
