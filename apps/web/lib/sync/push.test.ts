// fake-indexeddb gives jsdom a real IndexedDB for Dexie. Test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";

// Mock the HTTP layer so the pusher hits no network; we drive the server response per test. `ApiError` is
// kept real — the pusher reads its `status` to tell a 401 apart from a network drop (spec 25b).
vi.mock("../http", async (importActual) => ({
  ...(await importActual<typeof import("../http")>()),
  apiFetch: vi.fn(),
}));

import { ApiError, apiFetch } from "../http";
import { useAuthStore } from "../stores/auth";
import { cancelScheduledRetry, resetBackoff } from "./backoff";
import { db, rebuild } from "./db";
// Register the client-mutator bodies so rebuild() folds the queued createNote.
import "./mutators";
import { push } from "./push";

afterEach(async () => {
  vi.clearAllMocks();
  // The pusher schedules a real backoff retry on transient (spec 21) — cancel it so no timer leaks.
  cancelScheduledRetry();
  resetBackoff();
  useAuthStore.getState().clearExpired();
  await Promise.all([
    db.base.clear(),
    db.mutations.clear(),
    db.labels.clear(),
    db.notes.clear(),
    db.sync.clear(),
  ]);
});

it("drops a rejected seq and re-rebuilds (rollback)", async () => {
  const id = crypto.randomUUID();
  const seq = await db.mutations.add({ name: "createNote", args: { id } });
  await rebuild();
  expect(await db.notes.get(id)).toBeDefined(); // optimistic note present

  vi.mocked(apiFetch).mockResolvedValue({
    lastMutationID: seq,
    verdicts: [{ seq, status: "rejected", reason: "forbidden" }],
  });

  await push();

  expect(await db.mutations.get(seq)).toBeUndefined(); // poison mutation dropped
  expect(await db.notes.get(id)).toBeUndefined(); // rollback via rebuild
});

it("keeps the whole queue on a transient failure (apiFetch throws)", async () => {
  const id = crypto.randomUUID();
  const seq = await db.mutations.add({ name: "createNote", args: { id } });
  vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));

  await push();

  expect(await db.mutations.get(seq)).toBeDefined(); // still queued for retry (spec 21)
});

// Spec 25b / ADR-003 — the data-loss goal state. Before this, a 401 was classified transient and the
// pusher retried it forever (no max-attempts, 30s cap) while the user kept typing: nothing ever saved and
// nothing ever said so.
it("on a 401: keeps the queue, flags the session expired, and stops pushing", async () => {
  const id = crypto.randomUUID();
  const seq = await db.mutations.add({ name: "createNote", args: { id } });
  vi.mocked(apiFetch).mockRejectedValue(new ApiError(401));

  await push();

  // The queue is the user's unsaved writing — a 401 must never drop it (and must never signOut(), which
  // would strand it against a user that no longer has a session).
  expect(await db.mutations.get(seq)).toBeDefined();
  expect(useAuthStore.getState().expired).toBe(true);

  // Paused: further nudges are no-ops, so a dead session doesn't 401-storm the API.
  await push();
  expect(apiFetch).toHaveBeenCalledTimes(1);
});

it("leaves applied seqs queued (dropped later by the pull loop)", async () => {
  const id = crypto.randomUUID();
  const seq = await db.mutations.add({ name: "createNote", args: { id } });
  vi.mocked(apiFetch).mockResolvedValue({
    lastMutationID: seq,
    verdicts: [{ seq, status: "applied" }],
  });

  await push();

  expect(await db.mutations.get(seq)).toBeDefined(); // applied but NOT dropped by the pusher
});
