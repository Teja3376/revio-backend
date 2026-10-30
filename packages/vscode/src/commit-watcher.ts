export type CommitWatcherOptions = {
  getHead(): string | undefined;
  parentOf(sha: string): Promise<string | undefined>;
  onCommit(sha: string): void;
};

/**
 * Fires when HEAD moves to a commit made on top of the previous HEAD (or an amend of it).
 * Checkouts, branch switches and pulls that jump elsewhere are ignored.
 */
export class CommitWatcher {
  private head: string | undefined;
  private headParent: string | undefined;
  private started = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly opts: CommitWatcherOptions) {}

  /** Serialized: VS Code fires change events in bursts. */
  check(): Promise<void> {
    this.queue = this.queue.then(() => this.run());
    return this.queue;
  }

  private async run(): Promise<void> {
    const next = this.opts.getHead();
    if (this.started && next === this.head) return;
    const nextParent = next ? await this.opts.parentOf(next) : undefined;
    const isNewCommit = nextParent === this.head || nextParent === this.headParent;
    const wasStarted = this.started;
    this.started = true;
    this.head = next;
    this.headParent = nextParent;
    if (wasStarted && next && isNewCommit) this.opts.onCommit(next);
  }
}
