// fake-indexeddb gives jsdom a real IndexedDB for Dexie. Test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import type { NoteMeta } from "@yapper/schemas";
import { afterEach, expect, it, vi } from "vitest";

// Mock every side-effecting collaborator so the rollback wiring is exercised in isolation:
// the network (apiFetch), the toast seam, and the backoff scheduler (no real timers here).
vi.mock("../http", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./backoff", () => ({
  scheduleRetry: vi.fn(),
  resetBackoff: vi.fn(),
  cancelScheduledRetry: vi.fn(),
}));

import { toast } from "@/components/ui/sonner";
import { apiFetch } from "../http";
import { scheduleRetry } from "./backoff";
import { db, rebuild } from "./db";
// Register the client-mutator bodies so rebuild() folds the queue.
import "./mutators";
import { push } from "./push";

function meta(id: string, overrides: Partial<NoteMeta> = {}): NoteMeta {
  return {
    id,
    title: "Untitled",
    preview: "",
    access: "private",
    lifecycle: "active",
    labelIds: [],
    updatedAt: "2026-07-07T00:00:00.000Z",
    metaVersion: 1,
    ...overrides,
  };
}

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all([
    db.base.clear(),
    db.mutations.clear(),
    db.labels.clear(),
    db.notes.clear(),
    db.sync.clear(),
  ]);
});

it("permanent reject: drops the mutation, reverts via rebuild, and toasts the reason copy (Goal 2)", async () => {
  const id = crypto.randomUUID();
  await db.base.put(meta(id, { title: "Original" })); // authoritative title
  const seq = await db.mutations.add({ name: "renameNote", args: { id, title: "New" } });
  await rebuild();
  expect((await db.notes.get(id))?.title).toBe("New"); // optimistic rename shown

  vi.mocked(apiFetch).mockResolvedValue({
    lastMutationID: seq,
    verdicts: [{ seq, status: "rejected", reason: "forbidden" }],
  });

  await push();

  expect(await db.mutations.get(seq)).toBeUndefined(); // poison dropped
  expect((await db.notes.get(id))?.title).toBe("Original"); // reverted via rebuild
  expect(toast.error).toHaveBeenCalledWith("You no longer have access to this note.");
  expect(scheduleRetry).not.toHaveBeenCalled(); // settled, not transient
});

it("transient failure: keeps the queue, schedules a retry, and does NOT toast (Goal 1)", async () => {
  const id = crypto.randomUUID();
  const seq = await db.mutations.add({ name: "archiveNote", args: { id } });
  vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));

  await push();

  expect(await db.mutations.get(seq)).toBeDefined(); // still queued for retry
  expect(scheduleRetry).toHaveBeenCalledTimes(1);
  expect(toast.error).not.toHaveBeenCalled(); // silence on transient
});

it("idempotent retry: an already-applied seq settles with no double effect and no toast (Goal 5)", async () => {
  const id = crypto.randomUUID();
  const seq = await db.mutations.add({ name: "createNote", args: { id } });
  vi.mocked(apiFetch).mockResolvedValue({
    lastMutationID: seq,
    verdicts: [{ seq, status: "applied" }],
  });

  await push();

  expect(await db.mutations.get(seq)).toBeDefined(); // applied stays queued (pull drops it, spec 16)
  expect(toast.error).not.toHaveBeenCalled();
});

it("rejected Undo (inverse restoreNote → conflict) reverts + toasts via the same path (Goal 6)", async () => {
  const id = crypto.randomUUID();
  await db.base.put(meta(id, { lifecycle: "trashed" }));
  const seq = await db.mutations.add({ name: "restoreNote", args: { id } });
  await rebuild();
  expect((await db.notes.get(id))?.lifecycle).toBe("active"); // optimistic restore

  vi.mocked(apiFetch).mockResolvedValue({
    lastMutationID: seq,
    verdicts: [{ seq, status: "rejected", reason: "conflict" }],
  });

  await push();

  expect(await db.mutations.get(seq)).toBeUndefined();
  expect((await db.notes.get(id))?.lifecycle).toBe("trashed"); // reverted
  expect(toast.error).toHaveBeenCalledWith("Couldn't restore the note."); // generic action copy
});

it("queue does not wedge: a rejected seq is dropped while a later applied seq survives (Goal 4)", async () => {
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  const seqA = await db.mutations.add({ name: "renameNote", args: { id: idA, title: "A" } });
  const seqB = await db.mutations.add({ name: "createNote", args: { id: idB } });

  vi.mocked(apiFetch).mockResolvedValue({
    lastMutationID: seqB,
    verdicts: [
      { seq: seqA, status: "rejected", reason: "forbidden" },
      { seq: seqB, status: "applied" },
    ],
  });

  await push();

  expect(await db.mutations.get(seqA)).toBeUndefined(); // poison dropped
  expect(await db.mutations.get(seqB)).toBeDefined(); // applied survives (dropped later by pull)
  expect(toast.error).toHaveBeenCalledTimes(1); // exactly one rejection toasted
});
