import {
  customType,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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
    ownerId: uuid("owner_id").notNull(),
    title: text("title").notNull().default("Untitled"),
    preview: text("preview").notNull().default(""),
    access: noteAccess("access").notNull().default("private"),
    // null while private; rotated to a fresh token on revoke (slice 07).
    shareToken: text("share_token").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("note_owner_id_idx").on(table.ownerId)],
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
    userId: uuid("user_id").notNull(),
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
