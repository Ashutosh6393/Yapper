"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useSession } from "../../../lib/auth-client";
import { useTrashNote } from "../../../lib/queries/notes";
import { useNoteDetail } from "../../../lib/sync/reads";
import { Editor } from "./Editor";
import { ShareDialog } from "./ShareDialog";

const SHELL = "mx-auto max-w-3xl px-6 py-12";

export default function NotePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const noteDetail = useNoteDetail(id);
  const trashNote = useTrashNote();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending) return <main className={`${SHELL} text-muted-foreground`}>Loading…</main>;
  if (!session) return null;

  async function handleTrash() {
    try {
      await trashNote.mutateAsync(id);
      router.push("/dashboard");
    } catch {
      // mutation state re-enables the button; nothing else to surface here
    }
  }

  function handleMadePrivate() {
    router.push("/dashboard");
  }

  if (noteDetail.loading) {
    return <main className={`${SHELL} text-muted-foreground`}>Loading note…</main>;
  }
  const note = noteDetail.note;
  if (!note) {
    return (
      <main className={SHELL}>
        <p className="mb-4">Note not found.</p>
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard")}>
          Back to dashboard
        </Button>
      </main>
    );
  }

  return (
    <main className={SHELL}>
      <header className="mb-6 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          ← My Notes
        </Button>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {note.isOwner ? (
            <>
              <ShareDialog noteId={id} initialAccess={note.access} />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleTrash}
                disabled={trashNote.isPending}
              >
                {trashNote.isPending ? "Moving…" : "Move to Trash"}
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <h1 className="mb-4 text-3xl font-semibold tracking-tight">{note.title}</h1>
      <Editor noteId={id} onMadePrivate={note.isOwner ? undefined : handleMadePrivate} />
    </main>
  );
}
