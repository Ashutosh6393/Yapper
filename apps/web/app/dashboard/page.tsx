"use client";

import type { NoteSummary } from "@yapper/schemas";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

  if (isPending) {
    return <main className="mx-auto max-w-2xl px-6 py-12 text-muted-foreground">Loading…</main>;
  }
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

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">My Notes</h1>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {session.user.email}
          </span>
          <ThemeToggle />
          <Button type="button" variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <Button type="button" onClick={handleCreate} disabled={createNote.isPending} className="mb-6">
        {createNote.isPending ? "Creating…" : "New note"}
      </Button>

      <NoteList
        loading={notesQuery.isPending}
        notes={notesQuery.data ?? []}
        emptyText="No notes yet. Create your first one."
      />

      <h2 className="mt-10 mb-4 text-lg font-semibold tracking-tight">Shared with me</h2>
      <NoteList
        loading={sharedQuery.isPending}
        notes={sharedQuery.data ?? []}
        emptyText="No notes shared with you yet."
        showBadge
      />
    </main>
  );
}

function NoteList({
  loading,
  notes,
  emptyText,
  showBadge,
}: {
  loading: boolean;
  notes: Array<NoteSummary & { access?: string }>;
  emptyText: string;
  showBadge?: boolean;
}) {
  const reduce = useReducedMotion();

  if (loading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-[68px] w-full rounded-xl" />
        <Skeleton className="h-[68px] w-full rounded-xl" />
      </div>
    );
  }
  if (notes.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ul className="grid gap-3">
      {notes.map((note, i) => (
        <motion.li
          key={note.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: reduce ? 0 : i * 0.04 }}
        >
          <NoteCard note={note} badge={showBadge ? note.access : undefined} />
        </motion.li>
      ))}
    </ul>
  );
}

/** A single note row linking into the editor, with an optional access badge (for shared notes). */
function NoteCard({ note, badge }: { note: NoteSummary; badge?: string }) {
  return (
    <Card className="gap-0 p-0 transition-colors hover:border-primary/40">
      <Link href={`/notes/${note.id}`} className="block p-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{note.title}</span>
          {badge ? (
            <Badge variant="secondary" className="uppercase">
              {badge}
            </Badge>
          ) : null}
        </div>
        {note.preview ? (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{note.preview}</p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(note.updatedAt).toLocaleString()}
        </p>
      </Link>
    </Card>
  );
}
