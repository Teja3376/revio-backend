import { z } from "zod";

const Account = z.object({ login: z.string(), type: z.string() });
const RepoRef = z.object({ id: z.number().int(), full_name: z.string() });
/** The GitHub user who triggered the event. */
const Sender = z.object({ id: z.number().int() }).optional();

export const PullRequestEvent = z.object({
  action: z.string(),
  installation: z.object({ id: z.number().int() }),
  repository: RepoRef,
  pull_request: z.object({
    number: z.number().int(),
    draft: z.boolean().default(false),
    state: z.string(),
    head: z.object({ sha: z.string() }),
  }),
});

export const InstallationEvent = z.object({
  action: z.string(),
  installation: z.object({ id: z.number().int(), account: Account }),
  repositories: z.array(RepoRef).optional(),
  sender: Sender,
});
export type InstallationEvent = z.infer<typeof InstallationEvent>;

export const InstallationRepositoriesEvent = z.object({
  action: z.string(),
  installation: z.object({ id: z.number().int(), account: Account }),
  repositories_added: z.array(RepoRef).default([]),
  repositories_removed: z.array(RepoRef).default([]),
  sender: Sender,
});
export type InstallationRepositoriesEvent = z.infer<typeof InstallationRepositoriesEvent>;
