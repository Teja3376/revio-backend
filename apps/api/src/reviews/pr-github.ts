/** The GitHub calls a review needs, scoped to one installation. */
export interface PrGithub {
  getPull(
    owner: string,
    repo: string,
    pr: number,
  ): Promise<{
    title: string;
    html_url: string;
    draft: boolean;
    state: string;
    head: { sha: string };
    base: { sha: string };
  }>;
  getPullDiff(owner: string, repo: string, pr: number): Promise<string>;
  compareDiff(owner: string, repo: string, base: string, head: string): Promise<string>;
  /** File contents at a ref, or undefined if it doesn't exist. */
  getFile(owner: string, repo: string, path: string, ref: string): Promise<string | undefined>;
  createReview(
    owner: string,
    repo: string,
    pr: number,
    review: {
      commitId: string;
      comments: { path: string; line: number; startLine?: number; body: string }[];
    },
  ): Promise<void>;
  /** The id of Revio's summary comment on the PR, if there is one. */
  findSummaryComment(owner: string, repo: string, pr: number): Promise<number | undefined>;
  createComment(owner: string, repo: string, pr: number, body: string): Promise<void>;
  updateComment(owner: string, repo: string, commentId: number, body: string): Promise<void>;
}

export interface PrGithubFactory {
  forInstallation(installationId: number): PrGithub;
}
export const PR_GITHUB = Symbol("PR_GITHUB");
