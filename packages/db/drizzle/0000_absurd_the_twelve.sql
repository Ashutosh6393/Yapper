CREATE TYPE "public"."collab_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."note_access" AS ENUM('private', 'view', 'edit');--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"preview" text DEFAULT '' NOT NULL,
	"access" "note_access" DEFAULT 'private' NOT NULL,
	"share_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "note_collaborator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "collab_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_access" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_collaborator_note_user_unq" UNIQUE("note_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "note_doc" (
	"note_id" uuid PRIMARY KEY NOT NULL,
	"state" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_collaborator" ADD CONSTRAINT "note_collaborator_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_doc" ADD CONSTRAINT "note_doc_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_owner_id_idx" ON "note" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "note_collaborator_user_status_idx" ON "note_collaborator" USING btree ("user_id","status");