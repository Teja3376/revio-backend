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
    for (const repo of e.repositories ?? []) await this.upsertRepo(id, repo);
  }

  async onRepositories(e: InstallationRepositoriesEvent): Promise<void> {
    const id = await this.upsertInstallation(e.installation.id, e.installation.account);
    for (const repo of e.repositories_added) await this.upsertRepo(id, repo);
    const removed = e.repositories_removed.map((r) => r.id);
    if (removed.length)
      await this.db.query("delete from repos where github_repo_id = any($1)", [removed]);
  }

  /**
   * Called once after sign-in with the user's GitHub token, which is used here and not stored.
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
    const ids = [];
    for (const inst of installs) ids.push(await this.upsertInstallation(inst.id, inst.account));
    await this.db.query("delete from user_installations where user_id = $1", [userId]);
    for (const id of ids) {
      await this.db.query(
        "insert into user_installations (user_id, installation_id) values ($1, $2)",
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

  private async upsertRepo(installationId: string, repo: { id: number; full_name: string }) {
    await this.db.query(
      `insert into repos (installation_id, github_repo_id, full_name) values ($1, $2, $3)
       on conflict (github_repo_id) do update set installation_id = excluded.installation_id,
         full_name = excluded.full_name`,
      [installationId, repo.id, repo.full_name],
    );
  }
}
