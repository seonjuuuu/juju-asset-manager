CREATE TABLE IF NOT EXISTS "wedding_budget_settings" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL DEFAULT 0,
  "wedding_date" varchar(20),
  "venue_name" varchar(200),
  "total_budget" bigint NOT NULL DEFAULT 0,
  "note" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "wedding_budget_settings_user_id_idx"
ON "wedding_budget_settings" ("user_id");

CREATE TABLE IF NOT EXISTS "wedding_budget_items" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL DEFAULT 0,
  "category" varchar(100) NOT NULL,
  "item_name" varchar(200) NOT NULL,
  "vendor_name" varchar(200),
  "estimated_amount" bigint NOT NULL DEFAULT 0,
  "contract_amount" bigint NOT NULL DEFAULT 0,
  "paid_amount" bigint NOT NULL DEFAULT 0,
  "due_date" varchar(20),
  "payment_method" varchar(200),
  "status" varchar(50) NOT NULL DEFAULT '견적',
  "note" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
