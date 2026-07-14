import { type PushResponse, pushResponseSchema } from "@yapper/schemas";
import { toast } from "@/components/ui/sonner";
import { ApiError, apiFetch } from "../http";
import { reportError } from "../report-error";
import { currentUserId } from "../session";
import { useAuthStore } from "../stores/auth";
import { useSyncStore } from "../stores/sync";
import { resetBackoff, scheduleRetry } from "./backoff";
import { classifyPushOutcome, PushTransportError } from "./classify";
import { db, getClientGroupID, rebuild } from "./db";
import { rejectToastCopy } from "./reject-copy";

/**
 * The pusher (spec 19, ADR-0007) with rollback UX (spec 21, ADR-0009) and session-expiry handling
 * (spec 25b, ADR-003): drains the pending `db.mutations` queue to `POST /api/sync/push` and reacts to the
 * outcome. **Single in-flight** — a nudge during a push coalesces into one follow-up run.
 *
 * - **Transient** (offline / timeout / non-2xx incl. 429/5xx / malformed body): keep the whole queue,
 *   schedule a backoff retry, and stay **silent** — never advance `lastMutationID`, never toast.
 * - **Blocked** (`4xx` other than `401`/`429`, e.g. a `403` on a stale client-group binding): keep the
 *   whole queue, **stop** (no retry — waiting cannot fix a durable server judgement, ADR-005), report,
 *   and surface a banner: the user's changes are not saving and must not look like they are.
 * - **Auth** (`401`): keep the whole queue, **pause** (no retry — waiting cannot mint a new session), and
 *   flag the session expired so the UI can prompt re-auth. Never `signOut()`: the queue is the user's
 *   unsaved writing, keyed to this user.
 * - **Settled**: reset backoff, then for each **permanently-rejected** mutation drop its `seq`,
 *   `rebuild()` to revert the optimistic effect (the UI reverts via `useLiveQuery`), and
 *   `toast.error(rejectToastCopy(name, reason))`. **Applied** seqs stay queued and are dropped later by
 *   the pull loop when `lastMutationID` advances (spec 16) — which also makes a lost-200 retry a no-op.
 */

let inFlight = false;
let pendingNudge = false;

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
  // Paused on an expired session: every push would just 401 again. The queue stays put and drains after
  // re-auth (an OAuth redirect reloads the app → the flag clears → the bootstrap's schedulePush runs).
  if (useAuthStore.getState().expired) return;
  // Same for a blocked push: the server has made a durable judgement, so re-sending is pure noise.
  if (useSyncStore.getState().blocked !== null) return;

  const pending = await db.mutations.orderBy("seq").toArray();
  if (pending.length === 0) return;
  const clientGroupID = await getClientGroupID(currentUserId());
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
    // Offline / timeout / malformed 200 body → transient (a retry is idempotent, Goal 5). A non-2xx
    // arrives as ApiError: carry its **status** across, or a 401 is indistinguishable from a network drop
    // and falls into the infinite transient retry (ADR-003).
    if (err instanceof PushTransportError) result = err;
    else if (err instanceof ApiError) result = new PushTransportError(err.message, err.status);
    else result = new PushTransportError(String(err));
  }

  const outcome = classifyPushOutcome(result);
  if (outcome.kind === "auth") {
    // Session dead, queue alive. Pause — deliberately no scheduleRetry: waiting cannot fix this, and
    // retrying a dead credential just 401-storms the API.
    useAuthStore.getState().markExpired();
    return;
  }
  if (outcome.kind === "blocked") {
    // Queue alive, session alive, server immovable (ADR-005). Deliberately no scheduleRetry — waiting
    // cannot fix a 4xx, and retrying it is what turned this into a silent, permanent jam. A client/server
    // disagreement is always a bug, so it reports; the banner tells the user nothing is saving.
    useSyncStore.getState().markBlocked(outcome.status);
    reportError(new Error(`Push blocked with ${outcome.status}`), {
      pending: pending.length,
      clientGroupID,
    });
    return;
  }
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
}
