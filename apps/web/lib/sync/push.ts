import { type PushResponse, pushResponseSchema } from "@yapper/schemas";
import { apiFetch } from "../http";
import { db, getClientGroupID, rebuild } from "./db";

/**
 * The pusher (spec 19, ADR-0007): drains the pending `db.mutations` queue to `POST /api/sync/push`.
 * **Single in-flight** — a nudge during a push coalesces into one follow-up run (backoff/retry is
 * spec 21). On a settled response it drops each **rejected** seq and re-`rebuild()`s (rolling that
 * optimistic effect back); **applied** seqs stay queued and are dropped later by the pull loop when
 * `lastMutationID` advances (spec 16) — which is also what makes a lost-200 retry a safe no-op.
 * Transient failures (offline / 5xx / non-200) keep the queue intact and simply return.
 */

let inFlight = false;
let pendingNudge = false;

/** Outcome-handler seam: spec 21 plugs its classifier / toast copy in here. */
type OutcomeHandler = (outcome: PushResponse) => void;
let outcomeHandler: OutcomeHandler | null = null;
export function setPushOutcomeHandler(handler: OutcomeHandler | null): void {
  outcomeHandler = handler;
}

/** Fire-and-forget nudge (used by `enqueue` and the poke/pull loop). Swallows push rejections. */
export function schedulePush(): void {
  void push();
}

export async function push(): Promise<void> {
  if (inFlight) {
    pendingNudge = true;
    return;
  }
  inFlight = true;
  try {
    do {
      pendingNudge = false;
      await pushOnce();
    } while (pendingNudge);
  } finally {
    inFlight = false;
  }
}

async function pushOnce(): Promise<void> {
  const pending = await db.mutations.orderBy("seq").toArray();
  if (pending.length === 0) return;
  const clientGroupID = await getClientGroupID();
  const body = {
    clientGroupID,
    mutations: pending.map(({ seq, name, args }) => ({ seq, name, args })),
  };

  let outcome: PushResponse;
  try {
    outcome = pushResponseSchema.parse(
      await apiFetch("/api/sync/push", { method: "POST", body: JSON.stringify(body) }),
    );
  } catch {
    // Transient (offline / 5xx / non-200): keep everything queued; spec 21 owns backoff + retry.
    return;
  }

  const rejected = outcome.verdicts.filter((v) => v.status === "rejected").map((v) => v.seq);
  if (rejected.length > 0) {
    await db.mutations.bulkDelete(rejected);
    await rebuild();
  }
  outcomeHandler?.(outcome);
}
