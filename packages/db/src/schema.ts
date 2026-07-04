import {
  boolean,
  customType,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * ── Better Auth tables (slice 02) ──────────────────────────────────────────
 * Generated to match Better Auth's pg-uuid schema. `id` columns are `uuid` with a
 * DB default (`gen_random_uuid()`); Better Auth is configured with
 * `advanced.database.generateId: false` so Postgres assigns ids. This keeps `user.id`
 * type-compatible with `note.owner_id` / `note_collaborator.user_id` so FKs can be added.
 * Field (JS) names must stay camelCase — Better Auth's Drizzle adapter maps models by them.
 */

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/** Asymmetric signing keys for the JWT plugin; the JWKS endpoint serves the public half. */
export const jwks = pgTable("jwks", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
});

/**
 * Postgres `bytea` column. Drizzle has no native bytea helper, so we map it to a
 * `Buffer` on both the JS and driver side. Holds the Yjs CRDT update produced by
 * `Y.encodeStateAsUpdate(doc)` (a `Uint8Array`, which is `Buffer`-compatible).
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** Note-level sharing mode. Effective per-user permission is derived (slice 06), not stored here. */
export const noteAccess = pgEnum("note_access", ["private", "view", "edit"]);

/** Collaborator membership lifecycle. `revoked` keeps the row for audit/rejoin without deleting it. */
export const collabStatus = pgEnum("collab_status", ["active", "revoked"]);

/**
 * Note metadata, owned/written by `api`. Never holds the CRDT blob (see {@link noteDoc}).
 * `owner_id` references `user.id`; the FK constraint is added in slice 02 once Better Auth
 * creates the `user` table.
 */
export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled"),
    preview: text("preview").notNull().default(""),
    access: noteAccess("access").notNull().default("private"),
    // null while private; rotated to a fresh token on revoke (slice 07).
    shareToken: text("share_token").unique(),
    // Lifecycle timestamps (slice 12). State derived: trashedAt set → trash;
    // else archivedAt set → archive; else active. Restore clears both.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("note_owner_id_idx").on(table.ownerId),
    // keeps default (active) list + purge scan cheap
    index("note_trashed_at_idx").on(table.trashedAt),
  ],
);

/**
 * User-created label (slice 12). Owner-scoped, unique name per owner, fixed-palette color
 * stored as a plain `text` palette key (validated by Zod at the API boundary, not a DB enum,
 * so the palette can change without a migration). Attaches only to the owner's own notes.
 */
export const label = pgTable(
  "label",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("label_owner_name_unq").on(t.ownerId, t.name),
    index("label_owner_id_idx").on(t.ownerId),
  ],
);

/** Junction between {@link note} and {@link label}; both FKs cascade. */
export const noteLabel = pgTable(
  "note_label",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => note.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => label.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.labelId] }),
    index("note_label_label_id_idx").on(t.labelId), // filter/count by label
  ],
);

/**
 * CRDT blob, written hot by `socket` on every debounced save. Split from {@link note} so
 * dashboard/list queries never drag the (potentially large) binary state. 1:1 with a note.
 */
export const noteDoc = pgTable("note_doc", {
  noteId: uuid("note_id")
    .primaryKey()
    .references(() => note.id, { onDelete: "cascade" }),
  state: bytea("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Membership of a non-owner user on a note. No role column by design — effective permission
 * is computed from `note.access` + ownership + active membership (ADR-002). `user_id`
 * references `user.id`; the FK constraint is added in slice 02.
 */
export const noteCollaborator = pgTable(
  "note_collaborator",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => note.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: collabStatus("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastAccess: timestamp("last_access", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("note_collaborator_note_user_unq").on(table.noteId, table.userId),
    index("note_collaborator_user_status_idx").on(table.userId, table.status),
  ],
);

export type Note = typeof note.$inferSelect;
export type NewNote = typeof note.$inferInsert;
export type NoteDoc = typeof noteDoc.$inferSelect;
export type NewNoteDoc = typeof noteDoc.$inferInsert;
export type NoteCollaborator = typeof noteCollaborator.$inferSelect;
export type NewNoteCollaborator = typeof noteCollaborator.$inferInsert;
export type Label = typeof label.$inferSelect;
export type NewLabel = typeof label.$inferInsert;
export type NoteLabel = typeof noteLabel.$inferSelect;
export type NewNoteLabel = typeof noteLabel.$inferInsert;
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
