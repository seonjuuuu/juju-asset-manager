CREATE TABLE `side_income_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(20) DEFAULT '#5b7cfa',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `side_income_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `side_incomes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`income_date` date NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`category_id` int,
	`category_name` varchar(100),
	`amount` bigint NOT NULL DEFAULT 0,
	`description` varchar(300),
	`is_regular` boolean NOT NULL DEFAULT false,
	`note` text,
	`ledger_entry_id` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `side_incomes_id` PRIMARY KEY(`id`)
);
