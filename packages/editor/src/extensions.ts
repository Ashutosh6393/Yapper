import type { Extensions } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { StarterKit } from "@tiptap/starter-kit";
import type * as Y from "yjs";
import { COLLAB_FIELD } from "./derive";

/**
 * The canonical TipTap extension set, bound to a collaborative Yjs document. `web` calls this with
 * the `HocuspocusProvider`'s `Y.Doc`. StarterKit's built-in history is disabled — `Collaboration`
 * owns undo/redo so it stays consistent across peers.
 *
 * The schema (node/mark set) defined here is the single source the server relies on when it parses
 * the doc to derive title/preview (ADR-001).
 */
export function buildExtensions(doc: Y.Doc): Extensions {
  return [
    StarterKit.configure({ undoRedo: false }),
    // Checkbox lists (todo). Separate from StarterKit; adding them here — the canonical schema —
    // keeps every peer and the server's derivation in agreement (ADR-001).
    TaskList,
    TaskItem.configure({ nested: true }),
    Collaboration.configure({ document: doc, field: COLLAB_FIELD }),
  ];
}
