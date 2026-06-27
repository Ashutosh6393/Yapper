"use client";

import { useState } from "react";
import { type NoteAccess, notesApi, type ShareInfo } from "../../../lib/api";

type ShareLevel = Exclude<NoteAccess, "private">;

/**
 * Owner-only sharing control (slice 06). Picks a single note-level role (view or edit), enables
 * sharing via `POST /api/notes/:id/share`, and surfaces the capability link to copy. Making a note
 * private again (token rotation + live disconnect) is slice 07 — not offered here.
 */
export function ShareDialog({
  noteId,
  initialAccess,
}: {
  noteId: string;
  initialAccess: NoteAccess;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<ShareLevel>(initialAccess === "edit" ? "edit" : "view");
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function enableSharing() {
    setBusy(true);
    try {
      const info = await notesApi.share(noteId, level);
      setShare(info);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!share) return;
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

      {share ? (
        <div style={linkRow}>
          <input readOnly value={share.url} style={linkInput} />
          <button type="button" onClick={copyLink} style={ghostBtn}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
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
