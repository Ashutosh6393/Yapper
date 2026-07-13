/**
 * Awareness identity helpers. Identity (`id`, `name`, `color`) is **server-authoritative**: it is
 * derived here from the verified-JWT connection context and pushed to the client, never read from
 * client-supplied awareness fields (anti-spoof — ADR-002). `color` is a deterministic hash of the
 * `userId` (ADR-003) so the same person is the same color across sessions and notes.
 */

/** The awareness `user` payload rendered as a remote caret/selection label and in the presence list. */
export interface AwarenessUser {
  id: string;
  name: string;
  color: string;
}

/** Identity stamped onto the connection in `onAuthenticate`, sourced only from the verified JWT. */
export interface Identity {
  userId: string;
  name: string;
}

/**
 * FNV-1a hash → stable hue, at a fixed OKLCH lightness/chroma. OKLCH is perceptually uniform, so every
 * user lands at the same apparent lightness whatever the hue: the caret's white-on-color name flag
 * holds ≥4.5:1 contrast for all of them (HSL does not — `hsl(60, 70%, 45%)` is a bright yellow that
 * white text disappears on), and the caret stays legible on both the light and dark editor surface.
 */
export function colorFromUserId(userId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(0.52 0.15 ${hue})`;
}

/** Build the awareness `user` from server-verified identity only — client fields are ignored. */
export function awarenessUserFor({ userId, name }: Identity): AwarenessUser {
  return { id: userId, name, color: colorFromUserId(userId) };
}
