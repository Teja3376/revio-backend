import { GoogleGenAI } from "@google/genai";
import type { Depth } from "@revio/types";

export interface ModelClient {
  generate(req: { model: string; prompt: string; jsonSchema: object }): Promise<string>;
}

// Aliases track Google's current stable models; override with `model` in .revio.json to pin one.
export const DEFAULT_MODELS: Record<Depth, string> = {
  quick: "gemini-flash-latest",
  normal: "gemini-flash-latest",
  full: "gemini-pro-latest",
};

export type ReviewErrorKind = "auth" | "rate_limit" | "network" | "unknown";

export class ReviewError extends Error {
  constructor(
    readonly kind: ReviewErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

const MESSAGES: Record<ReviewErrorKind, string> = {
  auth: "Gemini refused the request",
  rate_limit: "Gemini rate limit reached. Wait a minute and try again.",
  network: "Could not reach Gemini. Check your internet connection.",
  unknown: "Gemini request failed",
};

/** Gemini errors carry a JSON body in `message`; pull out the human-readable part. */
function apiMessage(message = ""): string {
  try {
    return JSON.parse(message)?.error?.message ?? message;
  } catch {
    return message;
  }
}

export function toReviewError(e: unknown): ReviewError {
  if (e instanceof ReviewError) return e;
  const err = e as { status?: number; message?: string; name?: string };
  let kind: ReviewErrorKind = "unknown";
  if (err.status === 401 || err.status === 403 || /api key/i.test(err.message ?? "")) kind = "auth";
  else if (err.status === 429) kind = "rate_limit";
  else if (
    err.name === "TypeError" ||
    /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT/.test(err.message ?? "")
  )
    kind = "network";
  const reason = apiMessage(err.message);
  const status = err.status ? ` (${err.status})` : "";
  const detail = (kind === "auth" || kind === "unknown") && reason ? `${status}: ${reason}` : "";
  return new ReviewError(kind, MESSAGES[kind] + detail);
}

export function createGeminiClient(apiKey: string): ModelClient {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generate({ model, prompt, jsonSchema }) {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseJsonSchema: jsonSchema },
      });
      return res.text ?? "";
    },
  };
}
