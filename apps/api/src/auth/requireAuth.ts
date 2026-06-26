import { auth } from "@yapper/auth";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, RequestHandler } from "express";

/** Resolves the authenticated user id from a request, or `null` if there is no valid session. */
export type SessionResolver = (req: Request) => Promise<string | null>;

/**
 * Default resolver: validates the Better Auth session cookie and returns the user id.
 * Tests inject a fake resolver so notes routes can be exercised without a real OAuth session.
 */
export const resolveBetterAuthSession: SessionResolver = async (req) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return session?.user.id ?? null;
};

/**
 * Express middleware that resolves the session onto `req.userId`, or responds 401 if none.
 * Reused on every notes route (see slice 03 design).
 */
export function requireAuth(resolve: SessionResolver = resolveBetterAuthSession): RequestHandler {
  return async (req, res, next) => {
    try {
      const userId = await resolve(req);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.userId = userId;
      next();
    } catch (err) {
      next(err);
    }
  };
}
