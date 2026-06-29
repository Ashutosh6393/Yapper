"use client";

import type { NoteSummary } from "@yapper/schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut, useSession } from "../../lib/auth-client";
import { useCreateNote, useNotes, useSharedNotes } from "../../lib/queries/notes";

/**
 * The owner's dashboard: "My Notes" + "Shared with me" lists, create, and empty states.
 * Gated client-side — the session cookie lives on the `api` origin, so `useSession`
 * asks `api` with credentials and logged-out visitors are redirected to `/login`.
 * Notes data is served by TanStack Query (`lib/queries/notes`).
 */
export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const notesQuery = useNotes();
  const sharedQuery = useSharedNotes();
  const createNote = useCreateNote();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending) return <main style={main}>Loading…</main>;
  if (!session) return null; // redirecting

  async function logout() {
    await signOut();
    router.replace("/login");
  }

  async function handleCreate() {
    try {
      const note = await createNote.mutateAsync();
      router.push(`/notes/${note.id}`);
    } catch {
      // mutation state re-enables the button; nothing else to surface here
    }
  }

  const notes = notesQuery.data ?? [];
  const shared = sharedQuery.data ?? [];

  return (
    <main style={main}>
      <header style={header}>
        <h1 style={{ margin: 0 }}>My Notes</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "#555", fontSize: 14 }}>{session.user.email}</span>
          <button type="button" onClick={logout} style={ghostBtn}>
            Sign out
          </button>
        </div>
      </header>

      <button
        type="button"
        onClick={handleCreate}
        disabled={createNote.isPending}
        style={primaryBtn}
      >
        {createNote.isPending ? "Creating…" : "New note"}
      </button>

      {notesQuery.isPending ? (
        <p style={{ color: "#555" }}>Loading notes…</p>
      ) : notes.length === 0 ? (
        <p style={{ color: "#555" }}>No notes yet. Create your first one.</p>
      ) : (
        <ul style={list}>
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </ul>
      )}

      <h2 style={sectionHeading}>Shared with me</h2>
      {sharedQuery.isPending ? (
        <p style={{ color: "#555" }}>Loading…</p>
      ) : shared.length === 0 ? (
        <p style={{ color: "#555" }}>No notes shared with you yet.</p>
      ) : (
        <ul style={list}>
          {shared.map((note) => (
            <NoteCard key={note.id} note={note} badge={note.access} />
          ))}
        </ul>
      )}
    </main>
  );
}

/** A single note row linking into the editor, with an optional access badge (for shared notes). */
function NoteCard({ note, badge }: { note: NoteSummary; badge?: string }) {
  return (
    <li style={listItem}>
      <Link href={`/notes/${note.id}`} style={{ textDecoration: "none", color: "inherit" }}>
        <span style={{ fontWeight: 600 }}>{note.title}</span>
        {badge ? <span style={accessBadge}>{badge}</span> : null}
        {note.preview ? (
          <span style={{ color: "#666", display: "block", fontSize: 14 }}>{note.preview}</span>
        ) : null}
        <span style={{ color: "#999", display: "block", fontSize: 12, marginTop: 4 }}>
          {new Date(note.updatedAt).toLocaleString()}
        </span>
      </Link>
    </li>
  );
}

const main = { fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 640 } as const;
const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 24,
} as const;
const primaryBtn = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  marginBottom: 24,
} as const;
const ghostBtn = { padding: "6px 12px", borderRadius: 6, cursor: "pointer" } as const;
const list = { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 } as const;
const sectionHeading = { marginTop: 40, marginBottom: 16 } as const;
const accessBadge = {
  marginLeft: 8,
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  color: "#555",
  background: "#eee",
  borderRadius: 4,
  padding: "1px 6px",
} as const;
const listItem = { border: "1px solid #e5e5e5", borderRadius: 8, padding: "12px 16px" } as const;
