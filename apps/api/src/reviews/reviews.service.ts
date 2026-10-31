import { Inject, Injectable } from "@nestjs/common";
import { DB, type Db } from "../database/db";
import type { ReviewStatus, Risk } from "../database/entities";

export const PAGE_SIZE = 20;

export type ReviewSummaryDto = {
  id: string;
  repoId: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  status: ReviewStatus;
  issueCount: number;
  startedAt: string;
  finishedAt: string | null;
};

export type IssueDto = {
  id: string;
  file: string;
  line: number;
  endLine?: number;
  severity: "error" | "warning" | "info";
  category: "bug" | "security" | "performance" | "quality" | "style";
  message: string;
  suggestion?: string;
};

export type ReviewDetailDto = ReviewSummaryDto & {
  summary: string | null;
  risk: Risk | null;
  error: string | null;
  issues: IssueDto[];
};

type Row = {
  id: string;
  repo_id: string;
  full_name: string;
  pr_number: number;
  pr_title: string;
  pr_url: string;
  status: ReviewStatus;
  issue_count: number;
  started_at: Date | string;
  finished_at: Date | string | null;
  summary: string | null;
  risk: Risk | null;
  error: string | null;
};

const iso = (d: Date | string) => new Date(d).toISOString();
const toSummary = (r: Row): ReviewSummaryDto => ({
  id: r.id,
  repoId: r.repo_id,
  repoFullName: r.full_name,
  prNumber: r.pr_number,
  prTitle: r.pr_title,
  prUrl: r.pr_url,
  status: r.status,
  issueCount: r.issue_count,
  startedAt: iso(r.started_at),
  finishedAt: r.finished_at ? iso(r.finished_at) : null,
});

const FROM = `from reviews v join repos r on r.id = v.repo_id
  where r.installation_id in (select installation_id from user_installations where user_id = $1)`;
const COLUMNS = `v.id, v.repo_id, r.full_name, v.pr_number, v.pr_title, v.pr_url, v.status, v.issue_count,
  v.started_at, v.finished_at, v.summary, v.risk, v.error`;

@Injectable()
export class ReviewsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string, q: { repo?: string; page: number }) {
    const filter = q.repo ? " and v.repo_id = $2" : "";
    const params = q.repo ? [userId, q.repo] : [userId];
    const [{ total = 0 } = {}] = await this.db.query<{ total: number }>(
      `select count(*)::int as total ${FROM}${filter}`,
      params,
    );
    const rows = await this.db.query<Row>(
      `select ${COLUMNS} ${FROM}${filter} order by v.started_at desc
       limit ${PAGE_SIZE} offset ${(q.page - 1) * PAGE_SIZE}`,
      params,
    );
    return { items: rows.map(toSummary), page: q.page, pageSize: PAGE_SIZE, total };
  }

  /** Undefined when the review doesn't exist or isn't the user's. */
  async get(userId: string, id: string): Promise<ReviewDetailDto | undefined> {
    const [row] = await this.db.query<Row>(`select ${COLUMNS} ${FROM} and v.id = $2`, [userId, id]);
    if (!row) return undefined;
    const issues = await this.db.query<{
      id: string;
      file: string;
      line: number;
      end_line: number | null;
      severity: IssueDto["severity"];
      category: IssueDto["category"];
      message: string;
      suggestion: string | null;
    }>(
      "select id, file, line, end_line, severity, category, message, suggestion from review_issues where review_id = $1 order by file, line",
      [id],
    );
    return {
      ...toSummary(row),
      summary: row.summary,
      risk: row.risk,
      error: row.error,
      issues: issues.map((i) => ({
        id: i.id,
        file: i.file,
        line: i.line,
        ...(i.end_line ? { endLine: i.end_line } : {}),
        severity: i.severity,
        category: i.category,
        message: i.message,
        ...(i.suggestion ? { suggestion: i.suggestion } : {}),
      })),
    };
  }
}
