"use client";

import { useState } from "react";
import { signIn } from "../../lib/auth-client";

type Provider = "google" | "github";

export default function LoginPage() {
  const [pending, setPending] = useState<Provider | null>(null);

  async function login(provider: Provider) {
    setPending(provider);
    await signIn.social({
      provider,
      // Absolute web-origin URL: after OAuth, api redirects the browser back here.
      callbackURL: `${window.location.origin}/dashboard`,
    });
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 420 }}>
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
