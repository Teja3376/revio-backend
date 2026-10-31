import type { InstallationEvent, InstallationRepositoriesEvent } from "./payloads";

export type ReviewJob = {
  installationId: number;
  githubRepoId: number;
  prNumber: number;
  headSha: string;
};

export interface ReviewQueue {
  enqueue(job: ReviewJob): Promise<void>;
}
export const REVIEW_QUEUE = Symbol("REVIEW_QUEUE");

export interface InstallationEvents {
  onInstallation(event: InstallationEvent): Promise<void>;
  onRepositories(event: InstallationRepositoriesEvent): Promise<void>;
}
export const INSTALLATION_EVENTS = Symbol("INSTALLATION_EVENTS");
