import type { PushResponse } from "@yapper/schemas";
import { describe, expect, it } from "vitest";
import { classifyPushOutcome, PushTransportError } from "./classify";

describe("classifyPushOutcome", () => {
  it("classifies a thrown PushTransportError (offline / timeout / 5xx / non-2xx) as transient", () => {
    expect(classifyPushOutcome(new PushTransportError("offline")).kind).toBe("transient");
    expect(classifyPushOutcome(new PushTransportError("503", 503)).kind).toBe("transient");
  });

  // Spec 25b / ADR-003. A 401 is neither transient nor a permanent per-mutation rejection: the queue is
  // fine, the *session* is dead. Retrying cannot fix it — waiting fixes offline, not an expired token —
  // so it must not fall into the no-max-attempts transient loop that silently stops saving.
  it("classifies a 401 as auth, not transient (an expired session is not a network blip)", () => {
    expect(classifyPushOutcome(new PushTransportError("401", 401)).kind).toBe("auth");
  });

  // Spec 26c / ADR-005 — retry only what waiting can fix. A 403 (a client group bound to another user)
  // was in the transient bucket, so it was retried forever and reported nowhere: the queue jammed and the
  // app went on painting the optimistic replay over the server's real state.
  it("classifies a 403 as blocked — the server will never accept this push", () => {
    expect(classifyPushOutcome(new PushTransportError("403", 403))).toEqual({
      kind: "blocked",
      status: 403,
    });
  });

  it("keeps 429 transient — a rate limit IS fixed by waiting", () => {
    expect(classifyPushOutcome(new PushTransportError("429", 429)).kind).toBe("transient");
  });

  it("splits a settled 200 body into only its rejected verdicts (seq + reason), dropping applied", () => {
    const res: PushResponse = {
      lastMutationID: 3,
      verdicts: [
        { seq: 1, status: "applied" },
        { seq: 2, status: "rejected", reason: "forbidden" },
        { seq: 3, status: "rejected", reason: "conflict" },
      ],
    };
    const outcome = classifyPushOutcome(res);
    expect(outcome.kind).toBe("settled");
    if (outcome.kind !== "settled") throw new Error("expected settled");
    expect(outcome.rejected).toEqual([
      { seq: 2, reason: "forbidden" },
      { seq: 3, reason: "conflict" },
    ]);
  });

  it("returns an empty rejected list when every verdict applied", () => {
    const res: PushResponse = {
      lastMutationID: 1,
      verdicts: [{ seq: 1, status: "applied" }],
    };
    const outcome = classifyPushOutcome(res);
    expect(outcome).toEqual({ kind: "settled", rejected: [] });
  });
});
