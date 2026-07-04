"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { NoteSummary, SharedNoteSummary } from "@yapper/schemas";
import { Loader2, PenLine } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LabelEditor } from "@/components/dashboard/label-editor";
import { NoteDialog } from "@/components/dashboard/note-dialog";
import { NoteSection } from "@/components/dashboard/note-section";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { Input } from "@/components/ui/input";
import {
  type DashboardView,
  filterForView,
  labelQuery,
  readActiveView,
  viewQuery,
} from "@/lib/dashboard-view";
import { signOut, useSession } from "../../lib/auth-client";
import { useDeleteLabel, useLabels } from "../../lib/queries/labels";
import {
  noteKeys,
  useArchiveNote,
  useCreateNote,
  useNotes,
  usePermanentDelete,
  useRestoreNote,
  useSharedNotes,
  useTrashNote,
  useUnarchiveNote,
} from "../../lib/queries/notes";

function matches(note: NoteSummary, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return note.title.toLowerCase().includes(needle) || note.preview.toLowerCase().includes(needle);
}

/** Copy per view: section heading + empty-state text + the note-card variant. */
const VIEW_META: Record<DashboardView, { label: string; empty: string }> = {
  my: { label: "My Notes", empty: "No notes yet. Create your first one." },
  shared: { label: "Shared with Me", empty: "No notes shared with you yet." },
  archive: { label: "Archive", empty: "No archived notes." },
  trash: { label: "Trash", empty: "Trash is empty." },
};

/** Redesigned dashboard: sidebar + top bar shell rendering a SINGLE active view (My Notes /
 * Shared / Archive / Trash / label filter), driven by the URL. Per-view card actions
 * (archive/trash/restore/delete-forever); live search scoped to the active view. */
export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { view, labelId } = readActiveView(searchParams);
  const isShared = view === "shared";

  const notesQuery = useNotes(filterForView(view), labelId, !isShared);
  const sharedQuery = useSharedNotes();
  const labelsQuery = useLabels();
  const createNote = useCreateNote();
  const archiveNote = useArchiveNote();
  const unarchiveNote = useUnarchiveNote();
  const trashNote = useTrashNote();
  const restoreNote = useRestoreNote();
  const permanentDelete = usePermanentDelete();
  const deleteLabel = useDeleteLabel();

  const [search, setSearch] = useState("");
  const [dialogNoteId, setDialogNoteId] = useState<string | null>(null);
  const [labelsNoteId, setLabelsNoteId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  // Search is scoped to the active view and clears whenever the view (or label) switches.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on view/label change only.
  useEffect(() => {
    setSearch("");
  }, [view, labelId]);

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
    return (
      <main className="flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading…
      </main>
    );
  }
  if (!session) return null;

  async function createAndOpen() {
    setSidebarOpen(false);
    try {
      const note = await createNote.mutateAsync();
      setDialogNoteId(note.id);
    } catch {
      // mutation state re-enables the trigger; nothing else to surface here
    }
  }

  function navigate(next: DashboardView) {
    setSidebarOpen(false);
    router.push(viewQuery(next));
  }

  const labels = labelsQuery.data ?? [];
  const activeLabel = labelId ? labels.find((l) => l.id === labelId) : undefined;
  const heading = labelId ? (activeLabel?.name ?? "Labeled notes") : VIEW_META[view].label;
  const sectionNotes = isShared ? shared : owned;
  const sectionLoading = isShared ? sharedQuery.isPending : notesQuery.isPending;
  // The note whose Labels… editor is open (looked up unfiltered so search doesn't hide it).
  const editingNote = (notesQuery.data ?? []).find((n) => n.id === labelsNoteId);
  // Labels… is offered only on owned, non-trash cards.
  const canEditLabels = !isShared && view !== "trash";

  function selectLabel(id: string) {
    setSidebarOpen(false);
    router.push(labelQuery(id));
  }

  function removeLabel(id: string) {
    deleteLabel.mutate(id);
    if (id === labelId) router.push(viewQuery("my"));
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeView={view}
        labelActive={labelId !== null}
        onSelectView={navigate}
        onNewNote={createAndOpen}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        labels={labels}
        activeLabelId={labelId}
        onSelectLabel={selectLabel}
        onDeleteLabel={removeLabel}
      />
      <div className="flex flex-1 flex-col overflow-hidden md:ml-60">
        <TopBar
          search={search}
          onSearch={setSearch}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: noteKeys.all })}
          email={session.user.email}
          onMenuClick={() => setSidebarOpen(true)}
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
            label={heading}
            loading={sectionLoading}
            notes={sectionNotes}
            variant={
              isShared
                ? "shared"
                : view === "archive"
                  ? "archive"
                  : view === "trash"
                    ? "trash"
                    : "my"
            }
            ownerNames={isShared ? ownerNames : undefined}
            emptyText={VIEW_META[view].empty}
            onOpen={setDialogNoteId}
            onArchive={(id) => archiveNote.mutate(id)}
            onUnarchive={(id) => unarchiveNote.mutate(id)}
            onTrash={(id) => trashNote.mutate(id)}
            onRestore={(id) => restoreNote.mutate(id)}
            onDeleteForever={(id) => permanentDelete.mutate(id)}
            onEditLabels={canEditLabels ? (id) => setLabelsNoteId(id) : undefined}
          />
        </main>
      </div>

      <NoteDialog noteId={dialogNoteId} onClose={() => setDialogNoteId(null)} />
      {labelsNoteId ? (
        <LabelEditor
          key={labelsNoteId}
          noteId={labelsNoteId}
          attachedIds={editingNote?.labels.map((l) => l.id) ?? []}
          open
          onClose={() => setLabelsNoteId(null)}
        />
      ) : null}
    </div>
  );
}
