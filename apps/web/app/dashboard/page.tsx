"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type NoteSummary, notesApi } from "../../lib/api";
import { signOut, useSession } from "../../lib/auth-client";

/**
 * The owner's dashboard: "My Notes" list + create + empty state (slice 03).
 * Gated client-side — the session cookie lives on the `api` origin, so `useSession`
 * asks `api` with credentials and logged-out visitors are redirected to `/login`.
 * "Shared with me" arrives in slice 06.
 */
export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  const loadNotes = useCallback(() => {
    notesApi
      .list()
      .then(setNotes)
      .catch(() => setNotes([]));
  }, []);

  useEffect(() => {
    if (session) loadNotes();
  }, [session, loadNotes]);

  if (isPending) return <main style={main}>Loading…</main>;
  if (!session) return null; // redirecting

  async function logout() {
    await signOut();
    router.replace("/login");
  }

  async function createNote() {
    setCreating(true);
    try {
      const note = await notesApi.create();
      router.push(`/notes/${note.id}`);
    } catch {
      setCreating(false);
    }
  }

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

      <button type="button" onClick={createNote} disabled={creating} style={primaryBtn}>
        {creating ? "Creating…" : "New note"}
      </button>

      {notes === null ? (
        <p style={{ color: "#555" }}>Loading notes…</p>
      ) : notes.length === 0 ? (
        <p style={{ color: "#555" }}>No notes yet. Create your first one.</p>
      ) : (
        <ul style={list}>
          {notes.map((note) => (
            <li key={note.id} style={listItem}>
              <Link href={`/notes/${note.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <span style={{ fontWeight: 600 }}>{note.title}</span>
                {note.preview ? (
                  <span style={{ color: "#666", display: "block", fontSize: 14 }}>
                    {note.preview}
                  </span>
                ) : null}
                <span style={{ color: "#999", display: "block", fontSize: 12, marginTop: 4 }}>
                  {new Date(note.updatedAt).toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
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
const listItem = { border: "1px solid #e5e5e5", borderRadius: 8, padding: "12px 16px" } as const;
