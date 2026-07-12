"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import { buildExtensions } from "@yapper/editor";
import { type AwarenessUser, socketServerMessageSchema } from "@yapper/schemas";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import type { Doc as YDoc } from "yjs";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { EditorToolbar } from "../../../components/dashboard/editor-toolbar";
import { getAuthToken } from "../../../lib/auth-token";
import { type ConnStatus, useEditorStore } from "../../../lib/stores/editor";
import { ContentSync } from "../../../lib/sync/content-sync";
import { db } from "../../../lib/sync/db";
import { isSyncEngineEnabled } from "../../../lib/sync/flag";
import { pull } from "../../../lib/sync/pull";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "ws://localhost:1234";

/** Shared props for the note editor (either persistence path). */
interface EditorProps {
  noteId: string;
  /** For a just-created owned note: assume `edit` and be typable immediately instead of waiting for
   * the socket `identity` message. The socket stays authoritative — a `view` identity or an auth
   * failure downgrades the surface to read-only. */
  assumeEditable?: boolean;
  onMadePrivate?: () => void;
}

/**
 * The note editor. Behind the sync-engine flag it uses the single-writer **content lane** (spec 20):
 * a private note persists via REST + y-indexeddb with no socket, a shared note via Hocuspocus, with a
 * clean handoff when the access level changes. Flag **off** ⇒ today's always-Hocuspocus path,
 * byte-for-byte (goal #13).
 */
export function Editor(props: EditorProps) {
  if (isSyncEngineEnabled()) return <ContentLaneEditor key={props.noteId} {...props} />;
  return <LegacyEditor {...props} />;
}

function LegacyEditor({ noteId, assumeEditable = false, onMadePrivate }: EditorProps) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const setStatus = useEditorStore((s) => s.setStatus);
  const setIdentity = useEditorStore((s) => s.setIdentity);
  const setPermission = useEditorStore((s) => s.setPermission);
  const markPrivate = useEditorStore((s) => s.markPrivate);
  const reset = useEditorStore((s) => s.reset);

  useEffect(() => {
    // Fresh collab state for this note; the store is shared across mounts.
    reset();
    // Editable-first: seed `edit` optimistically so the creator can type before the socket confirms.
    if (assumeEditable) setPermission("edit");
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
      onAuthenticationFailed: () => {
        setStatus("denied");
        // Trigger B downgrade: `none` throws in onAuthenticate and never sends an `identity`
        // message, so an optimistic edit surface must be revoked here.
        if (assumeEditable) {
          setPermission("view");
          toast.error("You don't have edit access to this note");
        }
      },
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
  }, [
    noteId,
    assumeEditable,
    onMadePrivate,
    reset,
    setStatus,
    setIdentity,
    setPermission,
    markPrivate,
  ]);

  if (!provider) return null;
  return <NoteEditorSurface key={noteId} ydoc={provider.document} provider={provider} />;
}

/**
 * The rendered editor: toolbar (edit-permission only) + status bar + TipTap content. Shared by both
 * persistence paths — `provider` is the Hocuspocus connection for a shared note, or `null` for a
 * private note that persists locally (content lane), which swaps the connection badge for a local one
 * and drops presence/caret.
 */
function NoteEditorSurface({
  ydoc,
  provider,
}: {
  ydoc: YDoc;
  provider: HocuspocusProvider | null;
}) {
  const status = useEditorStore((s) => s.status);
  const identity = useEditorStore((s) => s.identity);
  const permission = useEditorStore((s) => s.permission);

  const editor = useEditor({
    extensions: [
      ...buildExtensions(ydoc),
      ...(provider ? [CollaborationCaret.configure({ provider })] : []),
      // The note's title is its first line: show an "Untitled" placeholder there while it's empty.
      Placeholder.configure({
        includeChildren: false,
        showOnlyWhenEditable: false,
        placeholder: ({ editor: e, node }) => (e.state.doc.firstChild === node ? "Untitled" : ""),
      }),
    ],
    immediatelyRender: false,
    editable: false,
    editorProps: {
      attributes: {
        class:
          "note-prose min-h-80 rounded-lg border bg-card p-4 outline-none focus:border-primary/50",
      },
    },
  });

  useEffect(() => {
    if (editor && identity) editor.commands.updateUser(identity);
  }, [editor, identity]);

  useEffect(() => {
    editor?.setEditable(permission === "edit");
  }, [editor, permission]);

  if (status === "made_private") return <MadePrivateNotice />;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        {provider ? <ConnectionBadge status={status} /> : <LocalBadge />}
        {permission === "view" && (
          <Badge variant="outline" className="text-amber-600">
            View only
          </Badge>
        )}
        {editor && provider ? <Presence provider={provider} /> : null}
      </div>
      {permission === "edit" && editor ? <EditorToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

/** Shown to a collaborator after the owner rotates the note private and disconnects them (slice 07). */
function MadePrivateNotice() {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
      <p className="font-semibold">Note made private by owner</p>
      <p className="mt-1 text-sm text-muted-foreground">The owner has stopped sharing this note.</p>
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
    <div className="inline-flex flex-wrap items-center gap-2">
      {users.map((u) => (
        <span
          key={u.id}
          title={u.name}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[13px]"
        >
          <span className="size-2 rounded-full" style={{ background: u.color }} />
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
  const text: Record<ConnStatus, string> = {
    connecting: "text-amber-600",
    connected: "text-emerald-600",
    disconnected: "text-amber-600",
    denied: "text-red-600",
    made_private: "text-red-600",
  };
  const dot: Record<ConnStatus, string> = {
    connecting: "bg-amber-500",
    connected: "bg-emerald-500",
    disconnected: "bg-amber-500",
    denied: "bg-red-500",
    made_private: "bg-red-500",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 text-[13px] ${text[status]}`}>
      <span className={`size-2 rounded-full ${dot[status]}`} />
      {label[status]}
    </div>
  );
}

/**
 * Flag-on editor (spec 20): one `Y.Doc` per note, always durable via y-indexeddb, with exactly one
 * persistence writer chosen by the note's access level (the {@link ContentSync} controller). Private ⇒
 * REST flush (no socket); shared ⇒ Hocuspocus. Access is observed from `db.notes` (spec 15); the
 * component is keyed by `noteId`, so a note switch remounts with a fresh controller.
 */
function ContentLaneEditor({ noteId, assumeEditable = false, onMadePrivate }: EditorProps) {
  const localNote = useLiveQuery(() => db.notes.get(noteId), [noteId]);
  const access = localNote?.access;
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const setStatus = useEditorStore((s) => s.setStatus);
  const setIdentity = useEditorStore((s) => s.setIdentity);
  const setPermission = useEditorStore((s) => s.setPermission);
  const markPrivate = useEditorStore((s) => s.markPrivate);
  const reset = useEditorStore((s) => s.reset);

  // Created once per mount. Its provider factory builds the same Hocuspocus provider the legacy path
  // uses, bound to the controller's shared Y.Doc, and mirrors the provider into React state so the
  // editor can render presence/caret (and drop them when the writer hands off to REST).
  const [controller] = useState(
    () =>
      new ContentSync({
        noteId,
        // After a private-note flush the server holds the fresh title/preview; pull it so the dashboard
        // card updates without waiting on an SSE poke (which needs Redis + can miss this same tab).
        onFlushed: () => void pull(),
        createProvider: (ydoc) => {
          let madePrivate = false;
          const p = new HocuspocusProvider({
            url: SOCKET_URL,
            name: noteId,
            document: ydoc,
            token: () => getAuthToken(),
            onStatus: ({ status }) =>
              setStatus(status === "connected" ? "connected" : "connecting"),
            onDisconnect: () => {
              if (!madePrivate) setStatus("disconnected");
            },
            onAuthenticationFailed: () => setStatus("denied"),
            onStateless: ({ payload }) => {
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
          return {
            destroy: () => {
              setProvider(null);
              p.destroy();
            },
          };
        },
      }),
  );

  useEffect(() => {
    reset();
    return () => controller.destroy();
  }, [controller, reset]);

  // Drive the single writer from the note's access. A private note has no socket to grant `edit`, so
  // the owner (the only one who can see a private note) edits locally and its content is REST-flushed.
  useEffect(() => {
    if (!access) return;
    controller.setAccess(access);
    if (access === "private") {
      setStatus("connected");
      setPermission("edit");
    } else if (assumeEditable) {
      setPermission("edit");
    }
  }, [access, controller, assumeEditable, setStatus, setPermission]);

  if (!access) return null;
  // Remount the surface across a writer handoff so the CollaborationCaret extension is rebuilt.
  return (
    <NoteEditorSurface
      key={provider ? "shared" : "private"}
      ydoc={controller.ydoc}
      provider={provider}
    />
  );
}

/** Private-note status pill: no socket, but edits are durable locally (y-indexeddb) + REST-flushed. */
function LocalBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 text-[13px] text-emerald-600">
      <span className="size-2 rounded-full bg-emerald-500" />
      Saved locally
    </div>
  );
}
