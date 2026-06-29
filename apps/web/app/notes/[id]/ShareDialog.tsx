"use client";

import type { NoteAccess } from "@yapper/schemas";
import { useEffect, useState } from "react";
import { useMakePrivate, useShareNote } from "../../../lib/queries/notes";
import { useUiStore } from "../../../lib/stores/ui";

type ShareLevel = "view" | "edit";

/** Current share link state shown in the panel (url is absent until sharing is (re)enabled). */
interface ShareLink {
  url?: string;
  access: NoteAccess;
}

/**
 * Owner-only sharing control. Pick view/edit to enable sharing, copy the link, or make the note
 * private again (rotates the token and instantly disconnects all collaborators — slice 07).
 * Open state lives in the UI store; share/make-private are TanStack Query mutations that invalidate
 * the note metadata.
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

  if (!open) {
    return (
      <button type="button" onClick={openDialog} style={primaryBtn}>
        Share
      </button>
    );
  }

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <strong>Share this note</strong>
        <button type="button" onClick={closeDialog} style={ghostBtn}>
          ✕
        </button>
      </div>

      <label style={{ display: "block", fontSize: 14 }}>
        Anyone with the link can:
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as ShareLevel)}
          style={{ marginLeft: 8 }}
        >
          <option value="view">View</option>
          <option value="edit">Edit</option>
        </select>
      </label>

      <button type="button" onClick={enableSharing} disabled={busy} style={primaryBtn}>
        {busy ? "Saving…" : share ? "Update access" : "Enable sharing"}
      </button>

      {share?.url ? (
        <div style={linkRow}>
          <input readOnly value={share.url} style={linkInput} />
          <button type="button" onClick={copyLink} style={ghostBtn}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      ) : null}

      {share ? (
        <button type="button" onClick={makeNotePrivate} disabled={busy} style={dangerBtn}>
          {busy ? "Saving…" : "Make private"}
        </button>
      ) : null}
    </div>
  );
}

const primaryBtn = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
} as const;
const ghostBtn = { padding: "6px 10px", borderRadius: 6, cursor: "pointer" } as const;
const dangerBtn = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid #d33",
  color: "#d33",
  background: "transparent",
  cursor: "pointer",
} as const;
const panel = {
  position: "absolute" as const,
  right: 0,
  marginTop: 8,
  width: 320,
  background: "#fff",
  border: "1px solid #e2e2e2",
  borderRadius: 8,
  padding: 16,
  display: "grid",
  gap: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  zIndex: 10,
};
const panelHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} as const;
const linkRow = { display: "flex", gap: 8 } as const;
const linkInput = {
  flex: 1,
  fontSize: 12,
  padding: "6px 8px",
  border: "1px solid #e2e2e2",
  borderRadius: 6,
} as const;
