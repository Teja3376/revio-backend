import { describe, expect, it, vi } from "vitest";
import { CommitWatcher } from "./commit-watcher";

// a -> b -> c is one line of history; x is unrelated; b2 is an amend of b (same parent a)
const PARENTS: Record<string, string | undefined> = {
  a: undefined,
  b: "a",
  c: "b",
  x: "q",
  b2: "a",
};

function setup(start: string | undefined) {
  let head = start;
  const onCommit = vi.fn();
  const w = new CommitWatcher({
    getHead: () => head,
    parentOf: async (sha) => PARENTS[sha],
    onCommit,
  });
  return { w, onCommit, move: (sha: string | undefined) => (head = sha) };
}

describe("CommitWatcher", () => {
  it("does not fire on the first check", async () => {
    const { w, onCommit } = setup("b");
    await w.check();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("fires once for a new commit on top", async () => {
    const { w, onCommit, move } = setup("b");
    await w.check();
    move("c");
    await w.check();
    await w.check();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("c");
  });

  it("ignores a checkout to an unrelated commit", async () => {
    const { w, onCommit, move } = setup("b");
    await w.check();
    move("x");
    await w.check();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("fires for an amended commit", async () => {
    const { w, onCommit, move } = setup("b");
    await w.check();
    move("b2");
    await w.check();
    expect(onCommit).toHaveBeenCalledWith("b2");
  });

  it("handles a repo with no commits yet, then its first commit", async () => {
    const { w, onCommit, move } = setup(undefined);
    await w.check();
    move("a");
    await w.check();
    expect(onCommit).toHaveBeenCalledWith("a");
  });

  it("fires once when change events arrive in a burst", async () => {
    const { w, onCommit, move } = setup("b");
    await w.check();
    move("c");
    await Promise.all([w.check(), w.check(), w.check()]);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
