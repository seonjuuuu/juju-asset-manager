CREATE TABLE IF NOT EXISTS "borrowed_money_payments" (
  "id" serial PRIMARY KEY,
  "borrowed_money_id" integer NOT NULL,
  "user_id" integer NOT NULL DEFAULT 0,
  "payment_date" varchar(20) NOT NULL,
  "amount" bigint NOT NULL DEFAULT 0,
  "installment_no" integer,
  "note" text,
  "ledger_entry_id" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
