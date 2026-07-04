import { type Database, note } from "@yapper/db";
import { lt, sql } from "drizzle-orm";

/**
 * Permanently delete every note trashed more than 24h ago (cascades to note_doc /
 * note_collaborator / note_label via FKs). Pure and idempotent — safe to run from multiple
 * instances (a double-run just deletes nothing the second time). Returns the number of rows
 * deleted so callers/tests can assert. Notes with `trashed_at IS NULL` are never matched
 * (`NULL < x` is unknown), so active/archived notes are untouched.
 */
export async function purgeTrash(database: Database): Promise<number> {
  const deleted = await database
    .delete(note)
    .where(lt(note.trashedAt, sql`now() - interval '24 hours'`))
    .returning({ id: note.id });
  return deleted.length;
}

/**
 * Start the in-process hourly trash purge. Wired from `index.ts` (not `app.ts`) so tests that
 * mount the app never start a timer. Returns the interval handle for teardown.
 */
export function startTrashPurgeScheduler(
  database: Database,
  intervalMs = 60 * 60 * 1000,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    purgeTrash(database)
      .then((n) => {
        if (n > 0) console.log(`[cron] purged ${n} trashed note(s)`);
      })
      .catch((err) => console.error("[cron] purgeTrash failed", err));
  }, intervalMs);
}
