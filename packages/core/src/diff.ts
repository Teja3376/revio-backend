export type FileDiff = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  binary: boolean;
  /** New-file line numbers of `+` lines. */
  addedLines: number[];
  /** This file's raw section of the diff. */
  patch: string;
};

const unquote = (p: string) => (p.startsWith('"') && p.endsWith('"') ? p.slice(1, -1) : p);

// shortcut: header fallback assumes " b/" splits the paths; only matters for binary/rename-only entries with odd names.
function pathFromHeader(line: string): string {
  const rest = line.slice("diff --git ".length);
  const i = rest.lastIndexOf(" b/");
  return unquote(i >= 0 ? rest.slice(i + 3) : rest);
}

/** Parses a unified git diff into per-file changes. */
export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  let file: FileDiff | undefined;
  let lines: string[] = [];
  let newLine = 0;

  const flush = () => {
    if (file) files.push({ ...file, patch: lines.join("\n") });
  };

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      file = {
        path: pathFromHeader(line),
        status: "modified",
        binary: false,
        addedLines: [],
        patch: "",
      };
      lines = [line];
      newLine = 0;
      continue;
    }
    if (!file) continue;
    lines.push(line);

    if (line.startsWith("@@")) {
      newLine = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
    } else if (newLine > 0) {
      if (line.startsWith("+")) file.addedLines.push(newLine++);
      else if (line.startsWith(" ")) newLine++;
      // "-" lines and "\ No newline" markers don't advance the new-file counter
    } else if (line.startsWith("new file mode")) file.status = "added";
    else if (line.startsWith("deleted file mode")) file.status = "deleted";
    else if (line.startsWith("rename to ")) {
      file.status = "renamed";
      file.path = unquote(line.slice("rename to ".length));
    } else if (line.startsWith("Binary files ") || line === "GIT binary patch") file.binary = true;
    else if (line.startsWith("+++ ") && line !== "+++ /dev/null") {
      file.path = unquote(line.slice(4).replace(/\t$/, "")).replace(/^b\//, ""); // git appends \t to paths with spaces
    }
  }
  flush();
  return files;
}
