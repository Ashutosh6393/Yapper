import type { Mutation, MutationName } from "@yapper/schemas";
import { mutationNameSchema } from "@yapper/schemas";
import { type ClientMutator, type LocalLabel, registerClientMutator, type WorkingSet } from "./db";

/**
 * The **client**-mutator registry (spec 19, ADR-0007): one pure function per canonical mutation name,
 * folded by `rebuild()` over the working set (`db.base` notes + `db.labels`). Deliberately **asymmetric**
 * from the server mutators — a client mutator is a best-effort local preview: it mutates the draft and
 * does **no** I/O, **no** authorization, and **no** side effects. Because they are pure and keyed by
 * name, dropping a rejected mutation and re-`rebuild()`ing reverts its effect (the rollback primitive
 * spec 21 relies on). `makePrivate` here only sets `access = "private"` locally — the token/collaborator/
 * Redis effects are the server's alone.
 */

type ArgsOf<K extends MutationName> = Extract<Mutation, { name: K }>["args"];
type ClientMutatorFor<K extends MutationName> = (draft: WorkingSet, args: ArgsOf<K>) => void;

export const clientMutators: { [K in MutationName]: ClientMutatorFor<K> } = {
  createNote: (draft, { id, title }) => {
    draft.notes.set(id, {
      id,
      title: title ?? "Untitled",
      preview: "",
      access: "private",
      lifecycle: "active",
      labelIds: [],
      updatedAt: new Date().toISOString(),
      metaVersion: 0,
    });
  },
  renameNote: (draft, { id, title }) => {
    const note = draft.notes.get(id);
    if (note) note.title = title;
  },
  archiveNote: (draft, { id }) => {
    const note = draft.notes.get(id);
    if (note) note.lifecycle = "archived";
  },
  unarchiveNote: (draft, { id }) => {
    const note = draft.notes.get(id);
    if (note) note.lifecycle = "active";
  },
  trashNote: (draft, { id }) => {
    const note = draft.notes.get(id);
    if (note) note.lifecycle = "trashed";
  },
  restoreNote: (draft, { id }) => {
    const note = draft.notes.get(id);
    if (note) note.lifecycle = "active";
  },
  permanentDeleteNote: (draft, { id }) => {
    draft.notes.delete(id);
  },
  setShareLevel: (draft, { id, level }) => {
    const note = draft.notes.get(id);
    if (note) note.access = level;
  },
  // Local preview only: a collaborator loses the note via the CVR dels (goal #11), never via this.
  makePrivate: (draft, { id }) => {
    const note = draft.notes.get(id);
    if (note) note.access = "private";
  },
  createLabel: (draft, { id, name, color }) => {
    const label: LocalLabel = { id, name, color, noteCount: 0 };
    draft.labels.set(id, label);
  },
  renameLabel: (draft, { id, name }) => {
    const label = draft.labels.get(id);
    if (label) label.name = name;
  },
  deleteLabel: (draft, { id }) => {
    draft.labels.delete(id);
    for (const note of draft.notes.values()) {
      if (note.labelIds.includes(id)) note.labelIds = note.labelIds.filter((l) => l !== id);
    }
  },
  applyLabel: (draft, { noteId, labelId }) => {
    const note = draft.notes.get(noteId);
    if (note && !note.labelIds.includes(labelId)) note.labelIds = [...note.labelIds, labelId];
  },
  removeLabel: (draft, { noteId, labelId }) => {
    const note = draft.notes.get(noteId);
    if (note) note.labelIds = note.labelIds.filter((l) => l !== labelId);
  },
};

// Register the 14 bodies into the fold `rebuild()` runs (spec 15's dispatch seam). Importing this
// module wires them; `mutate.ts` / the engine bootstrap import it before any queued replay.
for (const name of mutationNameSchema.options) {
  registerClientMutator(name, clientMutators[name] as ClientMutator);
}
