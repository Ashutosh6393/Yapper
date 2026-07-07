"use client";

import type { LabelColor, NoteAccess } from "@yapper/schemas";
import { toast } from "@/components/ui/sonner";
import * as engine from "./mutate";

/**
 * Flag-on action helpers: the dashboard/editor call these (instead of the spec-13 TanStack Query
 * mutations) when `NEXT_PUBLIC_SYNC_ENGINE` is on, so every metadata write goes through the engine
 * (`enqueue` → client mutator → `rebuild()` → pusher). Reads already come from Dexie via `useLiveQuery`
 * (spec 15). Undo is a **queued inverse mutation** (goal #15), never a cache re-add. These are plain
 * functions (not hooks) — the optimistic effect is immediate, so the toast fires right after enqueue.
 */

type ShareLevel = Exclude<NoteAccess, "private">;

/** Mint a client id and enqueue the create; the caller opens the editor on the returned id. */
export function createNote(): string {
  const id = crypto.randomUUID();
  void engine.createNote(id);
  return id;
}

export function archiveNote(id: string): void {
  void engine.archiveNote(id);
  toast.success("Note archived", {
    action: { label: "Undo", onClick: () => void engine.unarchiveNote(id) },
  });
}

export function unarchiveNote(id: string): void {
  void engine.unarchiveNote(id);
}

export function trashNote(id: string): void {
  void engine.trashNote(id);
  toast.success("Moved to Trash", {
    action: { label: "Undo", onClick: () => void engine.restoreNote(id) },
  });
}

export function restoreNote(id: string): void {
  void engine.restoreNote(id);
}

export function permanentDeleteNote(id: string): void {
  void engine.permanentDeleteNote(id);
}

export function deleteLabel(id: string): void {
  void engine.deleteLabel(id);
}

/** Mint a client id and enqueue the label create; returns the id so the caller can pre-select it. */
export function createLabel(name: string, color: LabelColor): string {
  const id = crypto.randomUUID();
  void engine.createLabel(id, name, color);
  return id;
}

/** Decompose a "set the note's whole label set" into idempotent per-link apply/remove mutations. */
export function setNoteLabels(noteId: string, current: string[], next: string[]): void {
  const cur = new Set(current);
  const nxt = new Set(next);
  for (const id of nxt) if (!cur.has(id)) void engine.applyLabel(noteId, id);
  for (const id of cur) if (!nxt.has(id)) void engine.removeLabel(noteId, id);
}

export function setShareLevel(id: string, level: ShareLevel): void {
  void engine.setShareLevel(id, level);
}

export function makePrivate(id: string): void {
  void engine.makePrivate(id);
}
