/**
 * Transient-retry backoff for the pusher (spec 21, ADR-0009). A transient push failure keeps the whole
 * queue and re-pushes it later with exponential backoff + jitter; the delay is capped and the attempt
 * counter **self-resets** on recovery (success / reconnect / focus), so a returning network retries
 * immediately rather than waiting out the cap. There is deliberately no max-attempts — a transient
 * failure is the user's data and must eventually land; only a *permanent* verdict drops a mutation.
 */

const BASE_MS = 1000;
const CAP_MS = 30_000;

/** `min(cap, 1s · 2^attempt)` with ±20% jitter (de-syncs many tabs/clients). `attempt` is 0-based. */
export function nextBackoffDelay(attempt: number): number {
  const raw = Math.min(CAP_MS, BASE_MS * 2 ** attempt);
  const jitter = raw * (0.8 + Math.random() * 0.4);
  return Math.round(jitter);
}

let attempt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingRun: (() => void) | null = null;
let listenersBound = false;

/** Reset the backoff counter to base — call on any successful push. */
export function resetBackoff(): void {
  attempt = 0;
}

/** Cancel any pending retry timer + stored run (idempotent; used by tests and on teardown). */
export function cancelScheduledRetry(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  pendingRun = null;
}

/** Run the pending retry now (clearing its timer). No-op when nothing is pending. */
function fireNow(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const run = pendingRun;
  pendingRun = null;
  run?.();
}

/** Reconnect / focus: recovery is immediate — reset the counter and fire any pending retry now. */
function onRecover(): void {
  attempt = 0;
  if (pendingRun !== null) fireNow();
}

function bindRecoveryListeners(): void {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("online", onRecover);
  window.addEventListener("focus", onRecover);
}

/**
 * Schedule a transient retry of `run` after the current backoff delay. Single pending retry: a new call
 * replaces the stored run and never arms a second timer. While offline, don't burn a timer — wait for
 * the `online` event, which fires the retry immediately (via {@link onRecover}).
 */
export function scheduleRetry(run: () => void): void {
  bindRecoveryListeners();
  pendingRun = run;
  if (timer !== null) return; // already armed

  if (typeof navigator !== "undefined" && navigator.onLine === false) return; // wait for `online`

  const delay = nextBackoffDelay(attempt);
  attempt += 1;
  timer = setTimeout(fireNow, delay);
}
