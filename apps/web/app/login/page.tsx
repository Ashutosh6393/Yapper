"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { signIn } from "../../lib/auth-client";

type Provider = "google" | "github";

// `useSearchParams` must sit under a Suspense boundary in the App Router (Next 15 build rule).
export default function LoginPage() {
  return (
    <Suspense fallback={<main style={loginMain}>Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [pending, setPending] = useState<Provider | null>(null);
  const searchParams = useSearchParams();

  // Where to land after OAuth. Only same-origin relative paths are honored (open-redirect guard);
  // the share-link flow sets `?returnTo=/share/:token` so the user resumes joining after login.
  const returnTo = searchParams.get("returnTo");
  const destination = returnTo?.startsWith("/") ? returnTo : "/dashboard";

  async function login(provider: Provider) {
    setPending(provider);
    await signIn.social({
      provider,
      // Absolute web-origin URL: after OAuth, api redirects the browser back here.
      callbackURL: `${window.location.origin}${destination}`,
    });
  }

  return (
    <main style={loginMain}>
      <h1>Sign in to Yapper</h1>
      <p style={{ color: "#555" }}>Login is required. Continue with a provider below.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
        <button type="button" onClick={() => login("google")} disabled={pending !== null}>
          {pending === "google" ? "Redirecting…" : "Continue with Google"}
        </button>
        <button type="button" onClick={() => login("github")} disabled={pending !== null}>
          {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
        </button>
      </div>
    </main>
  );
}

const loginMain = { fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 420 } as const;
