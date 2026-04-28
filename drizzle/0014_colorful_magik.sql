ALTER TABLE `business_incomes` ADD `client_type` enum('회사','개인');--> statement-breakpoint
ALTER TABLE `business_incomes` ADD `depositor_name` varchar(100);--> statement-breakpoint
ALTER TABLE `business_incomes` ADD `phone_number` varchar(30);--> statement-breakpoint
ALTER TABLE `business_incomes` ADD `settlement_date` varchar(20);--> statement-breakpoint
ALTER TABLE `business_incomes` ADD `cash_receipt_done` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `business_incomes` ADD `deposit_ledger_entry_id` int;--> statement-breakpoint
ALTER TABLE `business_incomes` ADD `balance_ledger_entry_id` int;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `is_paused` boolean DEFAULT false NOT NULL;