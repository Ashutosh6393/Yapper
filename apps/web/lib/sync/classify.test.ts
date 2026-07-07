import type { PushResponse } from "@yapper/schemas";
import { describe, expect, it } from "vitest";
import { classifyPushOutcome, PushTransportError } from "./classify";

describe("classifyPushOutcome", () => {
  it("classifies a thrown PushTransportError (offline / timeout / 5xx / non-2xx) as transient", () => {
    expect(classifyPushOutcome(new PushTransportError("offline")).kind).toBe("transient");
    expect(classifyPushOutcome(new PushTransportError("503", 503)).kind).toBe("transient");
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
