"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn } from "../../lib/auth-client";

type Provider = "google" | "github";

function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">{children}</Card>
    </main>
  );
}

// `useSearchParams` must sit under a Suspense boundary in the App Router (Next 15 build rule).
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <LoginShell>
          <CardContent className="py-10 text-center text-muted-foreground">Loading…</CardContent>
        </LoginShell>
      }
    >
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
    <LoginShell>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Sign in to Yapper</CardTitle>
        <CardDescription>Login is required. Continue with a provider below.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button type="button" onClick={() => login("google")} disabled={pending !== null}>
          {pending === "google" ? "Redirecting…" : "Continue with Google"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => login("github")}
          disabled={pending !== null}
        >
          {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
        </Button>
      </CardContent>
    </LoginShell>
  );
}
