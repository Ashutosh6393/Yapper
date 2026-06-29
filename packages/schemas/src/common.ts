import { z } from "zod";

/**
 * A user's effective capability on a note. Mirrors the `Permission` type from
 * `@yapper/permissions`; this is the canonical wire-contract version.
 */
export const permissionSchema = z.enum(["none", "view", "edit"]);
export type Permission = z.infer<typeof permissionSchema>;

/** Note-level access mode set by the owner (stored on the note). Distinct from `permission`. */
export const noteAccessSchema = z.enum(["private", "view", "edit"]);
export type NoteAccess = z.infer<typeof noteAccessSchema>;

/** Response of the Better Auth `/api/auth/token` endpoint — the short-lived JWT for the socket. */
export const authTokenResponseSchema = z.object({ token: z.string() });
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;
