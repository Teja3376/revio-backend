import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Access per repository, not per installation: an org member only sees the repos GitHub
 * lets them see. Plus bookkeeping so a retried review never posts twice.
 */
export class PerRepoAccess1761990000000 implements MigrationInterface {
  name = "PerRepoAccess1761990000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      create table user_repos (
        user_id uuid not null references users(id) on delete cascade,
        repo_id uuid not null references repos(id) on delete cascade,
        primary key (user_id, repo_id)
      );
      alter table user_repos enable row level security;

      alter table reviews
        add column notes text[] not null default '{}',
        add column result_ready boolean not null default false,
        add column inline_posted boolean not null default false;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      alter table reviews drop column notes, drop column result_ready, drop column inline_posted;
      drop table user_repos;
    `);
  }
}
