"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Editor } from "../../app/notes/[id]/Editor";
import { ShareDialog } from "../../app/notes/[id]/ShareDialog";
import { useNote } from "../../lib/queries/notes";

/** Opens a note (new or existing) in a modal: title + owner settings (ShareDialog) + content (Editor).
 * `Editor` owns a Hocuspocus WebSocket — keying the body by noteId recreates/destroys it per note. */
export function NoteDialog({ noteId, onClose }: { noteId: string | null; onClose: () => void }) {
  const note = useNote(noteId ?? "").data;

  return (
    <Dialog open={noteId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader className="flex-row items-center justify-between gap-3">
          <DialogTitle>{note?.title ?? "Note"}</DialogTitle>
          {noteId && note?.isOwner ? (
            <ShareDialog noteId={noteId} initialAccess={note.access} />
          ) : null}
        </DialogHeader>
        {noteId ? (
          <Editor
            key={noteId}
            noteId={noteId}
            onMadePrivate={note?.isOwner ? undefined : onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
