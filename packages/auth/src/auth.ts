import { account, db, jwks, session, user, verification } from "@yapper/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";

const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:4000";

/**
 * The single source of auth config. `api` mounts `auth.handler`; `web` talks to it via the
 * Better Auth React client; `socket` (slice 04+) verifies the JWT plugin's tokens via JWKS.
 *
 * `advanced.database.generateId: false` — ids are `uuid` assigned by Postgres
 * (`gen_random_uuid()`), keeping `user.id` type-compatible with `note.owner_id` so the FKs hold.
 */
export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [webOrigin],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, jwks },
  }),
  advanced: {
    database: { generateId: false },
  },
  // Serve `getSession` from a short-lived signed cookie instead of a DB hit, so the web client's
  // session check (blocking every page load) resolves fast. maxAge bounds how long a revoked session
  // stays valid from cache before the next DB refresh.
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
  },
  plugins: [jwt()],
});

export type Auth = typeof auth;
