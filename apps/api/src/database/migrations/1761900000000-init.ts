import type { MigrationInterface, QueryRunner } from "typeorm";

export class Init1761900000000 implements MigrationInterface {
  name = "Init1761900000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      create table users (
        id uuid primary key,
        github_id bigint not null unique,
        github_login text not null,
        avatar_url text,
        created_at timestamptz not null default now()
      );

      create table installations (
        id uuid primary key default gen_random_uuid(),
        github_installation_id bigint not null unique,
        account_login text not null,
        account_type text not null,
        created_at timestamptz not null default now()
      );

      create table user_installations (
        user_id uuid not null references users(id) on delete cascade,
        installation_id uuid not null references installations(id) on delete cascade,
        primary key (user_id, installation_id)
      );

      create table repos (
        id uuid primary key default gen_random_uuid(),
        installation_id uuid not null references installations(id) on delete cascade,
        github_repo_id bigint not null unique,
        full_name text not null,
        enabled boolean not null default true,
        depth text not null default 'full' check (depth in ('quick', 'normal', 'full')),
        ignore_globs text[] not null default '{}',
        created_at timestamptz not null default now()
      );

      create table reviews (
        id uuid primary key default gen_random_uuid(),
        repo_id uuid not null references repos(id) on delete cascade,
        pr_number integer not null,
        pr_title text not null,
        pr_url text not null,
        head_sha text not null,
        base_sha text not null,
        status text not null check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
        summary text,
        risk text check (risk in ('low', 'medium', 'high')),
        issue_count integer not null default 0,
        error text,
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        unique (repo_id, pr_number, head_sha)
      );
      create index reviews_repo_started_idx on reviews (repo_id, started_at desc);

      create table review_issues (
        id uuid primary key default gen_random_uuid(),
        review_id uuid not null references reviews(id) on delete cascade,
        file text not null,
        line integer not null,
        end_line integer,
        severity text not null check (severity in ('error', 'warning', 'info')),
        category text not null check (category in ('bug', 'security', 'performance', 'quality', 'style')),
        message text not null,
        suggestion text
      );
      create index review_issues_review_idx on review_issues (review_id);

      -- Only the API (direct Postgres connection) touches these; nothing through Supabase's public API.
      alter table users enable row level security;
      alter table installations enable row level security;
      alter table user_installations enable row level security;
      alter table repos enable row level security;
      alter table reviews enable row level security;
      alter table review_issues enable row level security;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      drop table review_issues;
      drop table reviews;
      drop table repos;
      drop table user_installations;
      drop table installations;
      drop table users;
    `);
  }
}
