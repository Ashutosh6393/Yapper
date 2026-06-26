"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut, useSession } from "../../lib/auth-client";

/**
 * Gated placeholder (slice 03 fills in notes). The session cookie lives on the `api` origin,
 * so the guard is client-side: `useSession` asks `api` with credentials, and logged-out
 * visitors are redirected to `/login`.
 */
export default function DashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending) return <main style={main}>Loading…</main>;
  if (!session) return null; // redirecting

  async function logout() {
    await signOut();
    router.replace("/login");
  }

  return (
    <main style={main}>
      <h1>Dashboard</h1>
      <p>Signed in as {session.user.email}.</p>
      <button type="button" onClick={logout}>
        Sign out
      </button>
    </main>
  );
}

const main = { fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 640 } as const;
