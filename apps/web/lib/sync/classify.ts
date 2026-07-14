import type { PushRejectReason, PushResponse } from "@yapper/schemas";

/**
 * Classify a push outcome (spec 21, ADR-0009; extended by spec 25b, ADR-003). Three levels, because
 * permanent rejections ride **inside** a schema-valid `200` body (per-mutation `rejected(reason)`
 * verdicts) while transient failures mean there is no usable body at all — and a `401` is neither.
 * `applied` verdicts are none of the three — the pull confirms and drops them via `lastMutationID`
 * (spec 16).
 */

/**
 * Thrown by the pusher when the push never produced a usable per-mutation verdict: a rejected `fetch`
 * (offline / DNS / reset), a request timeout (`AbortError`), any non-`2xx` status (incl. `429`/`5xx` —
 * transient-by-nature: rate-limit / server error), or a malformed `200` body. These are transient and
 * must be **retried, not dropped** (a retry is idempotent, Goal 5).
 *
 * `401` is the exception and carries its `status` for that reason — see {@link classifyPushOutcome}.
 */
export class PushTransportError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PushTransportError";
  }
}

/** A permanently-rejected mutation, keyed by its client `seq` (the name is resolved from the queue). */
export interface RejectedMutation {
  seq: number;
  reason: PushRejectReason;
}

export type PushOutcome =
  | { kind: "settled"; rejected: RejectedMutation[] }
  | { kind: "transient" }
  /** The queue is fine; the *session* is dead. Pause the pusher and re-auth — never drop, never retry. */
  | { kind: "auth" }
  /** The session is fine and the queue is fine; the *server will never accept this push*. Stop. */
  | { kind: "blocked"; status: number };

export function classifyPushOutcome(input: PushResponse | PushTransportError): PushOutcome {
  if (input instanceof PushTransportError) {
    // The rule (spec 26c, ADR-005): **retry only what waiting can fix.** Offline, timeouts, 5xx and 429
    // genuinely heal with time — everything else in the 4xx range is a durable judgement about *this*
    // request, and re-sending the identical bytes yields the identical answer, forever. A 401 keeps its
    // own outcome because the fix is re-auth, not a code change (ADR-003). This is what a 403 needed and
    // did not have: it sat in the transient bucket and retried, silently, until the tab closed.
    const { status } = input;
    if (status === 401) return { kind: "auth" };
    if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
      return { kind: "blocked", status };
    }
    return { kind: "transient" };
  }
  const rejected = input.verdicts
    .filter(
      (v): v is { seq: number; status: "rejected"; reason: PushRejectReason } =>
        v.status === "rejected" && v.reason !== undefined,
    )
    .map((v) => ({ seq: v.seq, reason: v.reason }));
  return { kind: "settled", rejected };
}
