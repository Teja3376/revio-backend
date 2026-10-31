// Minimal stand-ins for the parts of the vscode API the pure modules use.
export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}
export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(sl: number, sc: number, el: number, ec: number) {
    this.start = new Position(sl, sc);
    this.end = new Position(el, ec);
  }
}
export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}
export class Diagnostic {
  source?: string;
  code?: string;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: DiagnosticSeverity,
  ) {}
}
export const CodeActionKind = { QuickFix: "quickfix" };
export class WorkspaceEdit {
  readonly edits: { uri: unknown; range: Range; text: string }[] = [];
  replace(uri: unknown, range: Range, text: string) {
    this.edits.push({ uri, range, text });
  }
}
export class CodeAction {
  edit?: WorkspaceEdit;
  isPreferred?: boolean;
  diagnostics?: Diagnostic[];
  constructor(
    readonly title: string,
    readonly kind: string,
  ) {}
}
