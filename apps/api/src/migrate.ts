import "reflect-metadata";
import { createDataSource } from "./database/data-source";

// Applies pending migrations through the session pooler (DIRECT_URL). Run before each deploy.
const url = process.env.DIRECT_URL;
if (!url) throw new Error("Set DIRECT_URL to run migrations.");
const ds = await createDataSource(url).initialize();
const applied = await ds.runMigrations({ transaction: "each" });
console.log(
  applied.length ? `Applied: ${applied.map((m) => m.name).join(", ")}` : "Database is up to date.",
);
await ds.destroy();
