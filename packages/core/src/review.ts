import {
  type Depth,
  type Issue,
  type ReviewResult,
  ReviewResultSchema,
  type RevioConfig,
} from "@revio/types";
import { type FileDiff, parseDiff } from "./diff";
import { categoriesFor, filterFiles } from "./filter";
import { DEFAULT_MODELS, type ModelClient, toReviewError } from "./model";
import { buildPrompt, responseSchema } from "./prompt";

export const MAX_LINES_PER_REQUEST = 2000;

export type ReviewInput = { diff: string; depth: Depth; config?: RevioConfig };

/** Greedily packs whole files into batches of at most `max` added lines; a bigger file is its own batch. */
function batch(files: FileDiff[], max: number): FileDiff[][] {
  const batches: FileDiff[][] = [];
  let current: FileDiff[] = [];
  let size = 0;
  for (const f of files) {
    if (current.length && size + f.addedLines.length > max) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += f.addedLines.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

const RISK_ORDER = ["low", "medium", "high"] as const;

export async function review(input: ReviewInput, client: ModelClient): Promise<ReviewResult> {
  const { depth, config = {} } = input;
  const files = filterFiles(parseDiff(input.diff), config.ignore).filter(
    (f) => f.addedLines.length,
  );
  const result: ReviewResult = { issues: [], warnings: [] };
  if (!files.length) return result;

  const allowed = new Set(categoriesFor(depth));
  const model = config.model ?? DEFAULT_MODELS[depth];
  const summaries: string[] = [];

  for (const group of batch(files, MAX_LINES_PER_REQUEST)) {
    const req = {
      model,
      prompt: buildPrompt(group, depth, config.rules),
      jsonSchema: responseSchema(depth),
    };
    let parsed: ReturnType<typeof ReviewResultSchema.safeParse> | undefined;
    for (let attempt = 0; attempt < 2 && !parsed?.success; attempt++) {
      let text: string;
      try {
        text = await client.generate(req);
      } catch (e) {
        throw toReviewError(e);
      }
      try {
        parsed = ReviewResultSchema.safeParse(JSON.parse(text));
      } catch {
        parsed = undefined;
      }
    }
    if (!parsed?.success) {
      result.warnings.push(
        `Revio could not read the AI response for ${group.map((f) => f.path).join(", ")}. Try again.`,
      );
      continue;
    }

    const changed = new Map(group.map((f) => [f.path, new Set(f.addedLines)]));
    const onChangedLine = (i: Issue) => changed.get(i.file)?.has(i.line) ?? false;
    result.issues.push(
      ...parsed.data.issues.filter((i) => allowed.has(i.category) && onChangedLine(i)),
    );

    if (depth === "full") {
      if (parsed.data.summary) summaries.push(parsed.data.summary);
      const risk = parsed.data.risk;
      if (risk && (!result.risk || RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(result.risk)))
        result.risk = risk;
    }
  }
  if (summaries.length) result.summary = summaries.join("\n\n");
  return result;
}
