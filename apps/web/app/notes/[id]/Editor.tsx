"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { EditorContent, useEditor } from "@tiptap/react";
import { buildExtensions } from "@yapper/editor";
import { useEffect, useState } from "react";
import { getAuthToken } from "../../../lib/api";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "ws://localhost:1234";

type ConnStatus = "connecting" | "connected" | "disconnected" | "denied";

/**
 * Collaborative editor for a note. Opens a `HocuspocusProvider` to the `socket` app keyed by the
 * note id, authenticating the handshake with a freshly fetched Better Auth JWT (refetched on every
 * (re)connect). TipTap binds to the provider's Yjs doc, so edits sync and persist server-side.
 */
export function Editor({ noteId }: { noteId: string }) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");

  useEffect(() => {
    const p = new HocuspocusProvider({
      url: SOCKET_URL,
      name: noteId,
      // Fetched on each connect/reconnect so the short-lived token never goes stale mid-session.
      token: () => getAuthToken(),
      onStatus: ({ status }) => setStatus(status === "connected" ? "connected" : "connecting"),
      onDisconnect: () => setStatus("disconnected"),
      onAuthenticationFailed: () => setStatus("denied"),
    });
    setProvider(p);
    return () => p.destroy();
  }, [noteId]);

  if (!provider) return null;
  // `key` ties the bound editor's lifecycle to the provider/note so it remounts on note change.
  return <BoundEditor key={noteId} provider={provider} status={status} />;
}

function BoundEditor({ provider, status }: { provider: HocuspocusProvider; status: ConnStatus }) {
  const editor = useEditor({
    extensions: buildExtensions(provider.document),
    // Next renders this on the server first; defer initial render to avoid hydration mismatch.
    immediatelyRender: false,
    editorProps: { attributes: { style: editorAttrStyle } },
  });

  return (
    <div>
      <ConnectionBadge status={status} />
      <EditorContent editor={editor} />
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

const badge = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  marginBottom: 12,
} as const;
const dot = { width: 8, height: 8, borderRadius: "50%", display: "inline-block" } as const;
const editorAttrStyle =
  "min-height: 320px; outline: none; border: 1px solid #e2e2e2; border-radius: 8px; padding: 16px;";
