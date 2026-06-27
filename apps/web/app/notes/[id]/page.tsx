"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type NoteMetadata, notesApi } from "../../../lib/api";
import { useSession } from "../../../lib/auth-client";
import { Editor } from "./Editor";
import { ShareDialog } from "./ShareDialog";

/**
 * Note page (slice 04): gated; loads metadata, then mounts the collaborative {@link Editor} bound
 * to the note's Yjs doc over the socket. 403/404 from `api` resolve to "not found" here.
 */
export default function NotePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [note, setNote] = useState<NoteMetadata | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  const loadNote = useCallback(() => {
    notesApi
      .get(id)
      .then((data) => {
        setNote(data);
        setStatus("ready");
      })
      // 403/404 (and any other failure) → "not found" for this shell.
      .catch(() => setStatus("notfound"));
  }, [id]);

  useEffect(() => {
    if (session) loadNote();
  }, [session, loadNote]);

  if (isPending) return <main style={main}>Loading…</main>;
  if (!session) return null; // redirecting

  async function deleteNote() {
    setDeleting(true);
    try {
      await notesApi.remove(id);
      router.push("/dashboard");
    } catch {
      setDeleting(false);
    }
  }

  if (status === "loading") return <main style={main}>Loading note…</main>;
  if (status === "notfound" || !note) {
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
            <button type="button" onClick={deleteNote} disabled={deleting} style={dangerBtn}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : null}
      </header>

      <h1>{note.title}</h1>
      <Editor noteId={id} />
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
