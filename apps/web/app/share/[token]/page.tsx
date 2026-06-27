"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, shareApi } from "../../../lib/api";
import { useSession } from "../../../lib/auth-client";

/**
 * Capability-link landing page (slice 06). Opening `/share/:token`:
 * - logged out → bounce to `/login?returnTo=/share/:token`, then resume here after OAuth;
 * - logged in → POST join (materializes an active collaborator) → redirect into `/notes/:id`.
 * A 404 from join means the link is invalid or the note was made private.
 */
export default function SharePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const token = useParams<{ token: string }>().token;

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

    shareApi
      .join(token)
      .then(({ noteId }) => router.replace(`/notes/${noteId}`))
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? "This share link is invalid or no longer active."
            : "Something went wrong opening this link.",
        );
      });
  }, [isPending, session, token, router]);

  return (
    <main style={main}>
      {error ? (
        <>
          <p>{error}</p>
          <button type="button" onClick={() => router.replace("/dashboard")} style={ghostBtn}>
            Go to dashboard
          </button>
        </>
      ) : (
        <p style={{ color: "#555" }}>Opening shared note…</p>
      )}
    </main>
  );
}

const main = { fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 420 } as const;
const ghostBtn = {
  padding: "6px 12px",
  borderRadius: 6,
  cursor: "pointer",
  marginTop: 12,
} as const;
