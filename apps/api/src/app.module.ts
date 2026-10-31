import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { createGeminiClient } from "@revio/core";
import { createRemoteJWKSet } from "jose";
import { PgBoss } from "pg-boss";
import type { DataSource } from "typeorm";
import { JWT_VERIFIER, jwtVerifier, SupabaseJwtGuard } from "./auth/jwt.guard";
import { ENV, type Env, loadEnv } from "./config/env";
import { createDataSource } from "./database/data-source";
import { DB, typeormDb } from "./database/db";
import { githubUserApi } from "./github/github-user-api";
import { INSTALLATION_EVENTS, REVIEW_QUEUE } from "./github/tokens";
import { WebhooksController } from "./github/webhooks.controller";
import { HealthController } from "./health.controller";
import { GITHUB_USER_API, InstallationsService } from "./installations/installations.service";
import { MeController } from "./me/me.controller";
import { ReposController } from "./repos/repos.controller";
import { ReposService } from "./repos/repos.service";
import { githubAppFactory } from "./reviews/octokit-pr-github";
import { PR_GITHUB } from "./reviews/pr-github";
import { PG_BOSS, PgBossReviewQueue } from "./reviews/queue";
import { MODEL_CLIENT, ReviewWorker, WORKER_OPTIONS } from "./reviews/review-worker";
import { ReviewsController } from "./reviews/reviews.controller";
import { ReviewsService } from "./reviews/reviews.service";

export const DATA_SOURCE = Symbol("DATA_SOURCE");

@Module({
  controllers: [
    HealthController,
    WebhooksController,
    MeController,
    ReposController,
    ReviewsController,
  ],
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: DATA_SOURCE,
      inject: [ENV],
      // queries go through the transaction pooler
      useFactory: (env: Env) => createDataSource(env.DATABASE_URL).initialize(),
    },
    { provide: DB, inject: [DATA_SOURCE], useFactory: typeormDb },
    {
      provide: JWT_VERIFIER,
      inject: [ENV],
      useFactory: (env: Env) => jwtVerifier(createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL))),
    },
    SupabaseJwtGuard,
    { provide: GITHUB_USER_API, useFactory: () => githubUserApi() },
    InstallationsService,
    { provide: INSTALLATION_EVENTS, useExisting: InstallationsService },
    {
      provide: PR_GITHUB,
      inject: [ENV],
      useFactory: (env: Env) =>
        githubAppFactory(
          new App({
            appId: env.GITHUB_APP_ID,
            privateKey: env.GITHUB_PRIVATE_KEY,
            Octokit: Octokit.plugin(paginateRest),
          }),
        ),
    },
    {
      provide: MODEL_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => createGeminiClient(env.GEMINI_API_KEY),
    },
    {
      provide: WORKER_OPTIONS,
      inject: [ENV],
      useFactory: (env: Env) => ({ dailyCap: env.REVIO_DAILY_REVIEW_CAP }),
    },
    ReviewWorker,
    // pg-boss needs session features, so it uses the session pooler
    { provide: PG_BOSS, inject: [ENV], useFactory: (env: Env) => new PgBoss(env.DIRECT_URL) },
    PgBossReviewQueue,
    { provide: REVIEW_QUEUE, useExisting: PgBossReviewQueue },
    ReposService,
    ReviewsService,
  ],
  exports: [ENV],
})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(DATA_SOURCE) private readonly dataSource: Pick<DataSource, "destroy">) {}

  async onApplicationShutdown() {
    await this.dataSource.destroy();
  }
}
