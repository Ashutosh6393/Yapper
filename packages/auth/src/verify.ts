import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";

export interface VerifyOptions {
  /** Key resolver. Defaults to the api JWKS endpoint (cached). Injectable for tests. */
  jwks?: JWTVerifyGetKey;
  /** Expected `iss`/`aud`. Defaults to the Better Auth base URL. */
  issuer?: string;
  audience?: string;
}

export interface VerifiedToken {
  userId: string;
  /** Display name from the token's `name` claim; falls back to "Anonymous" if absent. */
  name: string;
}

/** Better Auth base URL = JWT issuer/audience and the host of the JWKS endpoint. */
const issuer = process.env.AUTH_ISSUER ?? process.env.BETTER_AUTH_URL ?? "http://localhost:4000";
const jwksUrl = process.env.AUTH_JWKS_URL ?? `${issuer}/api/auth/jwks`;

let remoteJwks: JWTVerifyGetKey | undefined;
/** Lazily create (and cache) the remote JWKS so keys are fetched once and reused. */
function defaultJwks(): JWTVerifyGetKey {
  remoteJwks ??= createRemoteJWKSet(new URL(jwksUrl));
  return remoteJwks;
}

/**
 * Verify a Better Auth RS256 JWT against the JWKS and return the authenticated `userId`
 * (the token's `sub`). Throws if the signature, issuer, audience, or expiry is invalid.
 * The socket leg uses this to authenticate the WS handshake statelessly.
 */
export async function verifyJwt(
  token: string,
  options: VerifyOptions = {},
): Promise<VerifiedToken> {
  const expectedIssuer = options.issuer ?? issuer;
  const { payload } = await jwtVerify(token, options.jwks ?? defaultJwks(), {
    issuer: expectedIssuer,
    audience: options.audience ?? expectedIssuer,
  });
  if (!payload.sub) {
    throw new Error("JWT is missing a subject (sub) claim");
  }
  const name = typeof payload.name === "string" ? payload.name : "Anonymous";
  return { userId: payload.sub, name };
}
