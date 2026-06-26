import { createAuthClient } from "better-auth/react";

/**
 * Better Auth React client. `baseURL` is the `api` origin (auth lives at `/api/auth/*` there).
 * The client sends credentials, so the session cookie set by `api` rides along cross-origin.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
});

export const { signIn, signOut, useSession } = authClient;
