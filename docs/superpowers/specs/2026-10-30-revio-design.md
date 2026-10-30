# Revio — Design

*Review smarter. Ship confidently.* AI-powered code review in three places: the terminal, VS Code, and GitHub pull requests.

Date: 2026-10-30 · Owner: Charan Teja · Status: draft for approval

## 1. Intent

Revio is a CodeRabbit-style AI code reviewer, built as the owner's own project. It is used to review the owner's code and other projects. Cost and privacy are explicitly **not** concerns for v1. The code must be **production quality**: typed, tested, CI'd, publishable.

The core idea: catch problems at three moments, without disturbing the coding experience.

| Tool | When it runs | Depth | Where results appear |
|---|---|---|---|
| CLI (npm) | on file save (watch), on demand, or before commit | **quick**: bugs + security only | terminal, quiet |
| VS Code extension | after each commit | **normal**: bugs, security, code quality | squiggly underlines + Problems panel + quick-fix |
| GitHub App | PR opened / updated | **full**: all of the above + PR summary + risk level | PR summary comment + inline review comments |

All three share **one review engine** (`packages/core`) with the same rules and prompts. Only the trigger, the default depth, and the output surface differ. Depth can be overridden in `.revio.json`.

## 2. Goals, non-goals, anti-goals

**Goals**
- One shared engine; three thin front-ends.
- CLI published to npm, extension to the VS Code Marketplace, GitHub App installable on any repo.
- Web app at `revio.charanteja.site`: landing page, GitHub login, repos + settings, review history.

**Non-goals (v1)**: charts/trends, teams, billing, email notifications, self-hosted LLMs, languages beyond what Gemini handles from raw diffs.

**Anti-goals** (failure even if it "works")
- The CLI or extension interrupts coding: popups, blocking the editor, noisy style nags in quick mode, reviewing on every keystroke.
- Revio crashes or posts garbage when the AI returns malformed output.
- Re-reviewing the same commit twice or spamming a PR with duplicate comments.
- Storing users' source code or diffs in the database.

## 3. Constraints and decisions (made by the owner)

- Build order: **Phase 0 core → Phase 1 CLI → Phase 2 VS Code → Phase 3 GitHub App + backend + frontend → Phase 4 deployment.** Deployment is last.
- AI: **Google Gemini** via API key.
- Frontend: **Next.js** (App Router).
- Backend: **NestJS**.
- Database: **Supabase** (Postgres), accessed via **TypeORM**.
- Domain: **revio.charanteja.site** (subdomain of the owner's `charanteja.site`).
- Deployment target: **Cloudflare**, decided in Phase 4.
- Save small review records for history; never save code.
- The GitHub App is **public**: anyone can install it, and all PR reviews run on the **owner's Gemini key**. The owner pays. No subscriptions or billing in v1; paid plans may come later, so keep per-installation usage countable (the `reviews` table already allows that).
- *My call:* an env-configurable safety cap on reviews per installation per day (default 50). Reviews over the cap are skipped and the PR gets a short "daily limit reached" comment. This protects the owner's key from runaway or abusive usage.

## 4. Architecture

```
revio/  (pnpm workspaces + Turborepo)
├── packages/
│   ├── core/      review engine: diff parsing, prompts, Gemini call, zod validation
│   ├── types/     shared types (Issue, Review, Depth, RevioConfig)
│   ├── cli/       npm package
│   └── vscode/    VS Code extension
└── apps/
    ├── api/       NestJS: GitHub webhooks, job queue, REST API for web
    └── web/       Next.js: landing, dashboard
```

**Repos (owner's):** `github.com/Teja3376/revio-backend` holds the monorepo above minus `apps/web` (core, types, cli, vscode, api). `github.com/Teja3376/revio-frontend` holds the Next.js app; it consumes shared types from the published `types` package. *(My call on the split.)*

CLI and extension call Gemini **directly** with the user's key; they never need the backend.

### 4.1 Core engine (`packages/core`)

Public API (shape, builder may refine names):

```ts
review(input: { diff: string; depth: 'quick' | 'normal' | 'full'; config?: RevioConfig }): Promise<ReviewResult>

type Issue = {
  file: string; line: number; endLine?: number;
  severity: 'error' | 'warning' | 'info';
  category: 'bug' | 'security' | 'performance' | 'quality' | 'style';
  message: string; suggestion?: string;   // suggestion = replacement code
}
type ReviewResult = { issues: Issue[]; summary?: string; risk?: 'low' | 'medium' | 'high' }  // summary/risk only for full
```

- Parse unified diffs; review only **added/changed lines**; drop issues pointing at lines not in the diff.
- Depth controls categories: quick = bug, security · normal = + performance, quality · full = + style, summary, risk.
- Models: Flash for quick/normal, Pro for full. *Exact model IDs verified at build time.* Model configurable.
- Gemini structured output (JSON schema) → validated with **zod**. Invalid output: one retry, then return an empty result plus a warning. Never throw raw model errors to the user.
- Large diffs: split per file; skip files matching ignore globs (lockfiles, `dist/`, generated, binary by default); cap total size (*my call: ~2,000 changed lines per request; beyond that, review per-file batches*).
- Config file `.revio.json` (zod-validated): `depth` per tool, `ignore` globs, `model` override, `rules` (free-text extra instructions appended to the prompt).

### 4.2 Phase 1: CLI (`packages/cli`)

Stack: commander, chokidar, git via `child_process` (no git library), picocolors. Key from `GEMINI_API_KEY`.

- `revio review [--staged | --base <ref>] [--depth]`: reviews the working tree diff vs HEAD by default.
- `revio watch`: on save, debounce ~2s, diff the saved file vs HEAD, review at quick depth, print only issues. *My call:* skip if the file's diff hash is unchanged since the last review; print nothing when there are no issues.
- `revio hook install|uninstall`: writes a git pre-commit hook running `revio review --staged`. *My call:* non-blocking by default (prints issues, commit proceeds); `--block-on error` makes it exit non-zero.
- Exit codes: 0 ok, 1 issues at or above the block level, 2 usage/config/API error.
- Package name: `@revio/cli` if the scope is free, otherwise a fallback (e.g. `revio-cli`). *Check availability first.* Binary name `revio`.

### 4.3 Phase 2: VS Code extension (`packages/vscode`)

Stack: VS Code API, built-in `vscode.git` extension API, esbuild, vsce.

- Detect new commits: watch `repository.state` for HEAD changes; review `HEAD~1..HEAD` (handle the first commit and merge commits: *my call: for merges, diff against the first parent*).
- Runs in the background with a status bar spinner; no modal popups.
- Issues → a `DiagnosticCollection` (squiggles + Problems panel). `suggestion` → a Code Action "Apply Revio fix".
- *My call:* when the user edits a file, clear that file's Revio diagnostics (line numbers would be stale).
- Key in `SecretStorage`; command "Revio: Set Gemini API Key". Commands: "Revio: Review Last Commit", "Revio: Clear Issues". Settings: depth, enabled.
- Reads the same `.revio.json` from the workspace root.

### 4.4 Phase 3: GitHub App + backend + frontend

**Backend `apps/api`**: NestJS, TypeORM, Supabase Postgres, pg-boss (job queue in the same Postgres; no Redis), Octokit (`@octokit/app`), Swagger.

Flow:
1. `POST /webhooks/github`: verify `X-Hub-Signature-256` with the webhook secret (reject otherwise). Handle `pull_request` (opened, synchronize, reopened, ready_for_review) and `installation` / `installation_repositories` events. Respond 200 immediately; enqueue a job.
2. Worker: skip drafts and disabled repos. Dedupe on `(repo_id, pr_number, head_sha)`. Fetch the diff: on first review use the PR diff; on later pushes use the compare `last_reviewed_sha...head_sha` (fall back to the full PR diff if a force-push makes the compare fail).
3. `core.review(depth: full)` → post a GitHub review with inline comments on changed lines plus a summary comment (summary, risk, issue counts). Update one summary comment per PR rather than adding new ones.
4. Save a review record + issues. Status: queued → running → completed | failed (with error message). pg-boss retries transient failures (*my call: 3 attempts, exponential backoff*).

REST API for web (auth: Supabase JWT verified by a NestJS guard):
- `GET /repos`, `PATCH /repos/:id` (enabled, depth, ignore globs)
- `GET /reviews?repo=&page=`, `GET /reviews/:id` (with issues)
- `GET /me`

User ↔ installation linking: Supabase Auth's GitHub provider is configured with the **GitHub App's own client ID/secret** (not a separate OAuth app), because "list my installations" only accepts GitHub App user tokens. At sign-in the web app sends the GitHub provider token to the API once; the API lists the user's installations, stores the links in `user_installations`, and does not keep the token. Installation webhooks keep the links fresh afterwards. *(My call.)*

Config precedence for PR reviews *(my call)*: dashboard settings (enabled, depth, ignore globs) are the source of truth. `.revio.json` is read from the PR's **base** branch (never the head, so a PR author can't change the rules for their own review), and its `ignore` and `rules` are merged in. Where both set the same field, the dashboard wins.

**Data model (TypeORM entities)**
- `users`: id (Supabase auth id), github_id, github_login, avatar_url, created_at
- `installations`: id, github_installation_id, account_login, account_type, created_at
- `user_installations`: user_id, installation_id
- `repos`: id, installation_id, github_repo_id, full_name, enabled (default true), depth (default full), ignore_globs (text[]), last_reviewed_sha per PR lives on reviews
- `reviews`: id, repo_id, pr_number, pr_title, head_sha, base_sha, status, summary, risk, issue_count, error, started_at, finished_at · unique(repo_id, pr_number, head_sha)
- `review_issues`: id, review_id, file, line, end_line, severity, category, message, suggestion

No code or diffs are stored. Schema changes go through TypeORM migrations (no `synchronize` in production).

**Frontend `apps/web`**: Next.js App Router, TypeScript, Tailwind + shadcn/ui, TanStack Query, Supabase Auth (GitHub provider).
- `/`: landing page: what Revio is, the three tools, install links, "Sign in with GitHub"
- `/repos`: installed repos, enable switch, depth and ignore settings, "Install GitHub App" link
- `/reviews`: list (repo, PR, status, issue count, time) · `/reviews/[id]`: issues grouped by file, link to the PR
- `/settings`: account, sign out
- **Fonts (owner's choice, only these two):** Poppins for UI/body text, Edu NSW ACT Cursive (`wght 400..700`) for display accents, both from Google Fonts via `next/font/google`.
- **UI built with the Hallmark skill** (owner's choice).
- **Landing hero (owner's choice):** the Osmo GSAP + ScrollTrigger + Lenis parallax component, placed at `components/ui/parallax-scrolling.tsx` (shadcn layout). *Builder notes:* `@studio-freight/lenis` is deprecated, so use its successor package `lenis`; replace the 21st.dev placeholder layers with Revio's own imagery and title; respect `prefers-reduced-motion` (no scrub or smooth scroll); include the component's CSS (`.parallax__*` classes), which the snippet omits.

### 4.5 Phase 4: Deployment

- Web (Next.js) → Cloudflare at `revio.charanteja.site` (via OpenNext or Cloudflare's current Next.js support).
- API (NestJS, long-running) → Cloudflare Containers **or** Railway/Fly.io: decided in this phase. Proposed subdomain `api.revio.charanteja.site` (*my call*).
- Hosted Supabase project; migrations run in CI before deploy.
- GitHub Actions: CI on every push; release workflows for npm (changesets) and the VS Code Marketplace.
- DNS for `charanteja.site` must be on Cloudflare (move it if it isn't).

## 5. Quality bar (all phases)

- TypeScript strict; Biome lint/format; vitest unit tests for core (diff parsing, depth filtering, zod validation, malformed AI output), CLI commands, webhook signature verification, and the review worker (Gemini and GitHub mocked).
- No real API calls in tests. One optional manual smoke script per phase hitting real Gemini.
- Secrets only via env / SecretStorage, never committed. `.env.example` per app.
- CI must pass lint, typecheck, and tests before merge.

## 6. Accounts and secrets needed

| Phase | Needed |
|---|---|
| 0–1 | Gemini API key (AI Studio), npm account |
| 2 | VS Code Marketplace publisher + Azure DevOps PAT |
| 3 | GitHub App (App ID, private key, webhook secret, client id/secret), Supabase project (URL, anon key, service role key, DB URL), Supabase GitHub provider using the App's client id/secret, Gemini API key for the server |
| 4 | Cloudflare account, domain DNS on Cloudflare, API host account if not Cloudflare |

## 7. Left to the builder

Exact prompt wording, file and module layout inside each package, UI visual design, logging library, exact Gemini model IDs (verified at build time), and the Phase 4 API host choice (made with the owner then).
