CREATE TABLE IF NOT EXISTS `business_expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL DEFAULT 0,
	`expense_date` date NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`category` enum('광고','대납','세금','수수료','소모품','기타') NOT NULL DEFAULT '기타',
	`vendor` varchar(200),
	`description` varchar(300) NOT NULL,
	`amount` bigint NOT NULL DEFAULT 0,
	`payment_method` varchar(200),
	`is_tax_deductible` boolean NOT NULL DEFAULT true,
	`ledger_entry_id` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_expenses_id` PRIMARY KEY(`id`)
);
