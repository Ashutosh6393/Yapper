// fake-indexeddb backs Dexie + useLiveQuery here; test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, type LocalNote } from "./db";
import { useLocalLabels, useLocalNote, useLocalNotes, useNoteDetail, useNoteList } from "./reads";

// The flag-off arm of the adapters delegates to the TanStack Query hooks. Stub them so routing is
// observable without a network call — flag-on must ignore these and read Dexie instead.
vi.mock("../queries/notes", () => ({
  useNotes: () => ({ data: [{ id: "from-query" }], isPending: false }),
  useSharedNotes: () => ({ data: [], isPending: false }),
  useNote: () => ({ data: { id: "from-query", isOwner: true }, isPending: false }),
}));

const original = process.env.NEXT_PUBLIC_SYNC_ENGINE;

afterEach(async () => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
  else process.env.NEXT_PUBLIC_SYNC_ENGINE = original;
  await Promise.all([db.notes.clear(), db.labels.clear()]);
});

const localNote = (over: Partial<LocalNote> = {}): LocalNote => ({
  id: "n1",
  title: "Title",
  preview: "",
  access: "private",
  lifecycle: "active",
  labelIds: [],
  updatedAt: "2026-07-07T00:00:00.000Z",
  metaVersion: 1,
  labels: [],
  ...over,
});

describe("useLocalNotes", () => {
  it("returns undefined on the first tick, then reactively reflects db.notes", async () => {
    const { result } = renderHook(() => useLocalNotes("active"));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual([]));
    await db.notes.put(localNote());
    await waitFor(() => expect(result.current?.map((n) => n.id)).toEqual(["n1"]));
  });

  it("returns only the requested lifecycle view", async () => {
    await db.notes.bulkPut([
      localNote({ id: "a", lifecycle: "active" }),
      localNote({ id: "b", lifecycle: "archived" }),
    ]);
    const { result } = renderHook(() => useLocalNotes("archived"));
    await waitFor(() => expect(result.current?.map((n) => n.id)).toEqual(["b"]));
  });

  it("filters to a label by membership (label view implies active lifecycle)", async () => {
    await db.notes.bulkPut([
      localNote({ id: "a", labelIds: ["l1"] }),
      localNote({ id: "b", labelIds: ["l2"] }),
      localNote({ id: "c", labelIds: ["l1"], lifecycle: "archived" }),
    ]);
    const { result } = renderHook(() => useLocalNotes("active", "l1"));
    await waitFor(() => expect(result.current?.map((n) => n.id)).toEqual(["a"]));
  });
});

describe("useLocalNote", () => {
  it("returns undefined then the single materialized row", async () => {
    await db.notes.put(localNote({ id: "n9", title: "Nine" }));
    const { result } = renderHook(() => useLocalNote("n9"));
    await waitFor(() => expect(result.current?.title).toBe("Nine"));
  });
});

describe("useLocalLabels", () => {
  it("returns the label list from db.labels", async () => {
    await db.labels.put({ id: "l1", name: "Work", color: "sky", noteCount: 2 });
    const { result } = renderHook(() => useLocalLabels());
    await waitFor(() => expect(result.current?.map((l) => l.name)).toEqual(["Work"]));
  });
});

describe("useNoteList — flag-gated adapter", () => {
  it("routes to the TanStack Query path when the flag is off", async () => {
    delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
    const { result } = renderHook(() => useNoteList("active", null));
    expect(result.current.notes?.map((n) => n.id)).toEqual(["from-query"]);
    expect(result.current.loading).toBe(false);
  });

  it("routes to db.notes when the flag is on", async () => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "1";
    await db.notes.put(localNote({ id: "from-dexie" }));
    const { result } = renderHook(() => useNoteList("active", null));
    await waitFor(() => expect(result.current.notes?.map((n) => n.id)).toEqual(["from-dexie"]));
  });
});

describe("useNoteDetail — flag-gated adapter", () => {
  it("routes to the Query path when the flag is off", () => {
    delete process.env.NEXT_PUBLIC_SYNC_ENGINE;
    const { result } = renderHook(() => useNoteDetail("n1"));
    expect(result.current.note?.id).toBe("from-query");
  });

  it("routes to db.notes.get when the flag is on", async () => {
    process.env.NEXT_PUBLIC_SYNC_ENGINE = "1";
    await db.notes.put(localNote({ id: "nd", title: "Detail" }));
    const { result } = renderHook(() => useNoteDetail("nd"));
    await waitFor(() => expect(result.current.note?.id).toBe("nd"));
  });
});
