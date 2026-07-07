import type { PushRejectReason, PushResponse } from "@yapper/schemas";

/**
 * Classify a push outcome (spec 21, ADR-0009). Two levels, because permanent rejections ride **inside**
 * a schema-valid `200` body (per-mutation `rejected(reason)` verdicts) while transient failures mean
 * there is no usable body at all. `applied` verdicts are neither — the pull confirms and drops them via
 * `lastMutationID` (spec 16).
 */

/**
 * Thrown by the pusher when the push never produced a usable per-mutation verdict: a rejected `fetch`
 * (offline / DNS / reset), a request timeout (`AbortError`), any non-`2xx` status (incl. `401`/`429`/
 * `5xx` — transient-by-nature: refresh / rate-limit / server error), or a malformed `200` body. Every
 * one of these is transient and must be **retried, not dropped** (a retry is idempotent, Goal 5).
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

export type PushOutcome = { kind: "settled"; rejected: RejectedMutation[] } | { kind: "transient" };

export function classifyPushOutcome(input: PushResponse | PushTransportError): PushOutcome {
  if (input instanceof PushTransportError) return { kind: "transient" };
  const rejected = input.verdicts
    .filter(
      (v): v is { seq: number; status: "rejected"; reason: PushRejectReason } =>
        v.status === "rejected" && v.reason !== undefined,
    )
    .map((v) => ({ seq: v.seq, reason: v.reason }));
  return { kind: "settled", rejected };
}
