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
  | { kind: "auth" };

export function classifyPushOutcome(input: PushResponse | PushTransportError): PushOutcome {
  if (input instanceof PushTransportError) {
    // A 401 is not a network blip. Retrying is what `transient` means, and no amount of waiting mints a
    // new session — so a 401 in the transient bucket becomes an infinite silent retry (backoff.ts has no
    // max-attempts, by design) while the user keeps typing and nothing saves. ADR-003.
    return input.status === 401 ? { kind: "auth" } : { kind: "transient" };
  }
  const rejected = input.verdicts
    .filter(
      (v): v is { seq: number; status: "rejected"; reason: PushRejectReason } =>
        v.status === "rejected" && v.reason !== undefined,
    )
    .map((v) => ({ seq: v.seq, reason: v.reason }));
  return { kind: "settled", rejected };
}
