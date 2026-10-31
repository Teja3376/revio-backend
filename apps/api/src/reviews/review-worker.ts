import { Inject, Injectable } from "@nestjs/common";
import { type ModelClient, type RevioConfig, RevioConfigSchema, review } from "@revio/core";
import { DB, type Db } from "../database/db";
import type { Depth } from "../database/entities";
import type { ReviewJob } from "../github/tokens";
import { capReachedComment, inlineComment, summaryComment } from "./comment-format";
import { PR_GITHUB, type PrGithub, type PrGithubFactory } from "./pr-github";

export const MODEL_CLIENT = Symbol("MODEL_CLIENT");
export const WORKER_OPTIONS = Symbol("WORKER_OPTIONS");
export type WorkerOptions = { dailyCap: number };

type RepoRow = {
  id: string;
  installation_id: string;
  full_name: string;
  enabled: boolean;
  depth: Depth;
  ignore_globs: string[];
};

@Injectable()
export class ReviewWorker {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PR_GITHUB) private readonly github: PrGithubFactory,
    @Inject(MODEL_CLIENT) private readonly model: ModelClient,
    @Inject(WORKER_OPTIONS) private readonly opts: WorkerOptions,
  ) {}

  async handle(job: ReviewJob): Promise<void> {
    const [repo] = await this.db.query<RepoRow>(
      "select id, installation_id, full_name, enabled, depth, ignore_globs from repos where github_repo_id = $1",
      [job.githubRepoId],
    );
    if (!repo?.enabled) return;
    const [owner = "", name = ""] = repo.full_name.split("/");
    const gh = this.github.forInstallation(job.installationId);

    const pull = await gh.getPull(owner, name, job.prNumber);
    // drafts, closed PRs, and pushes that a newer push already replaced
    if (pull.draft || pull.state !== "open" || pull.head.sha !== job.headSha) return;

    const row = [repo.id, job.prNumber, pull.title, pull.html_url, job.headSha, pull.base.sha];
    if (await this.capReached(repo.installation_id)) {
      const skipped = await this.db.query(
        `insert into reviews (repo_id, pr_number, pr_title, pr_url, head_sha, base_sha, status, finished_at)
         values ($1, $2, $3, $4, $5, $6, 'skipped', now())
         on conflict (repo_id, pr_number, head_sha) do nothing returning id`,
        row,
      );
      if (skipped.length)
        await gh.createComment(owner, name, job.prNumber, capReachedComment(this.opts.dailyCap));
      return;
    }

    // Claim this commit. A commit is reviewed once; only a failed attempt may run again.
    const [claimed] = await this.db.query<{ id: string }>(
      `insert into reviews (repo_id, pr_number, pr_title, pr_url, head_sha, base_sha, status)
       values ($1, $2, $3, $4, $5, $6, 'running')
       on conflict (repo_id, pr_number, head_sha) do update
         set status = 'running', error = null, started_at = now(), finished_at = null
         where reviews.status = 'failed'
       returning id`,
      row,
    );
    if (!claimed) return;

    try {
      await this.run(claimed.id, repo, gh, owner, name, job, pull.base.sha);
    } catch (e) {
      await this.db.query(
        "update reviews set status = 'failed', error = $2, finished_at = now() where id = $1",
        [claimed.id, (e as Error).message],
      );
      throw e; // the queue retries
    }
  }

  private async run(
    reviewId: string,
    repo: RepoRow,
    gh: PrGithub,
    owner: string,
    name: string,
    job: ReviewJob,
    baseSha: string,
  ) {
    const diff = await this.diffFor(repo.id, gh, owner, name, job);
    const notes: string[] = [];
    const fileConfig = await this.repoConfig(gh, owner, name, baseSha, notes);
    // Dashboard settings win; .revio.json adds its ignore patterns and rules.
    const config: RevioConfig = {
      ...fileConfig,
      ignore: [...repo.ignore_globs, ...(fileConfig.ignore ?? [])],
    };

    const result = await review({ diff, depth: repo.depth, config }, this.model);
    notes.push(...result.warnings);

    const comments = result.issues.map((i) => ({
      path: i.file,
      line: i.endLine ?? i.line,
      ...(i.endLine && i.endLine !== i.line ? { startLine: i.line } : {}),
      body: inlineComment(i),
    }));
    if (comments.length) {
      try {
        await gh.createReview(owner, name, job.prNumber, { commitId: job.headSha, comments });
      } catch (e) {
        if ((e as { status?: number }).status !== 422) throw e;
        const n = comments.length;
        notes.push(
          `Revio couldn’t place ${n} comment${n > 1 ? "s" : ""} on the diff; see the dashboard for details.`,
        );
      }
    }

    const body = summaryComment({
      headSha: job.headSha,
      risk: result.risk,
      summary: result.summary,
      issues: result.issues,
      notes,
    });
    const existing = await gh.findSummaryComment(owner, name, job.prNumber);
    if (existing) await gh.updateComment(owner, name, existing, body);
    else await gh.createComment(owner, name, job.prNumber, body);

    await this.db.query(
      `update reviews set status = 'done', summary = $2, risk = $3, issue_count = $4, finished_at = now()
       where id = $1`,
      [reviewId, result.summary ?? null, result.risk ?? null, result.issues.length],
    );
    for (const i of result.issues) {
      await this.db.query(
        `insert into review_issues (review_id, file, line, end_line, severity, category, message, suggestion)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          reviewId,
          i.file,
          i.line,
          i.endLine ?? null,
          i.severity,
          i.category,
          i.message,
          i.suggestion ?? null,
        ],
      );
    }
  }

  /** Only what changed since the last reviewed push; the whole PR on the first review or after a force-push. */
  private async diffFor(repoId: string, gh: PrGithub, owner: string, name: string, job: ReviewJob) {
    const [last] = await this.db.query<{ head_sha: string }>(
      `select head_sha from reviews
       where repo_id = $1 and pr_number = $2 and status = 'done' and head_sha <> $3
       order by finished_at desc limit 1`,
      [repoId, job.prNumber, job.headSha],
    );
    if (!last) return gh.getPullDiff(owner, name, job.prNumber);
    try {
      return await gh.compareDiff(owner, name, last.head_sha, job.headSha);
    } catch {
      return gh.getPullDiff(owner, name, job.prNumber);
    }
  }

  /** .revio.json from the base branch, so a PR can't change its own review rules. */
  private async repoConfig(
    gh: PrGithub,
    owner: string,
    name: string,
    baseSha: string,
    notes: string[],
  ) {
    const raw = await gh.getFile(owner, name, ".revio.json", baseSha);
    if (!raw) return {};
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      notes.push("Ignored .revio.json: it isn’t valid JSON.");
      return {};
    }
    const parsed = RevioConfigSchema.safeParse(json);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    notes.push(`Ignored .revio.json: ${issue?.path.join(".")}: ${issue?.message}`);
    return {};
  }

  private async capReached(installationId: string): Promise<boolean> {
    const [row] = await this.db.query<{ n: number }>(
      `select count(*)::int as n from reviews r join repos p on p.id = r.repo_id
       where p.installation_id = $1 and r.status <> 'skipped' and r.started_at > now() - interval '24 hours'`,
      [installationId],
    );
    return (row?.n ?? 0) >= this.opts.dailyCap;
  }
}
