"use client";

import type { NoteAccess } from "@yapper/schemas";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMakePrivate, useShareNote } from "../../../lib/queries/notes";
import { useUiStore } from "../../../lib/stores/ui";

type ShareLevel = "view" | "edit";

/** Current share link state shown in the panel (url is absent until sharing is (re)enabled). */
interface ShareLink {
  url?: string;
  access: NoteAccess;
}

/**
 * Owner-only sharing control, presented as a shadcn Popover anchored to the Share button (ADR-009).
 * Pick view/edit to enable sharing, copy the link, or make the note private again (rotates the token
 * and instantly disconnects all collaborators — slice 07). Open state lives in the UI store;
 * share/make-private are TanStack Query mutations that invalidate the note metadata.
 */
export function ShareDialog({
  noteId,
  initialAccess,
}: {
  noteId: string;
  initialAccess: NoteAccess;
}) {
  const open = useUiStore((s) => s.shareDialogOpen);
  const openDialog = useUiStore((s) => s.openShareDialog);
  const closeDialog = useUiStore((s) => s.closeShareDialog);

  const shareNote = useShareNote(noteId);
  const makePrivate = useMakePrivate(noteId);

  const [level, setLevel] = useState<ShareLevel>(initialAccess === "edit" ? "edit" : "view");
  const [share, setShare] = useState<ShareLink | null>(
    // If already shared, surface the current access so the panel shows the link state.
    initialAccess !== "private" ? { access: initialAccess } : null,
  );
  const [copied, setCopied] = useState(false);

  // Don't leak the open state into the next note page.
  useEffect(() => () => closeDialog(), [closeDialog]);

  const busy = shareNote.isPending || makePrivate.isPending;

  async function enableSharing() {
    try {
      const info = await shareNote.mutateAsync(level);
      setShare({ url: info.url, access: info.access });
    } catch {
      // mutation state holds the error; the panel stays open to retry
    }
  }

  async function makeNotePrivate() {
    try {
      await makePrivate.mutateAsync();
      setShare(null);
      closeDialog();
    } catch {
      // keep the panel open on failure
    }
  }

  async function copyLink() {
    if (!share?.url) return;
    await navigator.clipboard.writeText(share.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Popover open={open} onOpenChange={(v) => (v ? openDialog() : closeDialog())}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm">
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <div>
          <p className="font-medium">Share this note</p>
          <p className="text-sm text-muted-foreground">Anyone with the link can:</p>
        </div>

        <Select value={level} onValueChange={(v) => setLevel(v as ShareLevel)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="view">View</SelectItem>
            <SelectItem value="edit">Edit</SelectItem>
          </SelectContent>
        </Select>

        <Button type="button" onClick={enableSharing} disabled={busy} className="w-full">
          {busy ? "Saving…" : share ? "Update access" : "Enable sharing"}
        </Button>

        {share?.url ? (
          <div className="flex gap-2">
            <Input readOnly value={share.url} className="text-xs" />
            <Button type="button" variant="outline" onClick={copyLink}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        ) : null}

        {share ? (
          <Button
            type="button"
            variant="destructive"
            onClick={makeNotePrivate}
            disabled={busy}
            className="w-full"
          >
            {busy ? "Saving…" : "Make private"}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
