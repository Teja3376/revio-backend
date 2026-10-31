import type { Issue } from "@revio/types";
import * as vscode from "vscode";

const SEVERITY = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
} as const;

/** Full lines line..endLine (Revio is 1-based, VS Code 0-based). VS Code clamps the end column. */
export function toDiagnostic(issue: Issue): vscode.Diagnostic {
  const start = issue.line - 1;
  const end = (issue.endLine ?? issue.line) - 1;
  const d = new vscode.Diagnostic(
    new vscode.Range(start, 0, end, Number.MAX_SAFE_INTEGER),
    issue.message,
    SEVERITY[issue.severity],
  );
  d.source = "Revio";
  d.code = issue.category;
  return d;
}

type Doc = { lineAt(line: number): { range: { end: { character: number } } } };

/** "Apply Revio fix": replaces the issue's full lines with the suggestion. */
export function fixFor(
  issue: Issue,
  doc: Doc,
  uri: vscode.Uri | unknown,
): vscode.CodeAction | undefined {
  if (!issue.suggestion) return undefined;
  const start = issue.line - 1;
  const end = (issue.endLine ?? issue.line) - 1;
  const range = new vscode.Range(start, 0, end, doc.lineAt(end).range.end.character);
  const action = new vscode.CodeAction("Apply Revio fix", vscode.CodeActionKind.QuickFix);
  action.edit = new vscode.WorkspaceEdit();
  action.edit.replace(uri as vscode.Uri, range, issue.suggestion);
  action.isPreferred = true;
  return action;
}

export function groupByFile(issues: Issue[]): Map<string, Issue[]> {
  const byFile = new Map<string, Issue[]>();
  for (const issue of issues) byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue]);
  return byFile;
}
