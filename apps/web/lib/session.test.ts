import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePersistedSession } from "./session";

type LiveSession = { data: unknown; isPending: boolean; error: unknown };

let live: LiveSession = { data: null, isPending: false, error: null };

vi.mock("./auth-client", () => ({
  useSession: () => live,
}));

const CACHE_KEY = "yapper.session";
const SESSION = { user: { email: "me@x.co" } };

beforeEach(() => {
  window.localStorage.clear();
  live = { data: null, isPending: false, error: null };
});

describe("usePersistedSession", () => {
  it("mirrors a live session to storage", async () => {
    live = { data: SESSION, isPending: false, error: null };
    const { result } = renderHook(() => usePersistedSession());

    await waitFor(() =>
      expect(window.localStorage.getItem(CACHE_KEY)).toBe(JSON.stringify(SESSION)),
    );
    expect(result.current.data).toEqual(SESSION);
  });

  // The goal state: offline, the session fetch FAILS — `data` is null and `isPending` is false, exactly
  // like a sign-out, but `error` is set. Treating that as a sign-out clears the mirror and the dashboard
  // redirects to /login, i.e. going offline logs the user out.
  it("keeps the persisted session when the session fetch fails (offline)", async () => {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(SESSION));
    live = { data: null, isPending: false, error: { message: "Failed to fetch" } };

    const { result } = renderHook(() => usePersistedSession());

    await waitFor(() => expect(result.current.data).toEqual(SESSION));
    expect(window.localStorage.getItem(CACHE_KEY)).toBe(JSON.stringify(SESSION));
    expect(result.current.isPending).toBe(false);
  });

  it("clears the mirror on a confirmed sign-out (no session, no error)", async () => {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(SESSION));
    live = { data: null, isPending: false, error: null };

    const { result } = renderHook(() => usePersistedSession());

    await waitFor(() => expect(window.localStorage.getItem(CACHE_KEY)).toBeNull());
    expect(result.current.data).toBeNull();
  });
});
