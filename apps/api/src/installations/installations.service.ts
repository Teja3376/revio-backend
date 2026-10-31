import { Inject, Injectable } from "@nestjs/common";
import { DB, type Db } from "../database/db";
import type { InstallationEvent, InstallationRepositoriesEvent } from "../github/payloads";
import type { InstallationEvents } from "../github/tokens";

/** GitHub calls made with the signed-in user's own token. */
export interface GithubUserApi {
  getUser(token: string): Promise<{ id: number; login: string; avatar_url: string | null }>;
  listInstallations(
    token: string,
  ): Promise<{ id: number; account: { login: string; type: string } }[]>;
  /** The repos in an installation that this user can see. */
  listInstallationRepos(
    token: string,
    installationId: number,
  ): Promise<{ id: number; full_name: string }[]>;
}
export const GITHUB_USER_API = Symbol("GITHUB_USER_API");

export type Me = { id: string; githubLogin: string; avatarUrl: string | null };

@Injectable()
export class InstallationsService implements InstallationEvents {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(GITHUB_USER_API) private readonly github: GithubUserApi,
  ) {}

  async onInstallation(e: InstallationEvent): Promise<void> {
    if (e.action === "deleted") {
      // cascades to repos, reviews, issues and user links
      await this.db.query("delete from installations where github_installation_id = $1", [
        e.installation.id,
      ]);
      return;
    }
    if (e.action === "suspend") return;
    const id = await this.upsertInstallation(e.installation.id, e.installation.account);
    const repoIds = [];
    for (const repo of e.repositories ?? []) repoIds.push(await this.upsertRepo(id, repo));
    await this.linkSender(e.sender?.id, id, repoIds);
  }

  async onRepositories(e: InstallationRepositoriesEvent): Promise<void> {
    const id = await this.upsertInstallation(e.installation.id, e.installation.account);
    const repoIds = [];
    for (const repo of e.repositories_added) repoIds.push(await this.upsertRepo(id, repo));
    await this.linkSender(e.sender?.id, id, repoIds);
    const removed = e.repositories_removed.map((r) => r.id);
    if (removed.length)
      await this.db.query("delete from repos where github_repo_id = any($1)", [removed]);
  }

  /**
   * Called once after sign-in with the user's GitHub token, which is used here and not kept by the API.
   * Links the user to each installation and to only the repos GitHub lets them see in it.
   * shortcut: not in one transaction; a failure midway leaves the user unlinked until the next sign-in.
   */
  async linkUser(userId: string, githubToken: string): Promise<Me> {
    const [user, installs] = await Promise.all([
      this.github.getUser(githubToken),
      this.github.listInstallations(githubToken),
    ]);
    await this.db.query(
      `insert into users (id, github_id, github_login, avatar_url) values ($1, $2, $3, $4)
       on conflict (id) do update set github_id = excluded.github_id,
         github_login = excluded.github_login, avatar_url = excluded.avatar_url`,
      [userId, user.id, user.login, user.avatar_url],
    );
    const installationIds: string[] = [];
    const repoIds: string[] = [];
    for (const inst of installs) {
      const id = await this.upsertInstallation(inst.id, inst.account);
      installationIds.push(id);
      for (const repo of await this.github.listInstallationRepos(githubToken, inst.id)) {
        repoIds.push(await this.upsertRepo(id, repo));
      }
    }
    await this.db.query("delete from user_installations where user_id = $1", [userId]);
    await this.db.query("delete from user_repos where user_id = $1", [userId]);
    for (const id of installationIds) {
      await this.db.query(
        "insert into user_installations (user_id, installation_id) values ($1, $2)",
        [userId, id],
      );
    }
    for (const id of repoIds) {
      await this.db.query(
        "insert into user_repos (user_id, repo_id) values ($1, $2) on conflict do nothing",
        [userId, id],
      );
    }
    return { id: userId, githubLogin: user.login, avatarUrl: user.avatar_url };
  }

  async me(userId: string): Promise<Me | undefined> {
    const [row] = await this.db.query<{ github_login: string; avatar_url: string | null }>(
      "select github_login, avatar_url from users where id = $1",
      [userId],
    );
    return row
      ? { id: userId, githubLogin: row.github_login, avatarUrl: row.avatar_url }
      : undefined;
  }

  private async upsertInstallation(
    githubId: number,
    account: { login: string; type: string },
  ): Promise<string> {
    const [row] = await this.db.query<{ id: string }>(
      `insert into installations (github_installation_id, account_login, account_type) values ($1, $2, $3)
       on conflict (github_installation_id) do update set account_login = excluded.account_login,
         account_type = excluded.account_type
       returning id`,
      [githubId, account.login, account.type],
    );
    return row?.id as string;
  }

  private async upsertRepo(
    installationId: string,
    repo: { id: number; full_name: string },
  ): Promise<string> {
    const [row] = await this.db.query<{ id: string }>(
      `insert into repos (installation_id, github_repo_id, full_name) values ($1, $2, $3)
       on conflict (github_repo_id) do update set installation_id = excluded.installation_id,
         full_name = excluded.full_name
       returning id`,
      [installationId, repo.id, repo.full_name],
    );
    return row?.id as string;
  }

  /**
   * Whoever installs the app or adds repos to it can see those repos, so link them right away;
   * the dashboard then shows them without a new sign-in. A sender who hasn't signed in yet links at sign-in.
   */
  private async linkSender(
    githubUserId: number | undefined,
    installationId: string,
    repoIds: string[],
  ) {
    if (!githubUserId) return;
    const [user] = await this.db.query<{ id: string }>(
      "select id from users where github_id = $1",
      [githubUserId],
    );
    if (!user) return;
    await this.db.query(
      "insert into user_installations (user_id, installation_id) values ($1, $2) on conflict do nothing",
      [user.id, installationId],
    );
    for (const repoId of repoIds) {
      await this.db.query(
        "insert into user_repos (user_id, repo_id) values ($1, $2) on conflict do nothing",
        [user.id, repoId],
      );
    }
  }
}
