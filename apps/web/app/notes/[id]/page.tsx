"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "../../../lib/auth-client";
import { useDeleteNote, useNote } from "../../../lib/queries/notes";
import { Editor } from "./Editor";
import { ShareDialog } from "./ShareDialog";

export default function NotePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const noteQuery = useNote(id);
  const deleteNote = useDeleteNote();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending) return <main style={main}>Loading…</main>;
  if (!session) return null;

  async function handleDelete() {
    try {
      await deleteNote.mutateAsync(id);
      router.push("/dashboard");
    } catch {
      // mutation state re-enables the button; nothing else to surface here
    }
  }

  function handleMadePrivate() {
    router.push("/dashboard");
  }

  if (noteQuery.isPending) return <main style={main}>Loading note…</main>;
  const note = noteQuery.data;
  if (!note) {
    return (
      <main style={main}>
        <p>Note not found.</p>
        <button type="button" onClick={() => router.push("/dashboard")} style={ghostBtn}>
          Back to dashboard
        </button>
      </main>
    );
  }

  return (
    <main style={main}>
      <header style={header}>
        <button type="button" onClick={() => router.push("/dashboard")} style={ghostBtn}>
          ← My Notes
        </button>
        {note.isOwner ? (
          <div style={{ display: "flex", gap: 8, position: "relative" }}>
            <ShareDialog noteId={id} initialAccess={note.access} />
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteNote.isPending}
              style={dangerBtn}
            >
              {deleteNote.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : null}
      </header>

      <h1>{note.title}</h1>
      <Editor noteId={id} onMadePrivate={note.isOwner ? undefined : handleMadePrivate} />
    </main>
  );
}

const main = { fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 720 } as const;
const header = { display: "flex", justifyContent: "space-between", marginBottom: 24 } as const;
const ghostBtn = { padding: "6px 12px", borderRadius: 6, cursor: "pointer" } as const;
const dangerBtn = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #d33",
  color: "#d33",
  background: "transparent",
  cursor: "pointer",
} as const;
