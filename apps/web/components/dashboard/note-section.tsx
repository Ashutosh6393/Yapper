"use client";

import type { NoteSummary } from "@yapper/schemas";
import { Skeleton } from "@/components/ui/skeleton";
import { NoteCard, type NoteCardVariant } from "./note-card";

export function NoteSection({
  label,
  loading,
  notes,
  ownerNames,
  variant,
  emptyText,
  onOpen,
  onArchive,
  onUnarchive,
  onTrash,
  onRestore,
  onDeleteForever,
  onEditLabels,
}: {
  label: string;
  loading: boolean;
  notes: NoteSummary[];
  ownerNames?: Record<string, string>;
  variant: NoteCardVariant;
  emptyText: string;
  onOpen: (id: string) => void;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeleteForever?: (id: string) => void;
  onEditLabels?: (id: string) => void;
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
              variant={variant}
              ownerName={ownerNames?.[note.id]}
              onOpen={() => onOpen(note.id)}
              onArchive={onArchive ? () => onArchive(note.id) : undefined}
              onUnarchive={onUnarchive ? () => onUnarchive(note.id) : undefined}
              onTrash={onTrash ? () => onTrash(note.id) : undefined}
              onRestore={onRestore ? () => onRestore(note.id) : undefined}
              onDeleteForever={onDeleteForever ? () => onDeleteForever(note.id) : undefined}
              onEditLabels={onEditLabels ? () => onEditLabels(note.id) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
