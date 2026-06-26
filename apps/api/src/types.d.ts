import "express";

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user id, set by {@link requireAuth} after resolving the session.
       * Undefined on unauthenticated requests (those never reach a gated handler).
       */
      userId?: string;
    }
  }
}
