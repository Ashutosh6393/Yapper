import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { apiFetch } from "../http";

/**
 * The single-writer content-sync controller (spec 20, ADR-0008). Owns **one** `Y.Doc` per note with
 * `y-indexeddb` **always attached** (instant, offline-durable local content) and, at any instant,
 * **exactly one** persistence writer chosen by the note's access level:
 *
 * - **private** → a debounced `PUT /api/notes/:id/content` REST flush; **no** realtime provider.
 * - **shared** (`view`/`edit`) → a Hocuspocus provider; **no** REST flush.
 *
 * `setAccess` sequences every handoff teardown → setup, so the two writers never overlap (goal #8/#10/
 * #11). The provider factory + flush are injected (Editor supplies the configured HocuspocusProvider;
 * tests supply mocks), keeping this module framework-light and unit-testable. Everything here is only
 * ever constructed on the flag-on path.
 */

export type ContentAccess = "private" | "view" | "edit";

/** The realtime writer for a shared note — the controller only needs to be able to tear it down. */
export interface ContentProvider {
  destroy(): void;
}

/** Local durability handle — the controller awaits `whenSynced` and tears it down on destroy. */
export interface ContentPersistence {
  whenSynced: Promise<unknown>;
  destroy(): void;
}

export interface ContentSyncOptions {
  noteId: string;
  /** Build the shared-note realtime writer bound to the controller's doc (Editor: HocuspocusProvider). */
  createProvider: (ydoc: Y.Doc) => ContentProvider;
  /** Persist a private note's full CRDT state. Default: `PUT /content`. Injected in tests. */
  flush?: (noteId: string, state: Uint8Array) => Promise<void>;
  /** Optimistic local title/preview effect (spec 19) run on each flush; server value stays canonical. */
  onLocalDerive?: (ydoc: Y.Doc) => void;
  /** Ran after a *successful* flush so the metadata lane can pull the server-derived title/preview into
   * the dashboard (spec 23) — reliable without depending on the SSE poke reaching this tab. */
  onFlushed?: () => void;
  /** Local persistence factory. Default: `y-indexeddb`. Injected in tests to skip real IndexedDB. */
  createPersistence?: (noteId: string, ydoc: Y.Doc) => ContentPersistence;
  /** Trailing-debounce window for the private REST flush. */
  debounceMs?: number;
}

const isShared = (access: ContentAccess): boolean => access !== "private";

/** base64(bytes) without Node's Buffer (browser-safe, chunked to avoid arg-spread limits). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Default private flush: PUT the full base64 state; the server derives title/preview + bumps version. */
async function defaultFlush(noteId: string, state: Uint8Array): Promise<void> {
  await apiFetch(`/api/notes/${noteId}/content`, {
    method: "PUT",
    body: JSON.stringify({ state: toBase64(state) }),
  });
}

export class ContentSync {
  readonly ydoc: Y.Doc;
  readonly whenLocalSynced: Promise<unknown>;
  /** The active realtime writer while the note is shared; `null` while private (exposed for Editor). */
  provider: ContentProvider | null = null;

  private readonly noteId: string;
  private readonly createProvider: (ydoc: Y.Doc) => ContentProvider;
  private readonly flush: (noteId: string, state: Uint8Array) => Promise<void>;
  private readonly onLocalDerive?: (ydoc: Y.Doc) => void;
  private readonly onFlushed?: () => void;
  private readonly persistence: ContentPersistence;
  private readonly debounceMs: number;

  private access: ContentAccess | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(opts: ContentSyncOptions) {
    this.noteId = opts.noteId;
    this.createProvider = opts.createProvider;
    this.flush = opts.flush ?? defaultFlush;
    this.onLocalDerive = opts.onLocalDerive;
    this.onFlushed = opts.onFlushed;
    this.debounceMs = opts.debounceMs ?? 800;

    this.ydoc = new Y.Doc();
    this.persistence = (opts.createPersistence ?? ((id, doc) => new IndexeddbPersistence(id, doc)))(
      this.noteId,
      this.ydoc,
    );
    this.whenLocalSynced = this.persistence.whenSynced;
    this.ydoc.on("update", this.onUpdate);
  }

  /** Drive the writer from the note's current access level, sequencing teardown → setup (zero overlap). */
  setAccess(access: ContentAccess): void {
    if (this.destroyed || access === this.access) return;

    // Tear the current writer down FIRST so the two never overlap.
    this.cancelFlush();
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }

    this.access = access;

    // Then bring the new writer up. Private is edit-driven (onUpdate schedules the flush); shared opens
    // the provider that now solely owns persistence.
    if (isShared(access)) {
      this.provider = this.createProvider(this.ydoc);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    // Flush-on-close (spec 23): a private note with a *pending* debounced flush would otherwise lose
    // its last edits from the server + dashboard on a fast dialog close (the content stays durable in
    // y-indexeddb, but nothing pushes it until the note is reopened). Encode synchronously and fire the
    // flush without awaiting — the bytes are captured before teardown, so the POST completes after.
    if (this.access === "private" && this.flushTimer) {
      this.onLocalDerive?.(this.ydoc);
      const state = Y.encodeStateAsUpdate(this.ydoc);
      void this.flush(this.noteId, state)
        .then(() => this.onFlushed?.())
        .catch(() => {});
    }
    this.destroyed = true;
    this.cancelFlush();
    this.ydoc.off("update", this.onUpdate);
    this.provider?.destroy();
    this.provider = null;
    this.persistence.destroy();
    this.ydoc.destroy();
  }

  private readonly onUpdate = (): void => {
    // Only a private note REST-flushes; a shared note's provider owns persistence.
    if (this.access === "private") this.scheduleFlush();
  };

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.doFlush();
    }, this.debounceMs);
  }

  private cancelFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private async doFlush(): Promise<void> {
    if (this.access !== "private" || this.destroyed) return;
    // Instant optimistic list feedback (spec 19); the server value overwrites on the next pull (spec 16).
    this.onLocalDerive?.(this.ydoc);
    const state = Y.encodeStateAsUpdate(this.ydoc);
    try {
      await this.flush(this.noteId, state);
      // Server now holds the derived title/preview + a bumped metaVersion; pull it into the dashboard.
      this.onFlushed?.();
    } catch {
      // Transient (offline / 5xx): keep the local doc (already durable in y-indexeddb) and retry later.
      // Never throw into the editor. A subsequent edit reschedules; re-arm once so a lone failed flush
      // still retries.
      if (!this.destroyed && this.access === "private") this.scheduleFlush();
    }
  }
}
