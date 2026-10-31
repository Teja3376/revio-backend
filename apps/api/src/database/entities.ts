import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";

// Every column names its type: the API is bundled with esbuild, which emits no decorator metadata.
// Foreign keys and ON DELETE rules live in the migration SQL.

// GitHub ids fit in a JS number; Postgres returns bigint as a string, so convert back.
const bigintAsNumber = {
  to: (v?: number) => v,
  from: (v?: string | null) => (v == null ? v : Number(v)),
};

@Entity({ name: "users" })
export class User {
  /** Supabase auth user id. */
  @PrimaryColumn({ type: "uuid" }) id: string;
  @Column({ name: "github_id", type: "bigint", transformer: bigintAsNumber }) githubId: number;
  @Column({ name: "github_login", type: "text" }) githubLogin: string;
  @Column({ name: "avatar_url", type: "text", nullable: true }) avatarUrl: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt: Date;
}

@Entity({ name: "installations" })
export class Installation {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({
    name: "github_installation_id",
    type: "bigint",
    unique: true,
    transformer: bigintAsNumber,
  })
  githubInstallationId: number;
  @Column({ name: "account_login", type: "text" }) accountLogin: string;
  @Column({ name: "account_type", type: "text" }) accountType: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt: Date;
}

@Entity({ name: "user_installations" })
export class UserInstallation {
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId: string;
  @PrimaryColumn({ name: "installation_id", type: "uuid" }) installationId: string;
}

export type Depth = "quick" | "normal" | "full";

@Entity({ name: "repos" })
export class Repo {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "installation_id", type: "uuid" }) installationId: string;
  @Column({ name: "github_repo_id", type: "bigint", unique: true, transformer: bigintAsNumber })
  githubRepoId: number;
  @Column({ name: "full_name", type: "text" }) fullName: string;
  @Column({ type: "boolean", default: true }) enabled: boolean;
  @Column({ type: "text", default: "full" }) depth: Depth;
  @Column({ name: "ignore_globs", type: "text", array: true, default: () => "'{}'" })
  ignoreGlobs: string[];
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt: Date;
}

export type ReviewStatus = "queued" | "running" | "done" | "failed" | "skipped";
export type Risk = "low" | "medium" | "high";

@Entity({ name: "reviews" })
@Index(["repoId", "prNumber", "headSha"], { unique: true })
export class Review {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "repo_id", type: "uuid" }) repoId: string;
  @Column({ name: "pr_number", type: "integer" }) prNumber: number;
  @Column({ name: "pr_title", type: "text" }) prTitle: string;
  @Column({ name: "pr_url", type: "text" }) prUrl: string;
  @Column({ name: "head_sha", type: "text" }) headSha: string;
  @Column({ name: "base_sha", type: "text" }) baseSha: string;
  @Column({ type: "text" }) status: ReviewStatus;
  @Column({ type: "text", nullable: true }) summary: string | null;
  @Column({ type: "text", nullable: true }) risk: Risk | null;
  @Column({ name: "issue_count", type: "integer", default: 0 }) issueCount: number;
  @Column({ type: "text", nullable: true }) error: string | null;
  @Column({ name: "started_at", type: "timestamptz", default: () => "now()" }) startedAt: Date;
  @Column({ name: "finished_at", type: "timestamptz", nullable: true }) finishedAt: Date | null;
}

@Entity({ name: "review_issues" })
export class ReviewIssue {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ name: "review_id", type: "uuid" }) reviewId: string;
  @Column({ type: "text" }) file: string;
  @Column({ type: "integer" }) line: number;
  @Column({ name: "end_line", type: "integer", nullable: true }) endLine: number | null;
  @Column({ type: "text" }) severity: "error" | "warning" | "info";
  @Column({ type: "text" }) category: "bug" | "security" | "performance" | "quality" | "style";
  @Column({ type: "text" }) message: string;
  @Column({ type: "text", nullable: true }) suggestion: string | null;
}

export const ENTITIES = [User, Installation, UserInstallation, Repo, Review, ReviewIssue];
