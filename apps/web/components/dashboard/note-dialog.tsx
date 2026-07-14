"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { ErrorBoundary } from "../../components/error-boundary";
import { isChunkError } from "../../lib/is-chunk-error";
import { useNoteDetail } from "../../lib/sync/reads";
import { useOnline } from "../../lib/use-online";
import { AccessControl } from "./access-control";

/** Lazy-load the editor (TipTap + Yjs + Hocuspocus + y-indexeddb) into its own chunk so the dashboard's
 * first-load JS doesn't ship it — fetched only when a note is actually opened. Kept SSR-able (no
 * `ssr: false`) so the dashboard page still statically prerenders; the split is a client-chunk win. */
const Editor = dynamic(() => import("../../app/notes/[id]/Editor").then((m) => m.Editor), {
  loading: () => (
    <div className="flex min-h-80 items-center justify-center gap-2 rounded-lg border bg-card text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      Loading editor…
    </div>
  ),
});

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
  // Read metadata through the flag-gated adapter: Dexie (instant, carries `isOwner` since spec 16) when
  // the sync engine is on, else TanStack Query. Opening a note no longer costs a `GET /:id` round-trip.
  const { note, status } = useNoteDetail(noteId ?? "");
  const open = creating || noteId !== null;
  const title = note?.title ?? (creating ? "New note" : "Note");

  // Only a *confirmed* absence swaps the editor out (spec 25d). `loading` keeps rendering the editor —
  // Dexie answers in milliseconds and specs 13/16 bought instant open deliberately, so a spinner here
  // would be a flash, and a flash of "gone" for a note that exists is a worse lie than no state at all.
  const missing = noteId !== null && status === "missing";

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b px-6 py-4 pr-14">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {noteId && note?.isOwner ? (
            <AccessControl
              noteId={noteId}
              access={note.access}
              // Only the engine's Dexie row carries the token; the REST fallback shape has no such field
              // (its link comes from the share mutation's response instead).
              shareToken={"shareToken" in note ? note.shareToken : undefined}
            />
          ) : note && !note.isOwner ? (
            <span className="text-sm text-muted-foreground">Shared with you</span>
          ) : (
            <span aria-hidden />
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {missing ? (
            <NoteMissing onClose={onClose} />
          ) : noteId ? (
            // The app's only component-level boundary (spec 25c). TipTap + Yjs + Hocuspocus is the
            // crashiest code we own and it is mounted *inside* the dashboard, so an unguarded throw here
            // is a white screen. Contained, it costs one note: the list, the sync engine and the Query
            // cache all keep running behind the dialog.
            // `key={noteId}` is the reset: React remounts the boundary when the note changes, so a crash
            // on one note doesn't leave a stale fallback on the next.
            <ErrorBoundary
              key={noteId}
              fallback={(err) => <EditorCrashed error={err} onClose={onClose} />}
            >
              <Editor
                noteId={noteId}
                assumeEditable={assumeEditable}
                // Owner-made-private kicks every other editor: close their note immediately and carry the
                // reason out with them — the editor's in-place notice would be unmounted by `onClose`
                // before it could be read, so the message has to outlive the dialog.
                onMadePrivate={
                  note?.isOwner
                    ? undefined
                    : () => {
                        toast.error("Note made private by owner");
                        onClose();
                      }
                }
              />
            </ErrorBoundary>
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

/**
 * A note the client is *sure* it cannot see (spec 25d). Before this, the dialog rendered a blank editor
 * and opened a WebSocket for it — silently wrong, which is worse than a crash you can at least see.
 *
 * Offline, the same absence means something different and the copy must not overclaim: this device simply
 * may not have pulled the note yet. "Gone" and "not synced yet" are different sentences, and we know
 * which is which.
 */
function NoteMissing({ onClose }: { onClose: () => void }) {
  const online = useOnline();

  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border bg-card p-6 text-center">
      <div className="space-y-1.5">
        <p className="font-medium text-sm">
          {online ? "This note isn't available" : "This note isn't on this device yet"}
        </p>
        <p className="max-w-sm text-muted-foreground text-sm">
          {online
            ? "It was deleted, or the owner made it private. Notes shared with you disappear when sharing is turned off."
            : "It hasn't synced here yet. Reconnect and it will appear if you still have access."}
        </p>
      </div>
      <Button size="sm" variant="secondary" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

/**
 * The dialog boundary's fallback. Recovery is **Close** — not retry: the blast radius is one note and the
 * app behind it is fine, so getting the user back to a working dashboard beats re-rendering the thing
 * that just threw.
 *
 * A stale chunk is the exception (ADR-007). It means a deploy landed under a long-lived tab and this
 * tab's Editor chunk no longer exists on the server. Closing wouldn't help — the next note would fail
 * identically — and neither would a retry, which re-requests the same dead URL. Only fresh HTML carries
 * the new chunk URLs, so the button reloads.
 */
function EditorCrashed({ error, onClose }: { error: unknown; onClose: () => void }) {
  const stale = isChunkError(error);

  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border bg-card p-6 text-center">
      <div className="space-y-1.5">
        <p className="font-medium text-sm">
          {stale ? "Yapper was updated" : "This note couldn't be opened"}
        </p>
        <p className="max-w-sm text-muted-foreground text-sm">
          {stale
            ? "A new version is available. Reload to pick it up — nothing was lost."
            : "The editor hit an unexpected error. Your other notes are unaffected, and this note's content is safe on this device."}
        </p>
      </div>
      {stale ? (
        <Button size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      )}
    </div>
  );
}
