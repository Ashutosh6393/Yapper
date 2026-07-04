CREATE TABLE "label" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "label_owner_name_unq" UNIQUE("owner_id","name")
);
--> statement-breakpoint
CREATE TABLE "note_label" (
	"note_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "note_label_note_id_label_id_pk" PRIMARY KEY("note_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "trashed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_label" ADD CONSTRAINT "note_label_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_label" ADD CONSTRAINT "note_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "label_owner_id_idx" ON "label" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "note_label_label_id_idx" ON "note_label" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "note_trashed_at_idx" ON "note" USING btree ("trashed_at");