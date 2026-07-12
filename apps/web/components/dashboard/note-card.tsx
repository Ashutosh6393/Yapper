"use client";

import type { NoteSummary } from "@yapper/schemas";
import {
  Archive,
  ArchiveRestore,
  Eye,
  Lock,
  MoreVertical,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LabelChips } from "./label-chip";

/** Which lifecycle view the card is rendered in — drives the ⋮ menu and openability. */
export type NoteCardVariant = "my" | "archive" | "trash" | "shared";

/** One note in a grid. The ⋮ menu depends on `variant`; shared cards have no menu and trash cards
 * are non-openable (goal #2/#4). Delete forever (trash only) confirms before the irreversible call. */
export function NoteCard({
  note,
  ownerName,
  variant = "my",
  onOpen,
  onPrefetch,
  onArchive,
  onUnarchive,
  onTrash,
  onRestore,
  onDeleteForever,
  onEditLabels,
}: {
  note: NoteSummary;
  ownerName?: string;
  variant?: NoteCardVariant;
  onOpen: () => void;
  onPrefetch?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onTrash?: () => void;
  onRestore?: () => void;
  onDeleteForever?: () => void;
  onEditLabels?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isShared = variant === "shared";
  const openable = variant !== "trash";

  const body = (
    <div className="mb-2 min-w-0 pr-7">
      {isShared && ownerName ? (
        <div className="mb-1 truncate text-[10px] font-semibold text-muted-foreground">
          {ownerName}'s note
        </div>
      ) : null}
      <div className="truncate text-sm font-bold tracking-tight">{note.title}</div>
      <div className="mt-1">
        <AccessBadge access={note.access} isShared={isShared} />
      </div>
    </div>
  );

  // Chips render on owned, non-trash cards only (the API sends no labels for shared/trash).
  const showChips = variant === "my" || variant === "archive";
  const meta = (
    <>
      {note.preview ? (
        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground line-clamp-3">
          {note.preview}
        </p>
      ) : null}
      {showChips ? <LabelChips labels={note.labels} /> : null}
      <div className="text-[11px] text-muted-foreground/70">
        {new Date(note.updatedAt).toLocaleString()}
      </div>
    </>
  );

  return (
    <div className="group relative rounded-xl border border-border bg-card transition-colors hover:border-primary/30">
      {openable ? (
        <button
          type="button"
          onClick={onOpen}
          onPointerEnter={onPrefetch}
          onFocus={onPrefetch}
          className="block w-full cursor-pointer rounded-xl p-[18px] text-left"
        >
          {body}
          {meta}
        </button>
      ) : (
        <div className="block w-full rounded-xl p-[18px] text-left">
          {body}
          {meta}
        </div>
      )}

      {isShared ? null : (
        <div className="absolute top-[14px] right-[14px]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Note actions"
                className="rounded-full p-1 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {variant === "trash" ? (
                <>
                  <DropdownMenuItem onSelect={onRestore}>
                    <RotateCcw className="size-4" />
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      setConfirmOpen(true);
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete forever
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  {onEditLabels ? (
                    <DropdownMenuItem onSelect={onEditLabels}>
                      <Tag className="size-4" />
                      Labels…
                    </DropdownMenuItem>
                  ) : null}
                  {variant === "archive" ? (
                    <DropdownMenuItem onSelect={onUnarchive}>
                      <ArchiveRestore className="size-4" />
                      Unarchive
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={onArchive}>
                      <Archive className="size-4" />
                      Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={onTrash}>
                    <Trash2 className="size-4" />
                    Move to Trash
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete forever?</DialogTitle>
            <DialogDescription>
              "{note.title}" will be permanently deleted. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onDeleteForever?.();
              }}
            >
              Delete forever
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
