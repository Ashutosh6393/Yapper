"use client";

import type { NoteAccess } from "@yapper/schemas";
import { Check, Copy, Eye, Lock, type LucideIcon, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useMakePrivate, useShareNote } from "../../lib/queries/notes";
import * as engineActions from "../../lib/sync/actions";
import { isSyncEngineEnabled } from "../../lib/sync/flag";

const OPTIONS: { level: NoteAccess; label: string; icon: LucideIcon; hint: string }[] = [
  { level: "private", label: "Private", icon: Lock, hint: "Only you can open this note." },
  { level: "view", label: "View", icon: Eye, hint: "Anyone with the link can read." },
  { level: "edit", label: "Edit", icon: PencilLine, hint: "Anyone with the link can edit." },
];

/**
 * Owner-only access switch, inline in the note dialog header (ADR-009 replaces the popover). The single
 * private → view → edit control expresses all three settings — enable sharing, edit access, and make
 * private — as one legible switch rather than a control panel. Selecting Private rotates the token and
 * disconnects collaborators (slice 07); selecting/reselecting a shared level surfaces the copyable link.
 * Mirrors ShareDialog's dual path: TanStack mutations with the sync engine off, optimistic actions on.
 */
export function AccessControl({
  noteId,
  access,
  shareToken,
}: {
  noteId: string;
  access: NoteAccess;
  /** The note's capability token (engine path: pulled into Dexie on owner rows only). */
  shareToken?: string | null;
}) {
  const syncOn = isSyncEngineEnabled();
  const shareNote = useShareNote(noteId);
  const makePrivate = useMakePrivate(noteId);

  // Optimistically highlight an in-flight change; the selected level otherwise follows server state.
  const [pending, setPending] = useState<NoteAccess | null>(null);
  const [restUrl, setRestUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const current = pending ?? access;

  // The engine path never learns the token synchronously — the `setShareLevel` mutator mints it
  // server-side, and it reaches us on the next pull. So derive the link from the note rather than from
  // a mutation response (which is all the REST fallback has).
  const url = syncOn
    ? shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareToken}`
      : null
    : restUrl;
  const busy = !syncOn && (shareNote.isPending || makePrivate.isPending);

  useEffect(() => {
    if (pending && pending === access) setPending(null);
  }, [pending, access]);

  async function enable(level: Exclude<NoteAccess, "private">) {
    if (syncOn) {
      // Engine path: the capability URL arrives via the CVR pull (spec 16), not synchronously here.
      engineActions.setShareLevel(noteId, level);
      return;
    }
    try {
      const info = await shareNote.mutateAsync(level);
      setRestUrl(info.url);
    } catch {
      setPending(null);
    }
  }

  async function select(level: NoteAccess) {
    if (level === current) {
      // Reselecting the active shared level refreshes the link so Copy is always available.
      if (level !== "private") await enable(level);
      return;
    }
    setPending(level);
    if (level === "private") {
      setRestUrl(null);
      if (syncOn) {
        engineActions.makePrivate(noteId);
        return;
      }
      try {
        await makePrivate.mutateAsync();
      } catch {
        setPending(null);
      }
      return;
    }
    await enable(level);
  }

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const hint = OPTIONS.find((o) => o.level === current)?.hint;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <fieldset className="inline-flex items-center gap-0.5 rounded-lg border bg-muted p-0.5">
          <legend className="sr-only">Note access</legend>
          {OPTIONS.map(({ level, label, icon: Icon }) => {
            const selected = current === level;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={selected}
                disabled={busy}
                onClick={() => select(level)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                  selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
        </fieldset>

        {url && current !== "private" ? (
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied ? (
              <Check className="size-3.5 text-primary" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>
        ) : null}
      </div>

      {hint ? <p className="self-start text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
