import type { DataSource } from "typeorm";

/** The only database access the services use: parameterized SQL ($1, $2, …). */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
export const DB = Symbol("DB");

/** Production: SQL through TypeORM's connection pool. */
export const typeormDb = (ds: DataSource): Db => ({
  query: (sql, params) => ds.query(sql, params),
});
