ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "installment_mode" varchar(20) NOT NULL DEFAULT 'equal';
ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "repayment_schedule" text;
