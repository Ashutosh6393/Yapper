CREATE TABLE "sync_cvr" (
	"client_group_id" uuid NOT NULL,
	"cookie" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_cvr_client_group_id_cookie_pk" PRIMARY KEY("client_group_id","cookie")
);
--> statement-breakpoint
CREATE INDEX "sync_cvr_client_group_idx" ON "sync_cvr" USING btree ("client_group_id");