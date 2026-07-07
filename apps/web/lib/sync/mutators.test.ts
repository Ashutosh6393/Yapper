import type { NoteMeta } from "@yapper/schemas";
import { mutationNameSchema } from "@yapper/schemas";
import { describe, expect, it } from "vitest";
import type { LocalLabel, WorkingSet } from "./db";
import { clientMutators } from "./mutators";

const note = (over: Partial<NoteMeta> = {}): NoteMeta => ({
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

const label = (over: Partial<LocalLabel> = {}): LocalLabel => ({
  id: "l1",
  name: "Work",
  color: "sky",
  noteCount: 0,
  ...over,
});

const emptyDraft = (): WorkingSet => ({ notes: new Map(), labels: new Map() });

describe("client-mutator registry", () => {
  it("covers exactly the 14 canonical names (goal #1)", () => {
    expect(Object.keys(clientMutators).sort()).toEqual([...mutationNameSchema.options].sort());
  });
});

describe("client mutators are pure local previews (goal #1, #3)", () => {
  it("createNote inserts an Untitled active private note; renameNote overrides the title", () => {
    const draft = emptyDraft();
    clientMutators.createNote(draft, { id: "n1" });
    expect(draft.notes.get("n1")).toMatchObject({
      id: "n1",
      title: "Untitled",
      lifecycle: "active",
      access: "private",
      labelIds: [],
    });
    clientMutators.renameNote(draft, { id: "n1", title: "Hello" });
    expect(draft.notes.get("n1")?.title).toBe("Hello");
  });

  it("archive/unarchive/trash/restore move only lifecycle", () => {
    const draft = emptyDraft();
    draft.notes.set("n1", note());
    clientMutators.archiveNote(draft, { id: "n1" });
    expect(draft.notes.get("n1")?.lifecycle).toBe("archived");
    clientMutators.unarchiveNote(draft, { id: "n1" });
    expect(draft.notes.get("n1")?.lifecycle).toBe("active");
    clientMutators.trashNote(draft, { id: "n1" });
    expect(draft.notes.get("n1")?.lifecycle).toBe("trashed");
    clientMutators.restoreNote(draft, { id: "n1" });
    expect(draft.notes.get("n1")?.lifecycle).toBe("active");
  });

  it("permanentDeleteNote removes the note from the draft", () => {
    const draft = emptyDraft();
    draft.notes.set("n1", note());
    clientMutators.permanentDeleteNote(draft, { id: "n1" });
    expect(draft.notes.has("n1")).toBe(false);
  });

  it("makePrivate sets ONLY access = private (no token/collaborator state — asymmetry)", () => {
    const draft = emptyDraft();
    draft.notes.set("n1", note({ access: "edit" }));
    clientMutators.makePrivate(draft, { id: "n1" });
    // The only change vs the original edit-access note is access → private.
    expect(draft.notes.get("n1")).toEqual(note({ access: "private" }));
  });

  it("setShareLevel sets access to the chosen level", () => {
    const draft = emptyDraft();
    draft.notes.set("n1", note());
    clientMutators.setShareLevel(draft, { id: "n1", level: "edit" });
    expect(draft.notes.get("n1")?.access).toBe("edit");
  });

  it("createLabel/renameLabel maintain the labels map", () => {
    const draft = emptyDraft();
    clientMutators.createLabel(draft, { id: "l1", name: "Work", color: "sky" });
    expect(draft.labels.get("l1")).toEqual(label());
    clientMutators.renameLabel(draft, { id: "l1", name: "Job" });
    expect(draft.labels.get("l1")?.name).toBe("Job");
  });

  it("applyLabel/removeLabel edit a note's labelIds without duplicating", () => {
    const draft = emptyDraft();
    draft.notes.set("n1", note());
    clientMutators.applyLabel(draft, { noteId: "n1", labelId: "l1" });
    clientMutators.applyLabel(draft, { noteId: "n1", labelId: "l1" }); // idempotent — no dup
    expect(draft.notes.get("n1")?.labelIds).toEqual(["l1"]);
    clientMutators.removeLabel(draft, { noteId: "n1", labelId: "l1" });
    expect(draft.notes.get("n1")?.labelIds).toEqual([]);
  });

  it("deleteLabel removes the label row AND strips its id from every note's labelIds", () => {
    const draft = emptyDraft();
    draft.labels.set("l1", label());
    draft.notes.set("n1", note({ labelIds: ["l1", "l2"] }));
    draft.notes.set("n2", note({ id: "n2", labelIds: ["l1"] }));
    clientMutators.deleteLabel(draft, { id: "l1" });
    expect(draft.labels.has("l1")).toBe(false);
    expect(draft.notes.get("n1")?.labelIds).toEqual(["l2"]);
    expect(draft.notes.get("n2")?.labelIds).toEqual([]);
  });
});
