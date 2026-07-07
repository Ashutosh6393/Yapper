import { pullResponseSchema } from "@yapper/schemas";
import { apiFetch } from "../http";
import { db, getClientGroupID, rebuild } from "./db";

/**
 * The CVR puller (spec 16, ADR-0004): brings the server's authoritative metadata view *down*. Reads the
 * client-group id + last cookie from `db.sync`, POSTs them to `/api/sync/pull`, and applies the returned
 * delta to `db.base` — the **only** table the puller writes (spec 14). In one Dexie transaction it
 * `bulkPut`s `puts`, `bulkDelete`s `dels` (make-private / revoke / hard-delete removals), advances the
 * `cookie` + `lastMutationID` singletons, and drops the client's own mutations the server has now baked
 * into base (`seq <= lastMutationID`); higher-`seq` mutations stay queued to replay over the fresh base.
 * `reset: true` (empty server `prev`) additionally sweeps local base rows absent from `puts`
 * (missing-as-delete) so a stale cookie self-heals to the server's exact view. Finally `rebuild()` (spec
 * 15) re-materializes `db.notes` from the new base + remaining queue. Only ever called from flag-gated
 * engine code (spec 15 bootstrap, spec 17 poke/reconnect); never runs on the flag-off path.
 */
export async function pull(): Promise<void> {
  const clientGroupID = await getClientGroupID();
  const cookie = (await db.sync.get("cookie"))?.value ?? null;

  let outcome: ReturnType<typeof pullResponseSchema.parse>;
  try {
    outcome = pullResponseSchema.parse(
      await apiFetch("/api/sync/pull", {
        method: "POST",
        body: JSON.stringify({ clientGroupID, cookie }),
      }),
    );
  } catch {
    // Transient (offline / 5xx / non-200): leave local state as-is; a later poke/backstop retries.
    return;
  }

  const { puts, dels, lastMutationID, cookie: next, reset } = outcome;

  await db.transaction("rw", db.base, db.sync, db.mutations, async () => {
    await db.base.bulkPut(puts);
    await db.base.bulkDelete(dels);
    if (reset) {
      // Empty server `prev` can't name orphaned local rows in `dels`; reconcile by missing-as-delete.
      const keep = new Set(puts.map((p) => p.id));
      const orphans = (await db.base.toCollection().primaryKeys()).filter((id) => !keep.has(id));
      await db.base.bulkDelete(orphans);
    }
    await db.sync.put({ key: "cookie", value: next });
    await db.sync.put({ key: "lastMutationID", value: String(lastMutationID) });
    // Drop the client's own mutations the server has confirmed (baked into base); keep the rest queued.
    await db.mutations.where("seq").belowOrEqual(lastMutationID).delete();
  });

  await rebuild();
}
