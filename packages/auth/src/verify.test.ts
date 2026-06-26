import { expect, test } from "bun:test";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JSONWebKeySet,
  type KeyLike,
  SignJWT,
} from "jose";
import { type VerifyOptions, verifyJwt } from "./verify";

const ISSUER = "http://localhost:4000";
const KID = "test-key";
// Better Auth's jwt plugin signs with EdDSA/Ed25519 by default; match that here.
const ALG = "EdDSA";

/** Build a local JWKS + signer from a throwaway Ed25519 keypair — no network, no running api. */
async function makeKeys() {
  const { publicKey, privateKey } = await generateKeyPair(ALG);
  const jwk = await exportJWK(publicKey);
  const keySet: JSONWebKeySet = { keys: [{ ...jwk, kid: KID, alg: ALG, use: "sig" }] };
  const jwks = createLocalJWKSet(keySet);
  return { privateKey, jwks };
}

async function sign(
  privateKey: KeyLike,
  claims: { sub?: string; issuer?: string; audience?: string; expSecondsFromNow?: number },
) {
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: ALG, kid: KID })
    .setIssuer(claims.issuer ?? ISSUER)
    .setAudience(claims.audience ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${claims.expSecondsFromNow ?? 300}s`);
  if (claims.sub) jwt.setSubject(claims.sub);
  return jwt.sign(privateKey);
}

const opts = (jwks: VerifyOptions["jwks"]): VerifyOptions => ({ jwks, issuer: ISSUER });

test("verifyJwt returns the userId from a valid token's subject", async () => {
  const { privateKey, jwks } = await makeKeys();
  const token = await sign(privateKey, { sub: "11111111-1111-1111-1111-111111111111" });

  const result = await verifyJwt(token, opts(jwks));

  expect(result.userId).toBe("11111111-1111-1111-1111-111111111111");
});

test("verifyJwt rejects a token with a tampered payload", async () => {
  const { privateKey, jwks } = await makeKeys();
  const token = await sign(privateKey, { sub: "abc" });
  // Flip a character in the payload segment → signature no longer matches.
  const [header, payload, signature] = token.split(".");
  const tampered = `${header}.${payload?.slice(0, -2)}XY.${signature}`;

  await expect(verifyJwt(tampered, opts(jwks))).rejects.toThrow();
});

test("verifyJwt rejects an expired token", async () => {
  const { privateKey, jwks } = await makeKeys();
  const token = await sign(privateKey, { sub: "abc", expSecondsFromNow: -60 });

  await expect(verifyJwt(token, opts(jwks))).rejects.toThrow();
});

test("verifyJwt rejects a token from the wrong issuer", async () => {
  const { privateKey, jwks } = await makeKeys();
  const token = await sign(privateKey, { sub: "abc", issuer: "http://evil.example" });

  await expect(verifyJwt(token, opts(jwks))).rejects.toThrow();
});

test("verifyJwt rejects a token signed by an unknown key", async () => {
  const { privateKey } = await makeKeys();
  const { jwks: otherJwks } = await makeKeys(); // different keypair than the signer
  const token = await sign(privateKey, { sub: "abc" });

  await expect(verifyJwt(token, opts(otherJwks))).rejects.toThrow();
});
