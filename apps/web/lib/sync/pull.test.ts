// fake-indexeddb gives jsdom a real IndexedDB for Dexie. Test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import type { NoteMeta } from "@yapper/schemas";
import { afterEach, expect, it, vi } from "vitest";

// Mock the HTTP layer so the puller hits no network; we drive the server response per test.
vi.mock("../http", () => ({ apiFetch: vi.fn() }));
// Spec 26d: a wire field the client's schema doesn't know is *silently stripped* by Zod — the funnel is
// where that stops being silent.
vi.mock("../report-error", () => ({ reportError: vi.fn() }));

import { apiFetch } from "../http";
import { reportError } from "../report-error";
import { db } from "./db";
// Register the client-mutator bodies so rebuild() folds any queued mutations.
import "./mutators";
import { pull } from "./pull";

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

function mockPull(res: {
  puts?: NoteMeta[];
  dels?: string[];
  lastMutationID?: number;
  cookie?: string;
  reset?: boolean;
}) {
  vi.mocked(apiFetch).mockResolvedValue({
    puts: res.puts ?? [],
    dels: res.dels ?? [],
    lastMutationID: res.lastMutationID ?? 0,
    cookie: res.cookie ?? "1",
    ...(res.reset !== undefined ? { reset: res.reset } : {}),
  });
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

it("applies puts to db.base and, after rebuild, the note is in db.notes (TDD #9)", async () => {
  const id = crypto.randomUUID();
  mockPull({ puts: [meta(id, { title: "Hello" })], cookie: "1", reset: true });

  await pull();

  expect((await db.base.get(id))?.title).toBe("Hello");
  expect((await db.notes.get(id))?.title).toBe("Hello");
});

it("a dels entry (make-private) removes the note from db.base and db.notes (goal #14, TDD #10)", async () => {
  const id = crypto.randomUUID();
  // Seed the note as already present locally.
  mockPull({ puts: [meta(id)], cookie: "1", reset: true });
  await pull();
  expect(await db.notes.get(id)).toBeDefined();

  // Next pull removes it via dels.
  mockPull({ puts: [], dels: [id], cookie: "2" });
  await pull();

  expect(await db.base.get(id)).toBeUndefined();
  expect(await db.notes.get(id)).toBeUndefined();
});

it("stores cookie + lastMutationID and drops confirmed mutations, keeping higher-seq ones (TDD #11)", async () => {
  const id = crypto.randomUUID();
  const seq1 = await db.mutations.add({ name: "createNote", args: { id } });
  const seq2 = await db.mutations.add({ name: "renameNote", args: { id, title: "Later" } });

  mockPull({ puts: [meta(id)], cookie: "42", lastMutationID: seq1, reset: true });
  await pull();

  expect((await db.sync.get("cookie"))?.value).toBe("42");
  expect((await db.sync.get("lastMutationID"))?.value).toBe(String(seq1));
  expect(await db.mutations.get(seq1)).toBeUndefined(); // confirmed → dropped
  expect(await db.mutations.get(seq2)).toBeDefined(); // higher seq → still queued
});

it("reset: true deletes local db.base rows absent from puts (missing-as-delete) (TDD #12)", async () => {
  const kept = crypto.randomUUID();
  const orphan = crypto.randomUUID();
  await db.base.bulkPut([meta(kept), meta(orphan)]);

  mockPull({ puts: [meta(kept)], cookie: "1", reset: true });
  await pull();

  expect(await db.base.get(kept)).toBeDefined();
  expect(await db.base.get(orphan)).toBeUndefined(); // swept as missing-as-delete
});

it("without reset, unrelated local base rows are left untouched (delta pull)", async () => {
  const existing = crypto.randomUUID();
  await db.base.bulkPut([meta(existing)]);

  const fresh = crypto.randomUUID();
  mockPull({ puts: [meta(fresh)], cookie: "2" }); // no reset flag
  await pull();

  expect(await db.base.get(existing)).toBeDefined(); // not swept
  expect(await db.base.get(fresh)).toBeDefined();
});

it("sends the stored cookie on the next pull and is a no-op-safe on a transient failure", async () => {
  const id = crypto.randomUUID();
  mockPull({ puts: [meta(id)], cookie: "7", reset: true });
  await pull();

  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));
  await pull(); // must not throw, must not wipe local state

  expect(await db.base.get(id)).toBeDefined();
  expect((await db.sync.get("cookie"))?.value).toBe("7"); // unchanged

  // The most recent successful pull sent the persisted cookie.
  mockPull({ puts: [], cookie: "8" });
  await pull();
  const body = JSON.parse(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.body as string);
  expect(body.cookie).toBe("7");
});

// Spec 26d / ADR-006 — the client was stripping `shareToken` out of every pull response: the server sent
// it, Zod discarded it, and the Copy-link button just quietly stopped existing. No throw, no warning, no
// failing test. The fix is not strict schemas (that turns a silent-drop bug into a hard outage when the
// server adds a field first) — it is simply not being silent.
it("reports wire fields the schema discarded (dev only)", async () => {
  // `shareToken` is a field this client *does* know (spec 16 added it as optional) — the ones a client
  // behind the server doesn't, like these, are the ones that vanish without a sound.
  vi.mocked(apiFetch).mockResolvedValue({
    puts: [{ ...meta("n1"), shareToken: "tok_123", pinnedAt: "2026-07-14T00:00:00.000Z" }],
    dels: [],
    lastMutationID: 0,
    cookie: "1",
    somethingNew: true,
  });

  await pull();

  expect(reportError).toHaveBeenCalledTimes(1);
  const [err] = vi.mocked(reportError).mock.calls[0] ?? [];
  expect(String(err)).toContain("somethingNew");
  expect(String(err)).toContain("puts[0].pinnedAt");
});

it("stays quiet when the payload carries nothing the schema doesn't know", async () => {
  mockPull({ puts: [meta("n1")] });

  await pull();

  expect(reportError).not.toHaveBeenCalled();
});
