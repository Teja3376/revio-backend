import type { Db } from "../src/database/db";

export const ME = "5f0c1f9e-1d1a-4b0e-9a49-3f1f3b1f6a10";
export const STRANGER = "0b7a3c1e-2f4d-4e6a-8b9c-1d2e3f4a5b6c";

/** Two installations: one linked to ME (repos a/one, a/two), one to STRANGER (z/secret). */
export async function seedDashboard(db: Db) {
  for (const [id, login] of [
    [ME, "me"],
    [STRANGER, "stranger"],
  ]) {
    await db.query("insert into users (id, github_id, github_login) values ($1, $2, $3)", [
      id,
      login === "me" ? 1 : 2,
      login,
    ]);
  }
  const ids: Record<string, string> = {};
  for (const [gid, login, user] of [
    [7, "a", ME],
    [8, "z", STRANGER],
  ] as const) {
    const [inst] = await db.query<{ id: string }>(
      "insert into installations (github_installation_id, account_login, account_type) values ($1, $2, 'User') returning id",
      [gid, login],
    );
    await db.query("insert into user_installations (user_id, installation_id) values ($1, $2)", [
      user,
      inst?.id,
    ]);
    ids[login] = inst?.id as string;
  }
  const repo = async (inst: string, gid: number, name: string) =>
    (
      await db.query<{ id: string }>(
        "insert into repos (installation_id, github_repo_id, full_name) values ($1, $2, $3) returning id",
        [inst, gid, name],
      )
    )[0]?.id as string;
  const out = {
    one: await repo(ids.a as string, 101, "a/one"),
    two: await repo(ids.a as string, 102, "a/two"),
    secret: await repo(ids.z as string, 201, "z/secret"),
    // in ME's installation, but GitHub doesn't let ME see it
    hidden: await repo(ids.a as string, 103, "a/hidden"),
  };
  for (const [user, repoId] of [
    [ME, out.one],
    [ME, out.two],
    [STRANGER, out.secret],
  ]) {
    await db.query("insert into user_repos (user_id, repo_id) values ($1, $2)", [user, repoId]);
  }
  return out;
}
