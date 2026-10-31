import { PGlite } from "@electric-sql/pglite";
import type { QueryRunner } from "typeorm";
import type { Db } from "../../src/database/db";
import { Init1761900000000 } from "../../src/database/migrations/1761900000000-init";
import { PerRepoAccess1761990000000 } from "../../src/database/migrations/1761990000000-per-repo-access";

/** A fresh in-process Postgres with the real migrations applied. Tests only. */
export async function testDb(): Promise<Db & { close(): Promise<void> }> {
  const pg = new PGlite();
  const runner = { query: (sql: string) => pg.exec(sql) } as unknown as QueryRunner;
  for (const m of [new Init1761900000000(), new PerRepoAccess1761990000000()]) await m.up(runner);
  return {
    query: async <T>(sql: string, params?: unknown[]) => (await pg.query<T>(sql, params)).rows,
    close: () => pg.close(),
  };
}
