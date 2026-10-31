import type { Issue } from "@revio/types";
import { describe, expect, it } from "vitest";
import { DiagnosticSeverity, type Range } from "vscode";
import { fixFor, groupByFile, toDiagnostic } from "../src/diagnostics";

const issue = (over: Partial<Issue> = {}): Issue => ({
  file: "src/a.ts",
  line: 3,
  severity: "error",
  category: "security",
  message: "Timing attack",
  ...over,
});

// a 5-line document whose line i has length 10 + i
const doc = { lineAt: (i: number) => ({ range: { end: { line: i, character: 10 + i } } }) };
const uri = { path: "/r/src/a.ts" };

describe("toDiagnostic", () => {
  it("maps severity, message, code and source", () => {
    const d = toDiagnostic(issue());
    expect(d).toMatchObject({
      message: "Timing attack",
      severity: DiagnosticSeverity.Error,
      source: "Revio",
      code: "security",
    });
    expect(toDiagnostic(issue({ severity: "warning" })).severity).toBe(DiagnosticSeverity.Warning);
    expect(toDiagnostic(issue({ severity: "info" })).severity).toBe(DiagnosticSeverity.Information);
  });

  it("covers lines line..endLine (0-based in VS Code)", () => {
    const d = toDiagnostic(issue({ line: 3, endLine: 5 }));
    expect([d.range.start.line, d.range.end.line]).toEqual([2, 4]);
    expect(toDiagnostic(issue()).range.end.line).toBe(2);
  });
});

describe("fixFor", () => {
  it("replaces exactly the full lines of the issue with the suggestion", () => {
    const action = fixFor(issue({ line: 2, endLine: 3, suggestion: "safe();" }), doc, uri);
    expect(action?.isPreferred).toBe(true);
    expect(action?.kind).toBe("quickfix");
    // `edits` exists on the test fake's WorkspaceEdit, not on the real type
    const fake = action?.edit as unknown as { edits: { text: string; range: Range }[] } | undefined;
    const [edit] = fake?.edits ?? [];
    expect(edit?.text).toBe("safe();");
    expect([edit?.range.start.line, edit?.range.start.character]).toEqual([1, 0]);
    expect([edit?.range.end.line, edit?.range.end.character]).toEqual([2, 12]);
  });

  it("returns nothing without a suggestion", () => {
    expect(fixFor(issue(), doc, uri)).toBeUndefined();
  });
});

describe("groupByFile", () => {
  it("groups issues by file", () => {
    const g = groupByFile([issue(), issue({ line: 9 }), issue({ file: "b.ts" })]);
    expect([...g.keys()]).toEqual(["src/a.ts", "b.ts"]);
    expect(g.get("src/a.ts")).toHaveLength(2);
  });
});
