ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "lender_user_id" integer;
ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "borrower_user_id" integer;
ALTER TABLE "borrowed_money" ADD COLUMN IF NOT EXISTS "share_status" varchar(30) NOT NULL DEFAULT 'private';
