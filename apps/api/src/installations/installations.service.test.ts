import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../database/db";
import { testDb } from "../database/test-db";
import { InstallationsService } from "./installations.service";

const account = { login: "teja", type: "User" };
const USER = "5f0c1f9e-1d1a-4b0e-9a49-3f1f3b1f6a10";

let db: Db & { close(): Promise<void> };
let github: {
  getUser: (t: string) => Promise<{ id: number; login: string; avatar_url: string | null }>;
  listInstallations: (
    t: string,
  ) => Promise<{ id: number; account: { login: string; type: string } }[]>;
};
let svc: InstallationsService;

beforeEach(async () => {
  db = await testDb();
  github = {
    getUser: async () => ({ id: 99, login: "teja", avatar_url: "https://a/x.png" }),
    listInstallations: async () => [{ id: 7, account }],
  };
  svc = new InstallationsService(db, github);
});
afterEach(() => db.close());

const count = async (table: string) =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table}`))[0]?.n);

describe("InstallationsService", () => {
  it("records a new installation and its repos", async () => {
    await svc.onInstallation({
      action: "created",
      installation: { id: 7, account },
      repositories: [
        { id: 1, full_name: "teja/a" },
        { id: 2, full_name: "teja/b" },
      ],
    });
    expect(await count("installations")).toBe(1);
    expect(await db.query("select full_name from repos order by full_name")).toEqual([
      { full_name: "teja/a" },
      { full_name: "teja/b" },
    ]);
  });

  it("is safe to receive the same installation twice", async () => {
    const e = {
      action: "created",
      installation: { id: 7, account },
      repositories: [{ id: 1, full_name: "teja/a" }],
    };
    await svc.onInstallation(e);
    await svc.onInstallation(e);
    expect(await count("installations")).toBe(1);
    expect(await count("repos")).toBe(1);
  });

  it("adds and removes repos", async () => {
    await svc.onInstallation({
      action: "created",
      installation: { id: 7, account },
      repositories: [{ id: 1, full_name: "teja/a" }],
    });
    await svc.onRepositories({
      action: "added",
      installation: { id: 7, account },
      repositories_added: [{ id: 2, full_name: "teja/b" }],
      repositories_removed: [{ id: 1, full_name: "teja/a" }],
    });
    expect(await db.query("select full_name from repos")).toEqual([{ full_name: "teja/b" }]);
  });

  it("forgets everything about an uninstalled app", async () => {
    await svc.onInstallation({
      action: "created",
      installation: { id: 7, account },
      repositories: [{ id: 1, full_name: "teja/a" }],
    });
    await svc.linkUser(USER, "gh-token");
    await svc.onInstallation({ action: "deleted", installation: { id: 7, account } });
    expect([
      await count("installations"),
      await count("repos"),
      await count("user_installations"),
    ]).toEqual([0, 0, 0]);
  });

  it("links a user to the installations GitHub says they can see, replacing old links", async () => {
    github.listInstallations = async () => [
      { id: 7, account },
      { id: 8, account: { login: "org", type: "Organization" } },
    ];
    await svc.linkUser(USER, "gh-token");
    github.listInstallations = async () => [
      { id: 8, account: { login: "org", type: "Organization" } },
    ];
    await svc.linkUser(USER, "gh-token");

    const linked = await db.query<{ github_installation_id: number }>(
      `select i.github_installation_id::int from user_installations ui
       join installations i on i.id = ui.installation_id where ui.user_id = $1`,
      [USER],
    );
    expect(linked).toEqual([{ github_installation_id: 8 }]);
    expect(await db.query("select github_login, avatar_url from users")).toEqual([
      { github_login: "teja", avatar_url: "https://a/x.png" },
    ]);
  });

  it("returns the signed-in user's profile", async () => {
    await svc.linkUser(USER, "gh-token");
    expect(await svc.me(USER)).toEqual({
      id: USER,
      githubLogin: "teja",
      avatarUrl: "https://a/x.png",
    });
    expect(await svc.me("00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });
});
