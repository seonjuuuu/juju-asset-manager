CREATE TABLE "user_memos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer DEFAULT 0 NOT NULL,
	"memo_key" varchar(100) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_memos_user_id_memo_key_idx" ON "user_memos" ("user_id","memo_key");
