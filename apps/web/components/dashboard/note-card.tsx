"use client";

import type { NoteSummary } from "@yapper/schemas";
import { Eye, Lock, MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** One note in a grid. Owned: Private/Public badge. Shared: owner line + View/Edit badge. */
export function NoteCard({
  note,
  ownerName,
  onOpen,
  onDelete,
}: {
  note: NoteSummary;
  ownerName?: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isShared = ownerName !== undefined;
  return (
    <div className="group rounded-xl border border-border bg-card p-[18px] transition-colors hover:border-primary/30">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {isShared ? (
            <div className="mb-1 truncate text-[10px] font-semibold text-muted-foreground">
              {ownerName}'s note
            </div>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            className="block truncate text-left text-sm font-bold tracking-tight hover:underline"
          >
            {note.title}
          </button>
          <div className="mt-1">
            <AccessBadge access={note.access} isShared={isShared} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Note actions"
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            >
              <MoreVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {note.preview ? (
        <button
          type="button"
          onClick={onOpen}
          className="mb-3 block w-full text-left text-[13px] leading-relaxed text-muted-foreground line-clamp-3"
        >
          {note.preview}
        </button>
      ) : null}

      <div className="text-[11px] text-muted-foreground/70">
        {new Date(note.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}

function AccessBadge({ access, isShared }: { access: NoteSummary["access"]; isShared: boolean }) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold";
  if (isShared) {
    return access === "edit" ? (
      <span className={`${base} border-primary/25 bg-primary/10 text-primary`}>Edit</span>
    ) : (
      <span className={`${base} border-border bg-white/[0.05] text-muted-foreground`}>
        <Eye className="size-2.5" />
        View only
      </span>
    );
  }
  return access === "private" ? (
    <span className={`${base} border-border bg-white/[0.05] text-muted-foreground`}>
      <Lock className="size-2.5" />
      Private
    </span>
  ) : (
    <span className={`${base} border-primary/25 bg-primary/10 text-primary`}>Public</span>
  );
}
