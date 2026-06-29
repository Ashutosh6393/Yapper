import { authTokenResponseSchema } from "@yapper/schemas";
import { apiFetch } from "./http";

/**
 * Fetch a fresh Better Auth JWT (jwt plugin's `/token`, gated by the session cookie) for the socket
 * handshake. Called per (re)connect so the short-lived token never outlives a reconnect. Lives apart
 * from the query hooks because the Hocuspocus provider — not React Query — drives socket auth.
 */
export async function getAuthToken(): Promise<string> {
  return authTokenResponseSchema.parse(await apiFetch("/api/auth/token")).token;
}
