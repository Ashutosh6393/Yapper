// fake-indexeddb gives jsdom a real IndexedDB for Dexie. Test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";

// Mock the HTTP layer so the pusher hits no network; we drive the server response per test.
vi.mock("../http", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "../http";
import { db, rebuild } from "./db";
// Register the client-mutator bodies so rebuild() folds the queued createNote.
import "./mutators";
import { push, setPushOutcomeHandler } from "./push";

afterEach(async () => {
  vi.clearAllMocks();
  setPushOutcomeHandler(null);
  await Promise.all([
    db.base.clear(),
    db.mutations.clear(),
    db.labels.clear(),
    db.notes.clear(),
    db.sync.clear(),
  ]);
});

it("drops a rejected seq and re-rebuilds (rollback), and hands the outcome to the seam", async () => {
  const id = crypto.randomUUID();
  const seq = await db.mutations.add({ name: "createNote", args: { id } });
  await rebuild();
  expect(await db.notes.get(id)).toBeDefined(); // optimistic note present

  vi.mocked(apiFetch).mockResolvedValue({
    lastMutationID: seq,
    verdicts: [{ seq, status: "rejected", reason: "forbidden" }],
  });
  const seen = vi.fn();
  setPushOutcomeHandler(seen);

  await push();

  expect(await db.mutations.get(seq)).toBeUndefined(); // poison mutation dropped
  expect(await db.notes.get(id)).toBeUndefined(); // rollback via rebuild
  expect(seen).toHaveBeenCalledTimes(1);
});

it("keeps the whole queue on a transient failure (apiFetch throws)", async () => {
  const id = crypto.randomUUID();
  const seq = await db.mutations.add({ name: "createNote", args: { id } });
  vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));

  await push();

  expect(await db.mutations.get(seq)).toBeDefined(); // still queued for retry (spec 21)
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
