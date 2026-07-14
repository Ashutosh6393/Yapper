import { pullResponseSchema } from "@yapper/schemas";
import { apiFetch } from "../http";
import { reportError } from "../report-error";
import { currentUserId } from "../session";
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
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Key paths present in the server's payload but absent from the parsed value — what Zod threw away. */
function droppedKeys(raw: unknown, parsed: unknown, path = ""): string[] {
  if (Array.isArray(raw) && Array.isArray(parsed)) {
    return raw.flatMap((item, i) => droppedKeys(item, parsed[i], `${path}[${i}]`));
  }
  if (!isRecord(raw) || !isRecord(parsed)) return [];
  return Object.keys(raw).flatMap((key) => {
    const at = path ? `${path}.${key}` : key;
    return key in parsed ? droppedKeys(raw[key], parsed[key], at) : [at];
  });
}

/**
 * Spec 26d / ADR-006. Zod strips unknown keys silently: a client whose schema is behind the server's does
 * not throw, does not warn and does not fail a test — the field simply ceases to exist, and whatever
 * depended on it quietly stops working. (That is how `shareToken` went missing, and the only reason anyone
 * noticed was a human spotting an absent button.) So report the drop. Deliberately **not** `z.strictObject`
 * — throwing on unknown keys would forbid the server from adding a field before every client updates,
 * trading a silent-drop bug for a hard-outage one.
 *
 * ponytail: dev-only key-diff. Not a schema-drift framework — in production this is dead weight, and the
 * whole point is to catch the drift on the developer's machine.
 */
function reportDroppedKeys(raw: unknown, parsed: unknown): void {
  if (process.env.NODE_ENV === "production") return;
  const dropped = droppedKeys(raw, parsed);
  if (dropped.length > 0) {
    reportError(new Error(`Pull response dropped unknown fields: ${dropped.join(", ")}`));
  }
}

export async function pull(): Promise<void> {
  const clientGroupID = await getClientGroupID(currentUserId());
  const cookie = (await db.sync.get("cookie"))?.value ?? null;

  let outcome: ReturnType<typeof pullResponseSchema.parse>;
  try {
    const raw = await apiFetch("/api/sync/pull", {
      method: "POST",
      body: JSON.stringify({ clientGroupID, cookie }),
    });
    outcome = pullResponseSchema.parse(raw);
    reportDroppedKeys(raw, outcome);
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
