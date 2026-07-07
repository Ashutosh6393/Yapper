"use client";

import type { LabelColor } from "@yapper/schemas";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateLabel, useSetNoteLabels } from "@/lib/queries/labels";
import * as engineActions from "@/lib/sync/actions";
import { isSyncEngineEnabled } from "@/lib/sync/flag";
import { useLabelList } from "@/lib/sync/reads";
import { LABEL_COLOR_KEYS, LabelDot } from "./label-chip";

/** The card ⋮ "Labels…" editor: check the labels attached to a note, inline-create new ones, and
 * Save (PUT replaces the whole set). Rendered per-note (keyed) so it opens fresh each time. */
export function LabelEditor({
  noteId,
  attachedIds,
  open,
  onClose,
}: {
  noteId: string;
  attachedIds: string[];
  open: boolean;
  onClose: () => void;
}) {
  const syncOn = isSyncEngineEnabled();
  const labels = useLabelList() ?? [];
  const createLabel = useCreateLabel();
  const setNoteLabels = useSetNoteLabels();

  const [selected, setSelected] = useState<Set<string>>(() => new Set(attachedIds));
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("slate");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (syncOn) {
      const id = engineActions.createLabel(trimmed, color);
      setSelected((prev) => new Set(prev).add(id));
      setName("");
      return;
    }
    try {
      const created = await createLabel.mutateAsync({ name: trimmed, color });
      setSelected((prev) => new Set(prev).add(created.id));
      setName("");
    } catch {
      // duplicate/invalid — mutation state re-enables the button
    }
  }

  async function handleSave() {
    if (syncOn) {
      // Decompose the new set vs the attached set into per-link apply/remove mutations.
      engineActions.setNoteLabels(noteId, attachedIds, [...selected]);
      onClose();
      return;
    }
    try {
      await setNoteLabels.mutateAsync({ noteId, labelIds: [...selected] });
      onClose();
    } catch {
      // keep the dialog open on failure
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Labels</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
          {labels.map((label) => (
            <label
              key={label.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/[0.04]"
            >
              <input
                type="checkbox"
                checked={selected.has(label.id)}
                onChange={() => toggle(label.id)}
                className="size-4 accent-primary"
              />
              <LabelDot color={label.color} />
              <span className="truncate">{label.name}</span>
            </label>
          ))}
          {labels.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              No labels yet — create one below.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="New label name"
            aria-label="New label name"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {LABEL_COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={`Color ${key}`}
                  aria-pressed={color === key}
                  onClick={() => setColor(key)}
                  className={`rounded-full p-0.5 ${color === key ? "ring-2 ring-primary" : ""}`}
                >
                  <LabelDot color={key} />
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCreate}
              disabled={!name.trim() || createLabel.isPending}
            >
              <Plus className="size-4" />
              Create
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={setNoteLabels.isPending}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
