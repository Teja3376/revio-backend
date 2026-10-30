# Revio Phase 2: VS Code Extension, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A VS Code extension that reviews each new commit in the background (depth `normal`) and shows issues as diagnostics with an "Apply Revio fix" quick fix.

**Architecture:** `packages/vscode`. VS Code-free logic (commit diffing, commit detection, issue→diagnostic mapping) lives in plain modules that are unit-tested with vitest against a small fake `vscode` module. `extension.ts` only wires the VS Code API. esbuild bundles core + extension into one CJS file.

**Tech Stack:** VS Code API (^1.90), built-in `vscode.git` API, esbuild, @vscode/vsce, vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-revio-design.md` §4.3

## Global Constraints
- Inherits the main plan's constraints (Node ≥22.12, strict TS, no network in tests).
- Default depth `normal`; setting `revio.depth`, `revio.enabled` (default true). `.revio.json` `depth.vscode` overrides the default, and the setting overrides both only when the user set it explicitly.
- Never modal; progress in the status bar only. Errors go to the "Revio" output channel plus a status bar warning.
- Key in SecretStorage under `revio.geminiApiKey`; fall back to the `GEMINI_API_KEY` env var.

## Review Focus
- **First commit in a repo (no parent):** diff against the empty tree; must not throw. → Task 11 test.
- **Merge commit:** diff against the first parent only. → Task 11 test.
- **Checkout / branch switch / pull:** HEAD moves but isn't a new commit on top of the old one, so no review. → Task 12 test.
- **Editing a file with diagnostics:** that file's Revio diagnostics clear on first edit (lines would be stale). → Task 13 test.
- **Issue on the last line / suggestion spanning endLine:** the quick fix replaces exactly `line..endLine` (1-based) in full lines. → Task 13 test.

### Task 11: Commit diff + extension scaffold
**Files:** `packages/vscode/{package.json,tsconfig.json,esbuild.mjs,vitest.config.ts}`, `src/git.ts`, `src/git.test.ts`, `test/vscode-fake.ts`
**Produces:** `commitDiff(root: string, sha: string): Promise<string>` (root commit → `git diff <empty-tree> sha`; otherwise `git diff sha^1 sha`); `parentOf(root, sha): Promise<string | undefined>`.
- [ ] Tests (real temp repos): normal commit diff contains its `+` lines and not earlier ones; root commit works; merge commit diffs against first parent only; `parentOf` of root commit is `undefined`.
- [ ] Run → FAIL; implement; run → PASS; commit `feat(vscode): commit diffs`.

### Task 12: Commit detection
**Files:** `src/commit-watcher.ts`, test
**Produces:** `class CommitWatcher { constructor(opts: { getHead(): string | undefined; parentOf(sha: string): Promise<string | undefined>; onCommit(sha: string): void }); check(): Promise<void> }`. The first `check()` records HEAD without firing. Later checks fire `onCommit(newHead)` only when `parentOf(newHead) === previousHead` (new commit on top) or when the parent equals the previous head's parent (amend).
- [ ] Tests: first check doesn't fire; new commit fires once; same HEAD twice fires once; checkout to an unrelated commit doesn't fire; amend fires; HEAD undefined (empty repo) doesn't throw.
- [ ] Run → FAIL; implement; run → PASS; commit `feat(vscode): detect new commits`.

### Task 13: Diagnostics + quick fix + clear on edit
**Files:** `src/diagnostics.ts`, test; `src/extension.ts`
**Produces:** `toDiagnostic(issue: Issue): vscode.Diagnostic` (range = lines `line-1 .. (endLine ?? line)-1`, full lines; severity error/warning/info → Error/Warning/Information; `source = "Revio"`; `code = category`); `fixFor(issue, uri): vscode.CodeAction | undefined` (only when `suggestion` exists; replaces the full-line range with `suggestion`, preferred, kind QuickFix); `groupByFile(issues): Map<string, Issue[]>`.
- [ ] Tests with the fake `vscode`: mapping of severity, range and code; fix replaces exactly the range; no fix without a suggestion.
- [ ] Implement `extension.ts`: activate on `workspaceContains:.git`; get `vscode.git` exports `getAPI(1)`; for each repository a `CommitWatcher` on `repository.state.onDidChange`; on a commit, run `review()` from core with `commitDiff`, depth from settings/config, the key from SecretStorage/env; set diagnostics per file (paths relative to the repo root resolved to URIs); a CodeActionProvider that returns `fixFor` for Revio diagnostics under the cursor; `onDidChangeTextDocument` clears that file's diagnostics; commands `revio.setApiKey`, `revio.reviewLastCommit`, `revio.clearIssues`; status bar item with `$(sync~spin) Revio` while reviewing, then `$(check) Revio: N issues`, or `$(warning) Revio` on error.
- [ ] `pnpm --filter revio-vscode typecheck` and build pass; commit `feat(vscode): diagnostics, quick fix, commands`.

### Task 14: Package
**Files:** `packages/vscode/README.md`, `packages/vscode/media/icon.png`, `.github/workflows/release-vscode.yml`
- [ ] `pnpm --filter revio-vscode package` → produces `revio-vscode-0.1.0.vsix`; install it with `code --install-extension` into a throwaway `--user-data-dir`/`--extensions-dir` and confirm it is listed.
- [ ] Release workflow publishes on tag `vscode-v*` with `VSCE_PAT`. Commit `chore(vscode): packaging`.
