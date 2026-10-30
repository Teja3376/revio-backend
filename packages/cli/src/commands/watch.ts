import { createHash } from "node:crypto";
import { type Depth, loadConfig, type ModelClient, review } from "@revio/core";
import { watch } from "chokidar";
import { formatIssues, useColor } from "../format";
import { getDiff, repoRoot } from "../git";

export type Watcher = {
  on(ev: "change" | "add", cb: (path: string) => void): unknown;
  close(): Promise<void>;
};

export type WatchOptions = {
  cwd: string;
  debounceMs?: number;
  depth?: Depth;
  client: ModelClient;
  out: (s: string) => void;
  watcher?: Watcher;
};

const IGNORED = /(^|[/\\])(\.git|node_modules|dist|build|\.turbo)([/\\]|$)/;

/** Reviews each saved file at quick depth (by default) after it stops changing for `debounceMs`. */
export async function startWatch(
  opts: WatchOptions,
): Promise<{ root: string; stop(): Promise<void> }> {
  const root = await repoRoot(opts.cwd);
  const config = await loadConfig(root);
  const depth = opts.depth ?? config.depth?.cli ?? "quick";
  const debounceMs = opts.debounceMs ?? 2000;
  const watcher =
    opts.watcher ?? watch(root, { ignored: (p) => IGNORED.test(p), ignoreInitial: true });

  const timers = new Map<string, NodeJS.Timeout>();
  const lastHash = new Map<string, string>();
  let stopped = false;

  async function reviewFile(path: string) {
    try {
      const diff = await getDiff({ cwd: root, file: path });
      if (!diff.trim()) {
        lastHash.delete(path);
        return;
      }
      const hash = createHash("sha256").update(diff).digest("hex");
      if (lastHash.get(path) === hash) return;
      lastHash.set(path, hash);
      const result = await review({ diff, depth, config }, opts.client);
      if (stopped) return;
      for (const w of result.warnings) opts.out(w);
      if (result.issues.length) opts.out(formatIssues(result.issues, { color: useColor() }));
    } catch (e) {
      lastHash.delete(path); // let the next save retry
      opts.out((e as Error).message);
    }
  }

  const onSave = (path: string) => {
    if (stopped) return;
    clearTimeout(timers.get(path));
    timers.set(
      path,
      setTimeout(() => {
        timers.delete(path);
        void reviewFile(path);
      }, debounceMs),
    );
  };
  watcher.on("change", onSave);
  watcher.on("add", onSave);

  return {
    root,
    async stop() {
      stopped = true;
      for (const t of timers.values()) clearTimeout(t);
      await watcher.close();
    },
  };
}
