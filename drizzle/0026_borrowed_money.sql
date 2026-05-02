CREATE TABLE IF NOT EXISTS "borrowed_money" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL DEFAULT 0,
  "lender_name" varchar(200) NOT NULL,
  "principal_amount" bigint NOT NULL DEFAULT 0,
  "repaid_amount" bigint NOT NULL DEFAULT 0,
  "borrowed_date" varchar(20),
  "repayment_type" varchar(30) NOT NULL DEFAULT '자유상환',
  "repayment_start_date" varchar(20),
  "repayment_due_date" varchar(20),
  "payment_day" integer,
  "monthly_payment" bigint NOT NULL DEFAULT 0,
  "total_installments" integer,
  "note" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
