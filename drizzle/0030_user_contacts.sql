CREATE TABLE IF NOT EXISTS "user_contacts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL DEFAULT 0,
  "contact_user_id" integer NOT NULL,
  "nickname" varchar(100) NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_contacts_user_contact_idx"
ON "user_contacts" ("user_id", "contact_user_id");
