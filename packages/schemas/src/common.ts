import { z } from "zod";

/**
 * A user's effective capability on a note. Mirrors the `Permission` type from
 * `@yapper/permissions`; this is the canonical wire-contract version.
 */
export const permissionSchema = z.enum(["none", "view", "edit"]);
export type Permission = z.infer<typeof permissionSchema>;
