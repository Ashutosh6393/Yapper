CREATE TABLE "sync_client" (
	"client_group_id" text PRIMARY KEY NOT NULL,
	"last_mutation_id" bigint DEFAULT 0 NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "meta_version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_client" ADD CONSTRAINT "sync_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;