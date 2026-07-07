/**
 * The CVR puller SEAM (ADR-0004). Fetches the metadata delta from `/api/sync/pull`, upserts it into
 * `db.base` / `db.labels`, and advances the cookie / `lastMutationID`. Spec 15 imports and triggers it
 * from the `SyncEngineProvider` bootstrap (and owns the trigger + ordering); **spec 16 implements the
 * CVR body.**
 *
 * Until spec 16 lands this is a benign no-op: `db.base` stays empty, so the flag-on read path renders
 * an empty/skeleton state — expected for the staged build, and why the flag stays off in prod.
 */
export async function pull(): Promise<void> {
  // no-op stub — CVR delta pull implemented in spec 16
}
