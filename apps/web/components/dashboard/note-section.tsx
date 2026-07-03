"use client";

import type { NoteSummary } from "@yapper/schemas";
import { Skeleton } from "@/components/ui/skeleton";
import { NoteCard } from "./note-card";

export function NoteSection({
  label,
  loading,
  notes,
  ownerNames,
  emptyText,
  onOpen,
  onDelete,
}: {
  label: string;
  loading: boolean;
  notes: NoteSummary[];
  ownerNames?: Record<string, string>;
  emptyText: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="mb-9">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-muted-foreground/70">{notes.length} notes</span>
      </div>

      {loading ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              ownerName={ownerNames?.[note.id]}
              onOpen={() => onOpen(note.id)}
              onDelete={() => onDelete(note.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
