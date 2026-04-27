ALTER TABLE `subscriptions` MODIFY COLUMN `billing_cycle` enum('매달','매주','매일','매년') NOT NULL DEFAULT '매달';--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `billing_day` int;