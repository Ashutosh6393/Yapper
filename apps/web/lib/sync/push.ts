import { type PushResponse, pushResponseSchema } from "@yapper/schemas";
import { toast } from "@/components/ui/sonner";
import { apiFetch } from "../http";
import { resetBackoff, scheduleRetry } from "./backoff";
import { classifyPushOutcome, PushTransportError } from "./classify";
import { db, getClientGroupID, rebuild } from "./db";
import { rejectToastCopy } from "./reject-copy";

/**
 * The pusher (spec 19, ADR-0007) with rollback UX (spec 21, ADR-0009): drains the pending
 * `db.mutations` queue to `POST /api/sync/push` and reacts to the outcome. **Single in-flight** — a nudge
 * during a push coalesces into one follow-up run.
 *
 * - **Transient** (offline / timeout / non-2xx incl. 401/429/5xx / malformed body): keep the whole queue,
 *   schedule a backoff retry, and stay **silent** — never advance `lastMutationID`, never toast.
 * - **Settled**: reset backoff, then for each **permanently-rejected** mutation drop its `seq`,
 *   `rebuild()` to revert the optimistic effect (the UI reverts via `useLiveQuery`), and
 *   `toast.error(rejectToastCopy(name, reason))`. **Applied** seqs stay queued and are dropped later by
 *   the pull loop when `lastMutationID` advances (spec 16) — which also makes a lost-200 retry a no-op.
 */

let inFlight = false;
let pendingNudge = false;

/** Outcome-handler seam (spec 19): fires the parsed response after settled processing (used by tests). */
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

  let result: PushResponse | PushTransportError;
  try {
    result = pushResponseSchema.parse(
      await apiFetch("/api/sync/push", { method: "POST", body: JSON.stringify(body) }),
    );
  } catch (err) {
    // Non-2xx / offline / timeout / malformed 200 body — all transient (a retry is idempotent, Goal 5).
    result = err instanceof PushTransportError ? err : new PushTransportError(String(err));
  }

  const outcome = classifyPushOutcome(result);
  if (outcome.kind === "transient") {
    // Keep the whole queue; re-push the batch with backoff. Silence — no toast (ADR-0009).
    scheduleRetry(() => {
      void push();
    });
    return;
  }

  // Settled: the network is healthy → reset the backoff counter.
  resetBackoff();
  if (outcome.rejected.length > 0) {
    const nameBySeq = new Map(pending.map((m) => [m.seq, m.name]));
    await db.mutations.bulkDelete(outcome.rejected.map((r) => r.seq));
    await rebuild(); // revert the dropped optimistic effects
    for (const { seq, reason } of outcome.rejected) {
      const name = nameBySeq.get(seq);
      if (name) toast.error(rejectToastCopy(name, reason));
    }
  }
  // `result` is a PushResponse on the settled branch; narrow for the typed seam without an assertion.
  if (!(result instanceof PushTransportError)) outcomeHandler?.(result);
}
