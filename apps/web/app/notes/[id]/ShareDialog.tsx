"use client";

import { useState } from "react";
import { type NoteAccess, notesApi, type ShareInfo } from "../../../lib/api";

type ShareLevel = Exclude<NoteAccess, "private">;

/**
 * Owner-only sharing control. Pick view/edit to enable sharing, copy the link, or make the note
 * private again (rotates the token and instantly disconnects all collaborators — slice 07).
 */
export function ShareDialog({
  noteId,
  initialAccess,
  onAccessChange,
}: {
  noteId: string;
  initialAccess: NoteAccess;
  onAccessChange?: (newAccess: NoteAccess) => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<ShareLevel>(initialAccess === "edit" ? "edit" : "view");
  const [share, setShare] = useState<ShareInfo | null>(
    // If already shared, surface the current access so the panel shows the link state.
    initialAccess !== "private" ? ({ access: initialAccess } as ShareInfo) : null,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function enableSharing() {
    setBusy(true);
    try {
      const info = await notesApi.share(noteId, level);
      setShare(info);
      onAccessChange?.(info.access);
    } finally {
      setBusy(false);
    }
  }

  async function makePrivate() {
    setBusy(true);
    try {
      await notesApi.makePrivate(noteId);
      setShare(null);
      setOpen(false);
      onAccessChange?.("private");
    } finally {
      setBusy(false);
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
      <button type="button" onClick={() => setOpen(true)} style={primaryBtn}>
        Share
      </button>
    );
  }

  return (
    <div style={panel}>
      <div style={panelHeader}>
        <strong>Share this note</strong>
        <button type="button" onClick={() => setOpen(false)} style={ghostBtn}>
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
        <button type="button" onClick={makePrivate} disabled={busy} style={dangerBtn}>
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
