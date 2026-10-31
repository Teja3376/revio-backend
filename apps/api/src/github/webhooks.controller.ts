import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { verify } from "@octokit/webhooks-methods";
import type { Request } from "express";
import type { z } from "zod";
import { ENV, type Env } from "../config/env";
import { InstallationEvent, InstallationRepositoriesEvent, PullRequestEvent } from "./payloads";
import {
  INSTALLATION_EVENTS,
  type InstallationEvents,
  REVIEW_QUEUE,
  type ReviewQueue,
} from "./tokens";

const REVIEW_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ message: "Unexpected webhook payload." });
  return result.data;
}

@ApiExcludeController()
@Controller("webhooks/github")
export class WebhooksController {
  constructor(
    @Inject(ENV) private readonly env: Pick<Env, "GITHUB_WEBHOOK_SECRET">,
    @Inject(REVIEW_QUEUE) private readonly queue: ReviewQueue,
    @Inject(INSTALLATION_EVENTS) private readonly installs: InstallationEvents,
  ) {}

  @Post()
  @HttpCode(202)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-github-event") event: string | undefined,
    @Headers("x-hub-signature-256") signature: string | undefined,
  ) {
    const raw = req.rawBody?.toString("utf8") ?? "";
    const valid =
      Boolean(signature) &&
      (await verify(this.env.GITHUB_WEBHOOK_SECRET, raw, signature as string).catch(() => false));
    if (!valid) throw new UnauthorizedException({ message: "Bad signature." });

    const body: unknown = req.body;
    if (event === "pull_request") {
      const e = parse(PullRequestEvent, body);
      const pr = e.pull_request;
      if (REVIEW_ACTIONS.has(e.action) && pr.state === "open" && !pr.draft) {
        await this.queue.enqueue({
          installationId: e.installation.id,
          githubRepoId: e.repository.id,
          prNumber: pr.number,
          headSha: pr.head.sha,
        });
      }
    } else if (event === "installation") {
      await this.installs.onInstallation(parse(InstallationEvent, body));
    } else if (event === "installation_repositories") {
      await this.installs.onRepositories(parse(InstallationRepositoriesEvent, body));
    }
    return { ok: true };
  }
}
