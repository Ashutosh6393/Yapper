// fake-indexeddb gives jsdom a real IndexedDB for Dexie. Test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import type { NoteMeta } from "@yapper/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";

// The flush goes through the real pusher; only the transport is mocked.
vi.mock("../http", async (importActual) => ({
  ...(await importActual<typeof import("../http")>()),
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../http";
import { cancelScheduledRetry, resetBackoff } from "./backoff";
import { db } from "./db";
import "./mutators";
import { flushPending, resetLocalEngine } from "./reset";

afterEach(async () => {
  vi.clearAllMocks();
  cancelScheduledRetry();
  resetBackoff();
  // resetLocalEngine() deletes (and so closes) the Dexie instance — the app reloads after sign-out; the
  // test process doesn't, so reopen it before the next case.
  if (!db.isOpen()) await db.open();
  await Promise.all([
    db.base.clear(),
    db.mutations.clear(),
    db.labels.clear(),
    db.notes.clear(),
    db.sync.clear(),
  ]);
});

const note = (id: string): NoteMeta => ({
  id,
  title: "Title",
  preview: "",
  access: "private",
  lifecycle: "active",
  labelIds: [],
  updatedAt: "2026-07-07T00:00:00.000Z",
  metaVersion: 1,
});

/** Open a y-indexeddb-shaped doc store for a note so the wipe has something to clear. */
async function seedNoteDoc(noteId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(noteId, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("updates", { autoIncrement: true });
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

const dbNames = async (): Promise<string[]> =>
  (await indexedDB.databases()).flatMap((d) => (d.name ? [d.name] : []));

describe("resetLocalEngine", () => {
  it("leaves nothing of the previous user behind — Dexie and the note docs are gone", async () => {
    await db.base.put(note("n1"));
    await db.notes.put({ ...note("n1"), labels: [] });
    await db.sync.put({ key: "clientGroupID", value: "cg-1" });
    await seedNoteDoc("n1");

    await resetLocalEngine();

    expect(await dbNames()).not.toContain("yapper-sync");
    expect(await dbNames()).not.toContain("n1");
  });
});

describe("flushPending", () => {
  it("reports nothing unsynced once the server confirms the queue", async () => {
    const seq = await db.mutations.add({ name: "createNote", args: { id: "n1" } } as never);
    // push applies; the pull that follows it acknowledges the seq and drops it from the queue.
    vi.mocked(apiFetch).mockImplementation(async (path: string) =>
      path.endsWith("/push")
        ? { verdicts: [{ seq, status: "applied" }] }
        : { puts: [note("n1")], dels: [], lastMutationID: seq, cookie: "c1" },
    );

    expect(await flushPending()).toBe(0);
  });

  it("reports the unsynced count when the queue cannot drain", async () => {
    await db.mutations.add({ name: "createNote", args: { id: "n1" } } as never);
    await db.mutations.add({ name: "createNote", args: { id: "n2" } } as never);
    vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));

    expect(await flushPending()).toBe(2);
  });
});
