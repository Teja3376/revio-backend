import { createGeminiClient, type Depth, loadConfig, review } from "@revio/core";
import type { Issue } from "@revio/types";
import * as vscode from "vscode";
import { CommitWatcher } from "./commit-watcher";
import { fixFor, groupByFile, toDiagnostic } from "./diagnostics";
import { commitDiff, parentOf } from "./git";

// The parts of the built-in vscode.git API we use (it ships no type package).
type Repository = {
  rootUri: vscode.Uri;
  state: { HEAD?: { commit?: string }; onDidChange: vscode.Event<void> };
};
type GitApi = {
  repositories: Repository[];
  onDidOpenRepository: vscode.Event<Repository>;
};

const KEY_SECRET = "revio.geminiApiKey";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const diagnostics = vscode.languages.createDiagnosticCollection("revio");
  const issuesByUri = new Map<string, Issue[]>();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  status.name = "Revio";
  context.subscriptions.push(diagnostics, status);

  const apiKey = async () =>
    (await context.secrets.get(KEY_SECRET)) ?? process.env.GEMINI_API_KEY ?? undefined;

  function show(root: vscode.Uri, issues: Issue[]) {
    for (const uri of [...issuesByUri.keys()].filter((u) => u.startsWith(root.toString()))) {
      diagnostics.delete(vscode.Uri.parse(uri));
      issuesByUri.delete(uri);
    }
    for (const [file, fileIssues] of groupByFile(issues)) {
      const uri = vscode.Uri.joinPath(root, file);
      issuesByUri.set(uri.toString(), fileIssues);
      diagnostics.set(uri, fileIssues.map(toDiagnostic));
    }
  }

  async function reviewCommit(repo: Repository, sha: string) {
    const settings = vscode.workspace.getConfiguration("revio");
    const key = await apiKey();
    if (!key) {
      status.text = "$(warning) Revio";
      status.tooltip = "Set your Gemini API key: run “Revio: Set Gemini API Key”.";
      status.show();
      return;
    }
    const root = repo.rootUri.fsPath;
    status.text = "$(sync~spin) Revio";
    status.tooltip = "Reviewing the last commit";
    status.show();
    try {
      const config = await loadConfig(root);
      const depth: Depth = config.depth?.vscode ?? settings.get<Depth>("depth", "normal");
      const result = await review(
        { diff: await commitDiff(root, sha), depth, config },
        createGeminiClient(key),
      );
      show(repo.rootUri, result.issues);
      const n = result.issues.length;
      status.text = `$(check) Revio: ${n} ${n === 1 ? "issue" : "issues"}`;
      status.tooltip = result.warnings.join("\n") || "Last commit reviewed";
    } catch (e) {
      status.text = "$(warning) Revio";
      status.tooltip = (e as Error).message;
    }
  }

  const watchers = new Map<string, CommitWatcher>();
  function watch(repo: Repository) {
    const id = repo.rootUri.toString();
    if (watchers.has(id)) return;
    const watcher = new CommitWatcher({
      getHead: () => repo.state.HEAD?.commit,
      parentOf: (sha) => parentOf(repo.rootUri.fsPath, sha),
      onCommit: (sha) => {
        if (vscode.workspace.getConfiguration("revio").get<boolean>("enabled", true)) {
          void reviewCommit(repo, sha);
        }
      },
    });
    watchers.set(id, watcher);
    void watcher.check();
    context.subscriptions.push(repo.state.onDidChange(() => void watcher.check()));
  }

  const gitExtension = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>("vscode.git");
  const git = (
    gitExtension?.isActive ? gitExtension.exports : await gitExtension?.activate()
  )?.getAPI(1);
  if (git) {
    git.repositories.forEach(watch);
    context.subscriptions.push(git.onDidOpenRepository(watch));
  }

  context.subscriptions.push(
    // Editing a file makes its line numbers stale, so its issues go away.
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length === 0) return;
      const uri = e.document.uri.toString();
      if (!issuesByUri.has(uri)) return;
      issuesByUri.delete(uri);
      diagnostics.delete(e.document.uri);
    }),

    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      {
        provideCodeActions(document, _range, ctx) {
          const issues = issuesByUri.get(document.uri.toString()) ?? [];
          return ctx.diagnostics
            .filter((d) => d.source === "Revio")
            .map((d) =>
              issues.find((i) => i.line - 1 === d.range.start.line && i.message === d.message),
            )
            .map((issue) => (issue ? fixFor(issue, document, document.uri) : undefined))
            .filter((a): a is vscode.CodeAction => Boolean(a));
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),

    vscode.commands.registerCommand("revio.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "Gemini API key",
        prompt: "Stored in VS Code's secret storage, never in settings.",
        password: true,
        ignoreFocusOut: true,
      });
      if (key) await context.secrets.store(KEY_SECRET, key.trim());
    }),

    vscode.commands.registerCommand("revio.reviewLastCommit", async () => {
      for (const repo of git?.repositories ?? []) {
        const sha = repo.state.HEAD?.commit;
        if (sha) await reviewCommit(repo, sha);
      }
    }),

    vscode.commands.registerCommand("revio.clearIssues", () => {
      diagnostics.clear();
      issuesByUri.clear();
      status.hide();
    }),
  );
}

export function deactivate(): void {}
