// fake-indexeddb gives jsdom a real IndexedDB for Dexie. Test-scoped only — never in the app bundle.
import "fake-indexeddb/auto";
import type { NoteMeta } from "@yapper/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { applyClientMutation, db, getClientGroupID, rebuild, registerClientMutator } from "./db";

afterEach(async () => {
  await Promise.all([
    db.base.clear(),
    db.mutations.clear(),
    db.labels.clear(),
    db.notes.clear(),
    db.sync.clear(),
  ]);
});

const baseNote = (over: Partial<NoteMeta> = {}): NoteMeta => ({
  id: "n1",
  title: "Title",
  preview: "",
  access: "private",
  lifecycle: "active",
  labelIds: [],
  updatedAt: "2026-07-07T00:00:00.000Z",
  metaVersion: 1,
  ...over,
});

describe("yapper-sync Dexie schema", () => {
  it("is named yapper-sync with the five canonical tables", () => {
    expect(db.name).toBe("yapper-sync");
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(["base", "labels", "mutations", "notes", "sync"]);
  });

  it("keys base/notes/labels by id, sync by key, and auto-increments mutations.seq", () => {
    expect(db.table("base").schema.primKey.keyPath).toBe("id");
    expect(db.table("notes").schema.primKey.keyPath).toBe("id");
    expect(db.table("labels").schema.primKey.keyPath).toBe("id");
    expect(db.table("sync").schema.primKey.keyPath).toBe("key");
    const mutations = db.table("mutations").schema;
    expect(mutations.primKey.keyPath).toBe("seq");
    expect(mutations.primKey.auto).toBe(true);
    expect(mutations.indexes.map((i) => i.keyPath)).toContain("id");
  });

  it("indexes the materialized notes view by lifecycle, updatedAt, and multiEntry labelIds (v2)", () => {
    const byPath = new Map(db.table("notes").schema.indexes.map((i) => [i.keyPath, i]));
    expect(byPath.has("lifecycle")).toBe(true);
    expect(byPath.has("updatedAt")).toBe(true);
    expect(byPath.get("labelIds")?.multi).toBe(true);
  });
});

describe("getClientGroupID", () => {
  it("mints a uuid once and returns the same id on every subsequent call", async () => {
    const first = await getClientGroupID();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const second = await getClientGroupID();
    expect(second).toBe(first);
    expect((await db.sync.get("clientGroupID"))?.value).toBe(first);
  });
});

describe("rebuild — materialize db.notes = replay(mutations) over base", () => {
  it("with an empty queue, materializes a mirror of db.base (chips resolved)", async () => {
    await db.base.put(baseNote());
    await rebuild();
    const row = await db.notes.get("n1");
    expect(row).toEqual({ ...baseNote(), labels: [] });
  });

  it("resolves label chips from db.labels and drops ids with no label row", async () => {
    await db.base.put(baseNote({ labelIds: ["l1", "gone"] }));
    await db.labels.put({ id: "l1", name: "Work", color: "sky", noteCount: 1 });
    await rebuild();
    const row = await db.notes.get("n1");
    expect(row?.labels).toEqual([{ id: "l1", name: "Work", color: "sky" }]);
  });

  it("folds the pending queue in seq order via applyClientMutation", async () => {
    // Spec 15 owns the fold; spec 19 fills the per-name bodies. Register a minimal in-test mutator.
    registerClientMutator("renameNote", (draft, args) => {
      const { id, title } = args as { id: string; title: string };
      const note = draft.notes.get(id);
      if (note) note.title = title;
    });
    await db.base.put(baseNote({ title: "Original" }));
    await db.mutations.add({ name: "renameNote", args: { id: "n1", title: "Renamed" } });
    await rebuild();
    expect((await db.notes.get("n1"))?.title).toBe("Renamed");
  });

  it("is deterministic and idempotent — running twice yields identical rows, no drift", async () => {
    await db.base.put(baseNote({ labelIds: ["l1"] }));
    await db.labels.put({ id: "l1", name: "Work", color: "sky", noteCount: 1 });
    await rebuild();
    const first = await db.notes.toArray();
    await rebuild();
    const second = await db.notes.toArray();
    expect(second).toEqual(first);
    expect(second).toHaveLength(1);
  });
});

describe("applyClientMutation — dispatch seam (bodies land in spec 19)", () => {
  it("throws on a mutation name with no registered mutator", () => {
    expect(() =>
      applyClientMutation(
        { notes: new Map(), labels: new Map() },
        { seq: 1, name: "permanentDeleteNote", args: { id: "x" } },
      ),
    ).toThrow();
  });
});
