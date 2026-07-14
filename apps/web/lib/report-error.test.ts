import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./http";
import { reportError } from "./report-error";

/**
 * The filter is the point (spec 25a, ADR-005). Its failure mode is *silence* — a wrong filter reports
 * nothing and never tells you, so nothing else in the codebase would catch a regression here.
 */

let spy: ReturnType<typeof vi.spyOn>;

function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

beforeEach(() => {
  spy = vi.spyOn(console, "error").mockImplementation(() => {});
  setOnline(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportError — stays silent for what isn't a bug", () => {
  it("is silent while offline (an offline-first app throws constantly and none of it is a defect)", () => {
    setOnline(false);
    reportError(new Error("Failed to fetch"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("is silent for an aborted request", () => {
    reportError(new DOMException("aborted", "AbortError"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("is silent for a fetch transport failure (server unreachable is not a code bug)", () => {
    reportError(new TypeError("Failed to fetch"));
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    401, 403, 404,
  ])("is silent for an expected ApiError %i (a handled feature, not a bug)", (status) => {
    reportError(new ApiError(status));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("reportError — reports real defects", () => {
  it("reports a 5xx (the pusher retrying it doesn't mean nothing was wrong)", () => {
    reportError(new ApiError(500));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reports a schema parse failure — the api broke its contract with the client", () => {
    // Duck-typed rather than importing zod: `@yapper/schemas` owns that dependency, and the point is
    // that an *unrecognized* error reports by default. ZodError needs no special case to be caught.
    const zodErr = Object.assign(new Error("invalid_type"), { name: "ZodError" });
    reportError(zodErr);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reports a plain programming error (a TypeError that isn't a fetch failure)", () => {
    reportError(new TypeError("Cannot read properties of undefined (reading 'title')"));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("attaches context that makes the bug reproducible (noteId + connectivity)", () => {
    reportError(new Error("boom"), { noteId: "note-1" });
    const ctx = spy.mock.calls[0]?.at(-1);
    expect(ctx).toMatchObject({ noteId: "note-1", online: true });
  });
});
