import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelScheduledRetry, nextBackoffDelay, resetBackoff, scheduleRetry } from "./backoff";

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

afterEach(() => {
  cancelScheduledRetry();
  resetBackoff();
  setOnline(true);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("nextBackoffDelay", () => {
  it("grows 1s→2s→4s… and caps at 30s (jitter neutralized)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // factor = 0.8 + 0.5*0.4 = 1.0 → delay === raw
    expect([0, 1, 2, 3, 4, 5, 6].map(nextBackoffDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });

  it("keeps jitter within ±20% of the raw delay", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // factor 0.8 → lower bound
    expect(nextBackoffDelay(0)).toBe(800);
    vi.spyOn(Math, "random").mockReturnValue(0.999); // factor ≈ 1.2 → upper bound
    expect(nextBackoffDelay(0)).toBe(1200);
  });
});

describe("scheduleRetry", () => {
  it("fires the retry after the backoff delay while online", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const run = vi.fn();

    scheduleRetry(run);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("grows the delay across consecutive transient failures, and resetBackoff() returns to base", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const run = vi.fn();

    scheduleRetry(run); // attempt 0 → 1s
    vi.advanceTimersByTime(1000);
    scheduleRetry(run); // attempt 1 → 2s
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1); // 2s not elapsed yet
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);

    resetBackoff();
    scheduleRetry(run); // back to attempt 0 → 1s
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("retries immediately (bypassing the timer) and resets the counter on an online event", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const run = vi.fn();

    scheduleRetry(run); // arms a 1s timer
    window.dispatchEvent(new Event("online"));
    expect(run).toHaveBeenCalledTimes(1); // fired now, not after 1s

    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1); // the original timer was cancelled
  });

  it("does not spin while offline — waits for the online event, then retries", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    setOnline(false);

    scheduleRetry(run);
    vi.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled(); // no timer armed while offline

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
