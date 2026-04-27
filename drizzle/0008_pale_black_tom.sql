ALTER TABLE `accounts` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `blog_campaigns` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `card_points` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `debts` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fixed_expenses` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `other_assets` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `pension_assets` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `real_estates` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `savings_assets` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `side_income_categories` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `side_incomes` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stock_portfolio` ADD `user_id` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `user_id` int DEFAULT 0 NOT NULL;