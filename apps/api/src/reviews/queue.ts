import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import type { ReviewJob, ReviewQueue } from "../github/tokens";
import { ReviewWorker } from "./review-worker";

export const QUEUE_NAME = "review-pr";
export const PG_BOSS = Symbol("PG_BOSS");

/** Reviews run in the background, retried on failure; the queue lives in the same Postgres. */
@Injectable()
export class PgBossReviewQueue implements ReviewQueue, OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("ReviewQueue");

  constructor(
    @Inject(PG_BOSS) private readonly boss: PgBoss,
    @Inject(ReviewWorker) private readonly worker: Pick<ReviewWorker, "handle">,
  ) {}

  async onModuleInit() {
    this.boss.on("error", (e: unknown) => this.log.error(e));
    await this.boss.start();
    // retryDelay is in seconds and doubles each attempt
    await this.boss.createQueue(QUEUE_NAME, { retryLimit: 3, retryBackoff: true, retryDelay: 30 });
    await this.boss.work<ReviewJob>(QUEUE_NAME, async (jobs) => {
      for (const job of jobs) await this.worker.handle(job.data);
    });
  }

  async onModuleDestroy() {
    await this.boss.stop();
  }

  async enqueue(job: ReviewJob) {
    // GitHub can deliver the same event twice; one job per commit.
    await this.boss.send(QUEUE_NAME, job, {
      singletonKey: `${job.githubRepoId}:${job.prNumber}:${job.headSha}`,
    });
  }
}
