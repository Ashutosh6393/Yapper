import { ApiError } from "./http";
import { isSyncEngineEnabled } from "./sync/flag";

/**
 * The one place an unexpected error leaves the app (spec 25a, ADR-001). Deliberately **not** a logging
 * system: no levels, no transports, no buffer. Its whole value is that every error funnels through one
 * function, so wiring up Sentry later is a single line *inside* it and every call site is covered
 * retroactively. The funnel is the deliverable; the abstraction would be scaffolding for a pipe we are
 * not building.
 *
 * Reached from three seams: the Query cache callbacks (all API reads/writes), `unhandledrejection`
 * (stray async), and error boundaries (render crashes).
 */

/** Handled by a feature, not a defect: `401` → the re-auth banner (25b), `403`/`404` → the missing-note
 * state (25d). Reporting these would be reporting our own features working. */
const EXPECTED_STATUSES = new Set([401, 403, 404]);

/** Chrome / Firefox / Safari wordings for "the request never reached a server". */
const FETCH_FAILURE = /failed to fetch|networkerror|load failed/i;

/**
 * The filter, and the highest-value code in this spec (ADR-005). An offline-first client throws
 * constantly for reasons that are not bugs — ten minutes on a train is a refetch storm — and an
 * unfiltered funnel buries the one real error under ten thousand network blips. Error tracking dies from
 * drowning in expected errors, not from missing them.
 *
 * Default is **report**: anything unrecognized (a `ZodError` from a broken API contract, a render crash,
 * a `5xx`) gets through without needing a case of its own.
 */
function isExpected(err: unknown): boolean {
  // Offline: every in-flight request fails, and the sync engine already owns the recovery.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;

  if (err instanceof ApiError) return EXPECTED_STATUSES.has(err.status);

  // An aborted request is a `DOMException`, which is **not** an `instanceof Error` — hence the duck-type
  // on `name` rather than a class check.
  if (typeof err === "object" && err !== null && "name" in err && err.name === "AbortError") {
    return true;
  }

  // A `fetch` transport failure surfaces as a TypeError — but so does a genuine `undefined` deref, and
  // silencing *those* would swallow exactly the bugs this exists to catch. So match the message, not the
  // type.
  // ponytail: message-matching is browser-wording-dependent; if a wording drifts we over-report a network
  // blip, which is the safe direction to fail.
  if (err instanceof TypeError) return FETCH_FAILURE.test(err.message);

  return false;
}

/**
 * `context` should carry whatever makes the bug reproducible — `noteId` above all. A stack trace from the
 * editor with no note id and no idea whether the user was offline is nearly worthless; with them it is
 * usually reproducible without having to ask.
 */
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  if (isExpected(err)) return;

  const ctx = {
    ...context,
    online: typeof navigator === "undefined" ? null : navigator.onLine,
    syncEngine: isSyncEngineEnabled(),
  };

  // Sentry.captureException(err, { extra: ctx }) goes here — that is the entire upgrade (ADR-002).
  console.error("[yapper]", err, ctx);
}
