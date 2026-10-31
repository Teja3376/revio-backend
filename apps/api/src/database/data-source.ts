import "reflect-metadata";
import { DataSource } from "typeorm";
import { ENTITIES } from "./entities";
import { Init1761900000000 } from "./migrations/1761900000000-init";

/** Never `synchronize`: schema changes go through migrations. */
export function createDataSource(url: string) {
  return new DataSource({
    type: "postgres",
    url,
    entities: ENTITIES,
    migrations: [Init1761900000000],
    synchronize: false,
    ssl: url.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
}
