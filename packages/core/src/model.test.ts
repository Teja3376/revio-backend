import { describe, expect, it, vi } from "vitest";

const ctor = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: vi.fn() };
    constructor(opts: unknown) {
      ctor(opts);
    }
  },
}));

const { createGeminiClient, toReviewError } = await import("./model");

describe("createGeminiClient", () => {
  it("sets a request timeout so a stalled network cannot hang a commit", () => {
    createGeminiClient("k");
    expect(ctor).toHaveBeenCalledWith({ apiKey: "k", httpOptions: { timeout: 60_000 } });
  });
});

describe("toReviewError", () => {
  it("reports timeouts as such", () => {
    const e = toReviewError(
      Object.assign(new Error("This operation was aborted"), { name: "AbortError" }),
    );
    expect(e).toMatchObject({
      kind: "network",
      message: "Gemini did not respond in time. Try again.",
    });
  });

  it("does not blame the network for programming errors", () => {
    expect(toReviewError(new TypeError("x is not a function")).kind).toBe("unknown");
  });

  it("still detects real network failures", () => {
    expect(toReviewError(new TypeError("fetch failed")).kind).toBe("network");
  });
});
