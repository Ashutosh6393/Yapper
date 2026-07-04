"use client";

import type { Label } from "@yapper/schemas";
import { Trash2 } from "lucide-react";
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
import { LabelDot } from "./label-chip";

/** Sidebar "Labels" section: hidden until ≥1 label. Each row is color dot + name + active-note
 * count, clicking it filters the dashboard to that label. A hover delete icon confirms, then
 * removes the label (notes keep existing, they just lose the chip). */
export function LabelNav({
  labels,
  activeLabelId = null,
  onSelectLabel,
  onDeleteLabel,
}: {
  labels: Label[];
  activeLabelId?: string | null;
  onSelectLabel?: (id: string) => void;
  onDeleteLabel?: (id: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<Label | null>(null);

  if (labels.length === 0) return null;

  return (
    <div className="mt-4 pr-3">
      <div className="px-5 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        Labels
      </div>
      <ul className="flex flex-col gap-0.5">
        {labels.map((label) => {
          const active = activeLabelId === label.id;
          return (
            <li key={label.id} className="group/label relative">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onSelectLabel?.(label.id)}
                className={`flex w-full items-center gap-2 rounded-r-full py-1.5 pr-9 pl-5 text-left text-[13px] font-medium ${
                  active
                    ? "bg-white/[0.06] text-primary"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                }`}
              >
                <LabelDot color={label.color} />
                <span className="flex-1 truncate">{label.name}</span>
                <span className="text-[11px] text-muted-foreground/70">{label.noteCount}</span>
              </button>
              <button
                type="button"
                aria-label={`Delete label ${label.name}`}
                onClick={() => setPendingDelete(label)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-foreground focus-visible:opacity-100 group-hover/label:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => (open ? undefined : setPendingDelete(null))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete label?</DialogTitle>
            <DialogDescription>
              "{pendingDelete?.name}" will be removed from all notes. The notes themselves are kept.
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
                if (pendingDelete) onDeleteLabel?.(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
