"use client";

import type { NoteSummary } from "@yapper/schemas";
import { Skeleton } from "@/components/ui/skeleton";
import { NoteCard, type NoteCardVariant } from "./note-card";

/** Varied skeleton heights (literal classes so Tailwind keeps them) to preview the masonry layout. */
const SKELETON_HEIGHTS = ["h-28", "h-40", "h-32", "h-36", "h-24", "h-44"] as const;

export function NoteSection({
  label,
  loading,
  notes,
  ownerNames,
  variant,
  emptyText,
  onOpen,
  onPrefetch,
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
  onPrefetch?: (id: string) => void;
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
        // Pinterest-style masonry: variable-height skeletons tile into responsive columns.
        <div className="columns-1 gap-3.5 sm:columns-2 lg:columns-3 xl:columns-4">
          {SKELETON_HEIGHTS.map((h) => (
            <Skeleton key={h} className={`mb-3.5 w-full break-inside-avoid rounded-xl ${h}`} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        // CSS `columns` masonry: cards keep their natural height (no fixed rows) and tile into the
        // shortest column; each card is wrapped in a break-avoid box so it never splits across columns.
        <div className="columns-1 gap-3.5 sm:columns-2 lg:columns-3 xl:columns-4">
          {notes.map((note) => (
            <div key={note.id} className="mb-3.5 break-inside-avoid">
              <NoteCard
                note={note}
                variant={variant}
                ownerName={ownerNames?.[note.id]}
                onOpen={() => onOpen(note.id)}
                onPrefetch={onPrefetch ? () => onPrefetch(note.id) : undefined}
                onArchive={onArchive ? () => onArchive(note.id) : undefined}
                onUnarchive={onUnarchive ? () => onUnarchive(note.id) : undefined}
                onTrash={onTrash ? () => onTrash(note.id) : undefined}
                onRestore={onRestore ? () => onRestore(note.id) : undefined}
                onDeleteForever={onDeleteForever ? () => onDeleteForever(note.id) : undefined}
                onEditLabels={onEditLabels ? () => onEditLabels(note.id) : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
