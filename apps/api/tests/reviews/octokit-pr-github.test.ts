import { describe, expect, it, vi } from "vitest";
import { SUMMARY_MARKER } from "../../src/reviews/comment-format";
import { prGithubFromOctokit } from "../../src/reviews/octokit-pr-github";

function fakeOctokit() {
  return {
    request: vi.fn(async (_route: string, _params?: Record<string, unknown>) => ({
      data: {} as unknown,
    })),
    paginate: vi.fn(async (_route: string, _params?: Record<string, unknown>) => [] as unknown[]),
  };
}

describe("prGithubFromOctokit", () => {
  it("asks GitHub for the pull request as a diff", async () => {
    const o = fakeOctokit();
    o.request.mockResolvedValue({ data: "diff --git …" });
    expect(await prGithubFromOctokit(o).getPullDiff("a", "b", 3)).toBe("diff --git …");
    expect(o.request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner: "a",
      repo: "b",
      pull_number: 3,
      headers: { accept: "application/vnd.github.diff" },
    });
  });

  it("compares two commits as a diff", async () => {
    const o = fakeOctokit();
    o.request.mockResolvedValue({ data: "d" });
    await prGithubFromOctokit(o).compareDiff("a", "b", "h1", "h2");
    expect(o.request.mock.calls[0]?.[1]).toMatchObject({ basehead: "h1...h2" });
  });

  it("returns undefined for a missing file and the raw text otherwise", async () => {
    const o = fakeOctokit();
    o.request.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { status: 404 }));
    expect(await prGithubFromOctokit(o).getFile("a", "b", ".revio.json", "b1")).toBeUndefined();
    o.request.mockResolvedValueOnce({ data: '{"ignore":[]}' });
    expect(await prGithubFromOctokit(o).getFile("a", "b", ".revio.json", "b1")).toBe(
      '{"ignore":[]}',
    );
  });

  it("posts inline comments on the new side, as ranges when there is a start line", async () => {
    const o = fakeOctokit();
    await prGithubFromOctokit(o).createReview("a", "b", 3, {
      commitId: "h1",
      comments: [
        { path: "x.ts", line: 4, body: "one" },
        { path: "x.ts", line: 9, startLine: 7, body: "range" },
      ],
    });
    expect(o.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
      {
        owner: "a",
        repo: "b",
        pull_number: 3,
        commit_id: "h1",
        event: "COMMENT",
        comments: [
          { path: "x.ts", line: 4, side: "RIGHT", body: "one" },
          {
            path: "x.ts",
            line: 9,
            side: "RIGHT",
            start_line: 7,
            start_side: "RIGHT",
            body: "range",
          },
        ],
      },
    );
  });

  it("finds Revio's summary comment by its marker", async () => {
    const o = fakeOctokit();
    o.paginate.mockResolvedValue([
      { id: 1, body: "Looks good to me" },
      { id: 2, body: `${SUMMARY_MARKER}\n### Revio review` },
    ]);
    expect(await prGithubFromOctokit(o).findSummaryComment("a", "b", 3)).toBe(2);
  });
});
