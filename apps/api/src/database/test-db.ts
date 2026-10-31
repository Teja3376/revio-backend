import { PGlite } from "@electric-sql/pglite";
import type { QueryRunner } from "typeorm";
import type { Db } from "./db";
import { Init1761900000000 } from "./migrations/1761900000000-init";

/** A fresh in-process Postgres with the real migrations applied. Tests only. */
export async function testDb(): Promise<Db & { close(): Promise<void> }> {
  const pg = new PGlite();
  await new Init1761900000000().up({
    query: (sql: string) => pg.exec(sql),
  } as unknown as QueryRunner);
  return {
    query: async <T>(sql: string, params?: unknown[]) => (await pg.query<T>(sql, params)).rows,
    close: () => pg.close(),
  };
}
