import { afterAll } from "bun:test";
import { pool } from "@yapper/db";

// Automated tests boot a single in-process server, so they run without Redis fanout. Cross-instance
// fanout (goal state 4) is validated manually with two instances sharing one Redis — see
// implementation.md. Dropping any dev `REDIS_URL` keeps tests off external Redis and deterministic.
delete process.env.REDIS_URL;

/**
 * Preloaded by `bunfig.toml`. `@yapper/db`'s connection pool is a module singleton shared across
 * every test file in the run, so it must be drained exactly once — after all files finish — not in
 * each file's `afterAll` (which would close it out from under the files that run later).
 */
afterAll(async () => {
  await pool.end();
});
