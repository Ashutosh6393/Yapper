"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "../../../lib/auth-client";
import { ApiError } from "../../../lib/http";
import { useJoinNote } from "../../../lib/queries/share";

/**
 * Capability-link landing page (slice 06). Opening `/share/:token`:
 * - logged out → bounce to `/login?returnTo=/share/:token`, then resume here after OAuth;
 * - logged in → POST join (materializes an active collaborator) → redirect to the dashboard, which
 *   opens the note in a dialog (`/dashboard?note=:id`) rather than a standalone page.
 * A 404 from join means the link is invalid or the note was made private.
 */
export default function SharePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const token = useParams<{ token: string }>().token;

  const joinNote = useJoinNote();
  const [error, setError] = useState<string | null>(null);
  // Join is a mutation; guard against the effect firing twice (React strict mode / re-renders).
  const joined = useRef(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace(`/login?returnTo=${encodeURIComponent(`/share/${token}`)}`);
      return;
    }
    if (joined.current) return;
    joined.current = true;

    joinNote
      .mutateAsync(token)
      .then(({ noteId }) => router.replace(`/dashboard?note=${noteId}`))
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? "This share link is invalid or no longer active."
            : "Something went wrong opening this link.",
        );
      });
  }, [isPending, session, token, router, joinNote]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      {error ? (
        <>
          <div className="space-y-2">
            <h1 className="font-semibold text-2xl tracking-tight">This link doesn&apos;t work</h1>
            <p className="max-w-md text-muted-foreground text-sm">{error}</p>
          </div>
          <Button onClick={() => router.replace("/dashboard")}>Go to your notes</Button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Opening shared note…
        </p>
      )}
    </main>
  );
}
