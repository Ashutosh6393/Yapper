import { afterAll } from "bun:test";
import { pool } from "@yapper/db";

/**
 * Preloaded by `bunfig.toml`. `@yapper/db`'s connection pool is a module singleton shared across
 * every test file in the run, so it must be drained exactly once — after all files finish — not in
 * each file's `afterAll` (which would close it out from under the files that run later).
 */
afterAll(async () => {
  await pool.end();
});
