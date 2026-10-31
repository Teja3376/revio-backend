import type { App } from "@octokit/app";
import { SUMMARY_MARKER } from "./comment-format";
import type { PrGithub, PrGithubFactory } from "./pr-github";

/** The two Octokit methods used here, so tests can pass a fake. */
export type OctokitLike = {
  request(route: string, params?: Record<string, unknown>): Promise<{ data: unknown }>;
  paginate(route: string, params?: Record<string, unknown>): Promise<unknown[]>;
};

const DIFF = { accept: "application/vnd.github.diff" };

export function prGithubFromOctokit(o: OctokitLike): PrGithub {
  return {
    async getPull(owner, repo, pr) {
      const { data } = await o.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo,
        pull_number: pr,
      });
      return data as Awaited<ReturnType<PrGithub["getPull"]>>;
    },
    async getPullDiff(owner, repo, pr) {
      const { data } = await o.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo,
        pull_number: pr,
        headers: DIFF,
      });
      return data as string;
    },
    async compareDiff(owner, repo, base, head) {
      const { data } = await o.request("GET /repos/{owner}/{repo}/compare/{basehead}", {
        owner,
        repo,
        basehead: `${base}...${head}`,
        headers: DIFF,
      });
      return data as string;
    },
    async getFile(owner, repo, path, ref) {
      try {
        const { data } = await o.request("GET /repos/{owner}/{repo}/contents/{path}", {
          owner,
          repo,
          path,
          ref,
          headers: { accept: "application/vnd.github.raw+json" },
        });
        return data as string;
      } catch (e) {
        if ((e as { status?: number }).status === 404) return undefined;
        throw e;
      }
    },
    async createReview(owner, repo, pr, { commitId, comments }) {
      await o.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
        owner,
        repo,
        pull_number: pr,
        commit_id: commitId,
        event: "COMMENT",
        comments: comments.map(({ path, line, startLine, body }) => ({
          path,
          line,
          side: "RIGHT",
          ...(startLine ? { start_line: startLine, start_side: "RIGHT" } : {}),
          body,
        })),
      });
    },
    async findSummaryComment(owner, repo, pr) {
      const comments = (await o.paginate(
        "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner,
          repo,
          issue_number: pr,
          per_page: 100,
        },
      )) as { id: number; body?: string }[];
      return comments.find((c) => c.body?.startsWith(SUMMARY_MARKER))?.id;
    },
    async createComment(owner, repo, pr, body) {
      await o.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
        owner,
        repo,
        issue_number: pr,
        body,
      });
    },
    async updateComment(owner, repo, commentId, body) {
      await o.request("PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}", {
        owner,
        repo,
        comment_id: commentId,
        body,
      });
    },
  };
}

/** Each call runs with a fresh installation token from the GitHub App. */
export function githubAppFactory(app: App): PrGithubFactory {
  return {
    forInstallation(installationId) {
      const octokit = app.getInstallationOctokit(installationId) as unknown as Promise<OctokitLike>;
      const lazy = {
        request: async (route: string, params?: Record<string, unknown>) =>
          (await octokit).request(route, params),
        paginate: async (route: string, params?: Record<string, unknown>) =>
          (await octokit).paginate(route, params),
      };
      return prGithubFromOctokit(lazy);
    },
  };
}
