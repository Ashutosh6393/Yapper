import type { Request, RequestHandler, Response } from "express";

/**
 * Wraps a handler so `req.userId` (guaranteed by `requireAuth`) is passed in as a non-nullable
 * `string`, and async rejections are forwarded to Express' error handler. Shared by every gated
 * router (notes, labels) so the pattern lives in one place.
 */
export function authed(
  handler: (req: Request, res: Response, userId: string) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    handler(req, res, userId).catch(next);
  };
}
