# Revio Phase 3: API + GitHub App, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A NestJS API in `apps/api` that receives GitHub App webhooks, reviews pull requests with `@revio/core` at full depth, posts inline comments plus one summary comment, stores review results (never code), and serves the dashboard's REST API.

**Architecture:** One Nest process: HTTP (webhooks + REST) and a pg-boss worker on the same Supabase Postgres. Domain modules under `src/`: `config`, `database`, `auth`, `github`, `installations`, `repos`, `reviews`, `me`. Business logic lives in plain services that take their dependencies as constructor args, so tests use fakes (no network, no database).

**Tech Stack:** NestJS 12, TypeORM 1.x + `pg`, pg-boss 12, `@octokit/app`, `@octokit/webhooks-methods`, `jose` (Supabase JWT via JWKS), zod (env, request bodies, webhook payloads), `@nestjs/swagger`, vitest + `unplugin-swc` (decorator metadata), Biome.

**Spec:** `docs/superpowers/specs/2026-10-30-revio-design.md` §4.4 (flow, REST, data model, config precedence, 50/day cap). JSON shapes: `revio-frontend/docs/superpowers/specs/2026-10-30-revio-frontend-design.md` § Data (the frontend already codes against them). Comment format: the GitHub sample on the landing page (`revio-frontend/src/modules/landing/components/github-sample.tsx`).

## Global Constraints

- Node ≥ 22.12, TypeScript strict, ESM. Tests never touch the network or a database.
- Every webhook payload, request body and env var is validated with zod at the boundary.
- Never store code or diffs. Never review the same `(repo, pr, head_sha)` twice. Never post when the AI output is unusable (core already guarantees this; on a failed review post nothing and mark the review failed).
- Secrets only from env; ship `apps/api/.env.example`.
- API JSON is camelCase, ids are uuid strings, times ISO 8601, errors `{ message }`.
- Conventional commits ending with the co-author line. No push.

## Decisions made here *(my calls)*

- `POST /me/github-link` `{ githubToken }`: the web app sends the GitHub provider token once after sign-in; the API lists the user's installations with it, upserts `users`, `installations`, `user_installations`, and drops the token.
- Daily cap env `REVIO_DAILY_REVIEW_CAP` (default 50) per installation, counted from `reviews.started_at` in the last 24 h; over the cap the PR gets one short comment and the review is stored with status `skipped`.
- Status values: `queued`, `running`, `done`, `failed`, `skipped` (matches the frontend spec).
- Summary comment is found again by a hidden marker `<!-- revio:summary -->` and edited in place.
- Job queue `review-pr`, 3 attempts, exponential backoff (spec).
- Health check `GET /health` (unauthenticated) for the host.

## Review Focus

1. A webhook with a bad or missing signature: 401, nothing enqueued. Test in Task 4.
2. A force-push: compare `last...head` fails, so the full PR diff is used. Test in Task 6.
3. A user asking for a repo or review outside their installations: 404, never 403 (don't confirm it exists). Test in Task 7.
4. Gemini or GitHub failing mid-review: the review ends `failed` with the error text, nothing half-posted. Test in Task 6.
5. Draft PRs, disabled repos and the daily cap: no Gemini call. Tests in Task 6.

---

### Task 1: App scaffold, config, health
**Files:** `apps/api/{package.json,tsconfig.json,vitest.config.ts,nest-cli.json,.env.example}`, `src/main.ts`, `src/app.module.ts`, `src/config/env.ts`, `src/health.controller.ts`, tests.
**Produces:** `loadEnv(source = process.env): Env` (zod; required: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_JWKS_URL`, `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GEMINI_API_KEY`; optional `PORT`=4000, `WEB_ORIGIN`, `REVIO_DAILY_REVIEW_CAP`=50); a Nest `ENV` provider.
- [ ] Test: missing var → error naming it; defaults applied; `\n` in `GITHUB_PRIVATE_KEY` unescaped.
- [ ] Implement; `GET /health` → `{ ok: true }`; CORS for `WEB_ORIGIN`; Swagger at `/docs`; raw body kept for webhooks.
- [ ] typecheck, test, build pass; commit `feat(api): scaffold, config, health`.

### Task 2: Data model + migration
**Files:** `src/database/entities/*.ts`, `src/database/data-source.ts`, `src/database/migrations/<ts>-init.ts`, test.
**Produces:** entities `User, Installation, UserInstallation, Repo, Review, ReviewIssue` per spec §4.4 (uuid pks, `unique(repo_id, pr_number, head_sha)` on reviews, `ignore_globs text[]`, `depth` default `full`, `enabled` default true); `dataSource` (DIRECT_URL for migrations, no `synchronize`).
- [ ] Test: entity metadata (TypeORM `DataSource` built without connecting) has the six tables, the unique index and the defaults.
- [ ] Hand-written SQL migration matching the entities; commit `feat(api): data model and migration`.

### Task 3: Auth guard (Supabase JWT)
**Files:** `src/auth/{jwt.guard.ts,current-user.ts}`, test.
**Produces:** `SupabaseJwtGuard` (Bearer token verified with `jose.createRemoteJWKSet(SUPABASE_JWKS_URL)`, `aud: "authenticated"`); `@CurrentUser()` → `{ id: string }` (`sub`).
- [ ] Tests with a local key pair and an injected key set: valid → user; missing, expired, wrong audience, bad signature → 401.
- [ ] Commit `feat(api): Supabase JWT guard`.

### Task 4: GitHub webhooks
**Files:** `src/github/{signature.ts,webhooks.controller.ts,payloads.ts,github-app.ts}`, tests.
**Produces:** `verifySignature(secret, rawBody, header): Promise<boolean>`; zod schemas for `pull_request`, `installation`, `installation_repositories`; controller `POST /webhooks/github` → 401 on bad signature, 202 otherwise; PR actions `opened|synchronize|reopened|ready_for_review` enqueue `review-pr` `{ installationId, githubRepoId, prNumber, headSha }`; installation events call `InstallationsService`.
- [ ] Tests: good/bad/missing signature; each PR action enqueues once; `closed` and drafts don't; installation events routed; unknown events → 202, ignored.
- [ ] Commit `feat(api): GitHub webhooks`.

### Task 5: Installations + linking users
**Files:** `src/installations/installations.service.ts`, `src/me/me.controller.ts`, tests.
**Produces:** `onInstallation(payload)` (created/deleted/suspend), `onRepositories(payload)` (added/removed) upserting `installations` and `repos`; `linkUser(userId, githubToken)` using `GET /user` and `GET /user/installations` (paginated) to upsert the user and `user_installations`; `GET /me` → `{ id, githubLogin, avatarUrl }`; `POST /me/github-link`.
- [ ] Tests with fake repositories and a fake Octokit: install creates rows; repo removal deletes them; uninstall removes installation, repos and links; linking replaces the user's links.
- [ ] Commit `feat(api): installations and user linking`.

### Task 6: Review worker + comment format
**Files:** `src/reviews/{comment-format.ts,review-worker.ts,queue.ts}`, tests.
**Produces:** `formatInline(issue)`, `formatSummary(result, counts)` (with the summary marker); `ReviewWorker.handle(job)`:
1. Load repo by `githubRepoId`; stop if missing or disabled. Fetch the PR; stop if draft or closed.
2. Stop if a review for `(repo, pr, headSha)` exists. Count today's reviews for the installation; at the cap, comment once and save `skipped`.
3. Save `running`. Diff: compare `lastDoneHeadSha...headSha` when a previous `done` review exists, else the PR diff; on compare failure use the PR diff.
4. Config: dashboard settings + `.revio.json` from the base branch (`ignore` merged, `rules` kept; dashboard depth wins). Invalid `.revio.json` → ignored with a note in the summary.
5. `review({ diff, depth, config })`; post a review with inline comments (only for issues on lines in the diff, which core guarantees) and create or edit the summary comment.
6. Save `done` with summary, risk, issue count and issues; on any error save `failed` with the message and rethrow so pg-boss retries.
- [ ] Tests with fakes for repos, GitHub client and model client covering each step above and Review Focus 2, 4, 5.
- [ ] pg-boss wiring in `queue.ts` (create queue, `retryLimit: 3`, `retryBackoff: true`, worker registered on boot). Commit `feat(api): review worker`.

### Task 7: REST for the dashboard
**Files:** `src/repos/{repos.service.ts,repos.controller.ts}`, `src/reviews/{reviews.service.ts,reviews.controller.ts}`, tests.
**Produces:** `GET /repos` → `{ items: Repo[] }`; `PATCH /repos/:id` (zod: `enabled?`, `depth?`, `ignoreGlobs?` ≤ 50 items, each ≤ 200 chars) → `Repo`; `GET /reviews?repo=&page=` → `{ items, page, pageSize: 20, total }`; `GET /reviews/:id` → summary + issues. All scoped to the user's installations; outside → 404.
- [ ] Tests for scoping, pagination, validation errors (400 `{ message }`), camelCase mapping.
- [ ] Swagger tags. Commit `feat(api): dashboard REST API`.

### Task 8: Wire-up and docs
- [ ] `AppModule` wires everything; `pnpm --filter @revio/api build` and `start` boot with a fake env until the DB connect (expected to fail without a DB password); README section "Running the API" with the GitHub App settings (permissions: Pull requests R/W, Contents R, Metadata R; events: Pull request, Installation, Installation repositories; webhook URL `https://api.revio.charanteja.site/webhooks/github`).
- [ ] Update `CORE.md`/`CLAUDE.md` status. Commit `docs(api): running the API and GitHub App setup`.
