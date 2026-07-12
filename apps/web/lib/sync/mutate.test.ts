// fake-indexeddb gives jsdom a real IndexedDB for Dexie. Test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import type { NoteMeta } from "@yapper/schemas";
import { afterEach, expect, it, vi } from "vitest";

// Mock the pusher so enqueue's nudge is spyable and no network is hit.
vi.mock("./push", () => ({ schedulePush: vi.fn() }));

import { db } from "./db";
import { archiveNote, enqueue } from "./mutate";
import { schedulePush } from "./push";

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all([db.base.clear(), db.mutations.clear(), db.labels.clear(), db.notes.clear()]);
});

const activeNote = (id: string): NoteMeta => ({
  id,
  title: "Title",
  preview: "",
  access: "private",
  lifecycle: "active",
  labelIds: [],
  updatedAt: "2026-07-07T00:00:00.000Z",
  metaVersion: 1,
});

it("archiveNote enqueues a row, rebuild removes it from the active view, and the pusher is nudged (goal #4)", async () => {
  const id = crypto.randomUUID();
  await db.base.put(activeNote(id));

  await archiveNote(id);

  // One queued mutation with a numeric auto-seq.
  const queued = await db.mutations.toArray();
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({ name: "archiveNote", args: { id } });
  expect(typeof queued[0]?.seq).toBe("number");

  // rebuild() folded it: the materialized note is now archived (gone from the active list).
  expect((await db.notes.get(id))?.lifecycle).toBe("archived");

  // The pusher was nudged.
  expect(schedulePush).toHaveBeenCalledTimes(1);
});

it("assigns monotonically increasing seqs across enqueues", async () => {
  const id = crypto.randomUUID();
  await enqueue({ name: "createNote", args: { id } });
  await enqueue({ name: "renameNote", args: { id, title: "X" } });
  const seqs = (await db.mutations.orderBy("seq").toArray()).map((m) => m.seq);
  expect(seqs).toHaveLength(2);
  expect(seqs[1]).toBeGreaterThan(seqs[0] as number);
});
