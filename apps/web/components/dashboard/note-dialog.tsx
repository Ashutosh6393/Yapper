"use client";

import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Editor } from "../../app/notes/[id]/Editor";
import { ShareDialog } from "../../app/notes/[id]/ShareDialog";
import { useNote } from "../../lib/queries/notes";

/** Opens a note (new or existing) in a modal: title + owner settings (ShareDialog) + content (Editor).
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

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader className="flex-row items-center justify-between gap-3">
          <DialogTitle>{note?.title ?? (creating ? "New note" : "Note")}</DialogTitle>
          {noteId && note?.isOwner ? (
            <ShareDialog noteId={noteId} initialAccess={note.access} />
          ) : null}
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
