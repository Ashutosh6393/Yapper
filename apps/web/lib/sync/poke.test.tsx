import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The puller is spec 16; this module only *schedules* it. Mock it so the test asserts scheduling.
vi.mock("./pull", () => ({ pull: vi.fn() }));

import { useSyncPoke } from "./poke";
import { pull } from "./pull";

/** jsdom has no EventSource — a controllable fake that records instances and can emit `poke` frames. */
class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners: Record<string, Set<EventListener>> = {};
  closed = false;
  constructor(
    public url: string,
    public init?: { withCredentials?: boolean },
  ) {
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: EventListener) {
    const set = this.listeners[type] ?? new Set<EventListener>();
    this.listeners[type] = set;
    set.add(cb);
  }
  removeEventListener(type: string, cb: EventListener) {
    this.listeners[type]?.delete(cb);
  }
  close() {
    this.closed = true;
  }
  emit(type: string) {
    for (const cb of this.listeners[type] ?? []) cb(new Event(type));
  }
}

const originalFlag = process.env.NEXT_PUBLIC_SYNC_ENGINE;

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
  else process.env.NEXT_PUBLIC_SYNC_ENGINE = originalFlag;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useSyncPoke", () => {
  it("opens one credentialed EventSource against /api/sync/stream when the flag is on", () => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "1";
    renderHook(() => useSyncPoke());
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toContain("/api/sync/stream");
    expect(MockEventSource.instances[0]?.init?.withCredentials).toBe(true);
  });

  it("coalesces a burst of pokes into exactly one pull, then pulls again after the window", () => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "1";
    vi.useFakeTimers();
    renderHook(() => useSyncPoke());
    const es = MockEventSource.instances[0];
    if (!es) throw new Error("no EventSource opened");

    es.emit("poke");
    es.emit("poke");
    es.emit("poke");
    expect(pull).not.toHaveBeenCalled(); // trailing debounce — nothing yet
    vi.advanceTimersByTime(300);
    expect(pull).toHaveBeenCalledTimes(1); // one pull for the whole burst

    es.emit("poke"); // a fresh burst after the window
    vi.advanceTimersByTime(300);
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("fires a coalesced pull on focus / visibilitychange→visible / online, even with the stream down", () => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "1";
    vi.useFakeTimers();
    renderHook(() => useSyncPoke());
    MockEventSource.instances[0]?.close(); // stream down — backstops must still work independently

    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(300);
    expect(pull).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(300);
    expect(pull).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(300);
    expect(pull).toHaveBeenCalledTimes(3);
  });

  it("is inert when the flag is off — no EventSource, and backstops never pull", () => {
    delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
    vi.useFakeTimers();
    renderHook(() => useSyncPoke());

    expect(MockEventSource.instances).toHaveLength(0);
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(300);
    expect(pull).not.toHaveBeenCalled();
  });
});
