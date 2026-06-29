"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { EditorContent, useEditor } from "@tiptap/react";
import { buildExtensions } from "@yapper/editor";
import { type AwarenessUser, socketServerMessageSchema } from "@yapper/schemas";
import { useEffect, useState } from "react";
import { getAuthToken } from "../../../lib/auth-token";
import { type ConnStatus, useEditorStore } from "../../../lib/stores/editor";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "ws://localhost:1234";

export function Editor({ noteId, onMadePrivate }: { noteId: string; onMadePrivate?: () => void }) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const setStatus = useEditorStore((s) => s.setStatus);
  const setIdentity = useEditorStore((s) => s.setIdentity);
  const setPermission = useEditorStore((s) => s.setPermission);
  const markPrivate = useEditorStore((s) => s.markPrivate);
  const reset = useEditorStore((s) => s.reset);

  useEffect(() => {
    // Fresh collab state for this note; the store is shared across mounts.
    reset();
    // Track whether we intentionally disconnected due to a server kick, so `onDisconnect`
    // does not override the `made_private` status with "disconnected".
    let madePrivate = false;

    const p = new HocuspocusProvider({
      url: SOCKET_URL,
      name: noteId,
      token: () => getAuthToken(),
      onStatus: ({ status }) => setStatus(status === "connected" ? "connected" : "connecting"),
      onDisconnect: () => {
        if (!madePrivate) setStatus("disconnected");
      },
      onAuthenticationFailed: () => setStatus("denied"),
      onStateless: ({ payload }) => {
        // Server→client messages share their shape with the socket via @yapper/schemas.
        const parsed = socketServerMessageSchema.safeParse(JSON.parse(payload));
        if (!parsed.success) return;
        const msg = parsed.data;
        if (msg.type === "identity") {
          setIdentity(msg.user);
          setPermission(msg.permission);
        } else if (msg.type === "kick" && msg.reason === "note_made_private") {
          madePrivate = true;
          markPrivate();
          p.disconnect();
          onMadePrivate?.();
        }
      },
    });
    setProvider(p);
    return () => p.destroy();
  }, [noteId, onMadePrivate, reset, setStatus, setIdentity, setPermission, markPrivate]);

  if (!provider) return null;
  return <BoundEditor key={noteId} provider={provider} />;
}

function BoundEditor({ provider }: { provider: HocuspocusProvider }) {
  const status = useEditorStore((s) => s.status);
  const identity = useEditorStore((s) => s.identity);
  const permission = useEditorStore((s) => s.permission);

  const editor = useEditor({
    extensions: [...buildExtensions(provider.document), CollaborationCaret.configure({ provider })],
    immediatelyRender: false,
    editable: false,
    editorProps: { attributes: { style: editorAttrStyle } },
  });

  useEffect(() => {
    if (editor && identity) editor.commands.updateUser(identity);
  }, [editor, identity]);

  useEffect(() => {
    editor?.setEditable(permission === "edit");
  }, [editor, permission]);

  if (status === "made_private") {
    return (
      <div style={madePrivateBanner}>
        <p style={{ margin: 0, fontWeight: 600 }}>Note made private by owner</p>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#555" }}>
          The owner has stopped sharing this note.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={topRow}>
        <ConnectionBadge status={status} />
        {permission === "view" && <span style={viewOnlyTag}>View only</span>}
        {editor && <Presence provider={provider} />}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Presence({ provider }: { provider: HocuspocusProvider }) {
  const [users, setUsers] = useState<AwarenessUser[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const update = () => {
      const byId = new Map<string, AwarenessUser>();
      for (const state of awareness.getStates().values()) {
        const user = (state as { user?: AwarenessUser }).user;
        if (user?.id) byId.set(user.id, user);
      }
      setUsers([...byId.values()]);
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [provider]);

  if (users.length === 0) return null;
  return (
    <div style={presence}>
      {users.map((u) => (
        <span key={u.id} style={chip} title={u.name}>
          <span style={{ ...dot, background: u.color }} />
          {u.name}
        </span>
      ))}
    </div>
  );
}

function ConnectionBadge({ status }: { status: ConnStatus }) {
  const label: Record<ConnStatus, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    disconnected: "Disconnected — reconnecting…",
    denied: "Access denied",
    made_private: "Note made private",
  };
  const color: Record<ConnStatus, string> = {
    connecting: "#b58900",
    connected: "#2aa198",
    disconnected: "#b58900",
    denied: "#d33",
    made_private: "#d33",
  };
  return (
    <div style={{ ...badge, color: color[status] }}>
      <span style={{ ...dot, background: color[status] }} />
      {label[status]}
    </div>
  );
}

const topRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap" as const,
};
const presence = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap" as const,
};
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#f3f3f3",
} as const;
const badge = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  marginBottom: 12,
} as const;
const dot = { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } as const;
const viewOnlyTag = {
  fontSize: 12,
  color: "#b58900",
  border: "1px solid #e6d8a8",
  borderRadius: 999,
  padding: "1px 8px",
} as const;
const madePrivateBanner = {
  padding: "24px 16px",
  background: "#fff5f5",
  border: "1px solid #ffc5c5",
  borderRadius: 8,
  textAlign: "center" as const,
} as const;
const editorAttrStyle =
  "min-height: 320px; outline: none; border: 1px solid #e2e2e2; border-radius: 8px; padding: 16px;";
