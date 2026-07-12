"use client";

import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Editor } from "../../app/notes/[id]/Editor";
import { useNote } from "../../lib/queries/notes";
import { AccessControl } from "./access-control";

/** Opens a note (new or existing) in a modal: owner settings + toolbar + content (Editor). The title
 * is the editor's first line, so the header carries the access switch, not a title field; the dialog's
 * accessible name comes from an sr-only DialogTitle.
 * `Editor` owns a Hocuspocus WebSocket — keying the body by noteId recreates/destroys it per note.
 * `creating` opens the modal with a shell *before* a new note's id exists (instant create, goal #5);
 * `assumeEditable` lets a just-created owned note be typable immediately (editable-first). */
export function NoteDialog({
  noteId,
  creating = false,
  assumeEditable = false,
  onClose,
}: {
  noteId: string | null;
  creating?: boolean;
  assumeEditable?: boolean;
  onClose: () => void;
}) {
  const note = useNote(noteId ?? "").data;
  const open = creating || noteId !== null;
  const title = note?.title ?? (creating ? "New note" : "Note");

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b px-6 py-4 pr-14">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {noteId && note?.isOwner ? (
            <AccessControl noteId={noteId} access={note.access} />
          ) : note && !note.isOwner ? (
            <span className="text-sm text-muted-foreground">Shared with you</span>
          ) : (
            <span aria-hidden />
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {noteId ? (
            <Editor
              key={noteId}
              noteId={noteId}
              assumeEditable={assumeEditable}
              onMadePrivate={note?.isOwner ? undefined : onClose}
            />
          ) : (
            <div className="flex min-h-80 items-center justify-center gap-2 rounded-lg border bg-card text-sm text-muted-foreground">
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Creating note…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
