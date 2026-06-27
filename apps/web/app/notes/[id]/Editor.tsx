"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { EditorContent, useEditor } from "@tiptap/react";
import { buildExtensions } from "@yapper/editor";
import { useEffect, useState } from "react";
import { getAuthToken } from "../../../lib/api";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "ws://localhost:1234";

type ConnStatus = "connecting" | "connected" | "disconnected" | "denied";
type Permission = "none" | "view" | "edit";

/** Server-authoritative awareness identity, pushed by the socket on connect (never client-set). */
interface AwarenessUser {
  id: string;
  name: string;
  color: string;
}

/**
 * Collaborative editor for a note. Opens a `HocuspocusProvider` to the `socket` app keyed by the
 * note id, authenticating the handshake with a freshly fetched Better Auth JWT (refetched on every
 * (re)connect). TipTap binds to the provider's Yjs doc, so edits sync and persist server-side.
 *
 * Live cursors/presence (slice 05): `CollaborationCaret` broadcasts this client's caret + selection
 * geometry over awareness; its *identity* (name/color) is stamped server-side and delivered via a
 * stateless message — the client never declares its own identity (anti-spoof).
 */
export function Editor({ noteId }: { noteId: string }) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [identity, setIdentity] = useState<AwarenessUser | null>(null);
  const [permission, setPermission] = useState<Permission>("view");

  useEffect(() => {
    const p = new HocuspocusProvider({
      url: SOCKET_URL,
      name: noteId,
      // Fetched on each connect/reconnect so the short-lived token never goes stale mid-session.
      token: () => getAuthToken(),
      onStatus: ({ status }) => setStatus(status === "connected" ? "connected" : "connecting"),
      onDisconnect: () => setStatus("disconnected"),
      onAuthenticationFailed: () => setStatus("denied"),
      // The socket sends `{ type: "identity", user, permission }` derived from the verified JWT.
      onStateless: ({ payload }) => {
        const msg = JSON.parse(payload) as {
          type?: string;
          user?: AwarenessUser;
          permission?: Permission;
        };
        if (msg.type === "identity" && msg.user) setIdentity(msg.user);
        if (msg.permission) setPermission(msg.permission);
      },
    });
    setProvider(p);
    return () => p.destroy();
  }, [noteId]);

  if (!provider) return null;
  // `key` ties the bound editor's lifecycle to the provider/note so it remounts on note change.
  return (
    <BoundEditor
      key={noteId}
      provider={provider}
      status={status}
      identity={identity}
      permission={permission}
    />
  );
}

function BoundEditor({
  provider,
  status,
  identity,
  permission,
}: {
  provider: HocuspocusProvider;
  status: ConnStatus;
  identity: AwarenessUser | null;
  permission: Permission;
}) {
  const editor = useEditor({
    extensions: [...buildExtensions(provider.document), CollaborationCaret.configure({ provider })],
    // Next renders this on the server first; defer initial render to avoid hydration mismatch.
    immediatelyRender: false,
    // Start non-editable; the server-pushed permission flips this on for editors. Read-only is
    // enforced server-side regardless — this is UX (ADR-003).
    editable: false,
    editorProps: { attributes: { style: editorAttrStyle } },
  });

  // Apply the server-stamped identity to this client's awareness once both are ready.
  useEffect(() => {
    if (editor && identity) editor.commands.updateUser(identity);
  }, [editor, identity]);

  // Toggle editability from the server-derived permission (`edit` → editable).
  useEffect(() => {
    editor?.setEditable(permission === "edit");
  }, [editor, permission]);

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

/** Live presence list: distinct users from awareness states, each with their stable color. */
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
  };
  const color: Record<ConnStatus, string> = {
    connecting: "#b58900",
    connected: "#2aa198",
    disconnected: "#b58900",
    denied: "#d33",
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
const editorAttrStyle =
  "min-height: 320px; outline: none; border: 1px solid #e2e2e2; border-radius: 8px; padding: 16px;";
