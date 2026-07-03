"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { NoteSummary, SharedNoteSummary } from "@yapper/schemas";
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { NoteDialog } from "@/components/dashboard/note-dialog";
import { NoteSection } from "@/components/dashboard/note-section";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { Input } from "@/components/ui/input";
import { signOut, useSession } from "../../lib/auth-client";
import {
  noteKeys,
  useCreateNote,
  useDeleteNote,
  useNotes,
  useSharedNotes,
} from "../../lib/queries/notes";

function matches(note: NoteSummary, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return note.title.toLowerCase().includes(needle) || note.preview.toLowerCase().includes(needle);
}

/** Redesigned dashboard: sidebar + top bar shell, My Notes / Shared sections, live search, and a
 * note dialog (new + existing). Session-gated client-side; logged-out visitors go to /login. */
export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const notesQuery = useNotes();
  const sharedQuery = useSharedNotes();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  const [search, setSearch] = useState("");
  const [dialogNoteId, setDialogNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  const owned = useMemo(
    () => (notesQuery.data ?? []).filter((n) => matches(n, search)),
    [notesQuery.data, search],
  );
  const shared = useMemo(
    () => (sharedQuery.data ?? []).filter((n) => matches(n, search)),
    [sharedQuery.data, search],
  );
  const ownerNames = useMemo(
    () =>
      Object.fromEntries(
        (sharedQuery.data ?? []).map((n: SharedNoteSummary) => [n.id, n.ownerName]),
      ),
    [sharedQuery.data],
  );

  if (isPending) {
    return <main className="p-12 text-muted-foreground">Loading…</main>;
  }
  if (!session) return null;

  async function createAndOpen() {
    try {
      const note = await createNote.mutateAsync();
      setDialogNoteId(note.id);
    } catch {
      // mutation state re-enables the trigger; nothing else to surface here
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar onNewNote={createAndOpen} />
      <div className="flex flex-1 flex-col overflow-hidden md:ml-60">
        <TopBar
          search={search}
          onSearch={setSearch}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: noteKeys.all })}
          email={session.user.email}
          onSignOut={async () => {
            await signOut();
            router.replace("/login");
          }}
        />
        <main className="flex-1 overflow-y-auto px-7 pt-7 pb-24">
          <div className="mx-auto mb-9 max-w-xl">
            <div className="relative">
              <PenLine className="pointer-events-none absolute top-1/2 left-5 size-[18px] -translate-y-1/2 text-muted-foreground" />
              <Input
                readOnly
                onClick={createAndOpen}
                placeholder="Start a new note…"
                className="h-14 cursor-pointer rounded-full border-transparent pl-12 text-base shadow-none ring-1 ring-border transition-shadow hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          <NoteSection
            label="My Notes"
            loading={notesQuery.isPending}
            notes={owned}
            emptyText="No notes yet. Create your first one."
            onOpen={setDialogNoteId}
            onDelete={(id) => deleteNote.mutate(id)}
          />
          <NoteSection
            label="Shared with Me"
            loading={sharedQuery.isPending}
            notes={shared}
            ownerNames={ownerNames}
            emptyText="No notes shared with you yet."
            onOpen={setDialogNoteId}
            onDelete={(id) => deleteNote.mutate(id)}
          />
        </main>
      </div>

      <NoteDialog noteId={dialogNoteId} onClose={() => setDialogNoteId(null)} />
    </div>
  );
}
