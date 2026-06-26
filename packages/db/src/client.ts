import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env and configure it.");
}

/** Shared connection pool. Call `pool.end()` to drain it in scripts/tests. */
export const pool = new Pool({ connectionString });

/** Typed Drizzle client. `db.query.<table>` and the query builder are schema-aware. */
export const db = drizzle(pool, { schema });

export type Database = typeof db;
