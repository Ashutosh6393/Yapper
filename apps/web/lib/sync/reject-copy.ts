import type { MutationName, PushRejectReason } from "@yapper/schemas";

/**
 * User-facing toast copy for a permanently-rejected mutation (spec 21, ADR-0009). The server returns
 * only a machine reason code — never user prose — so the client owns the copy: a per-mutation action
 * phrase plus a reason override. Best-effort and generic by design.
 */

/** `mutationName → human action phrase` used to compose the generic "Couldn't <action>." message. */
export const ACTION_PHRASE: Record<MutationName, string> = {
  createNote: "create the note",
  renameNote: "rename the note",
  archiveNote: "archive the note",
  unarchiveNote: "unarchive the note",
  trashNote: "move the note to trash",
  restoreNote: "restore the note",
  permanentDeleteNote: "delete the note",
  setShareLevel: "change sharing",
  makePrivate: "make the note private",
  createLabel: "create the label",
  renameLabel: "rename the label",
  deleteLabel: "delete the label",
  applyLabel: "add the label",
  removeLabel: "remove the label",
};

/**
 * Compose the toast message for a rejected mutation. `forbidden` and `not_found` get
 * access/existence-specific copy (clearer than "couldn't rename"); `invalid` and `conflict` fall
 * through to the generic, action-specific `"Couldn't <action>."`.
 */
export function rejectToastCopy(name: MutationName, reason: PushRejectReason): string {
  if (reason === "forbidden") return "You no longer have access to this note.";
  if (reason === "not_found") return "That note no longer exists.";
  return `Couldn't ${ACTION_PHRASE[name]}.`;
}
