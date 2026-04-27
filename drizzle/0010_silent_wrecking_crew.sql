CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL DEFAULT 0,
	`name` varchar(100) NOT NULL,
	`type` enum('expense','income','both') NOT NULL DEFAULT 'expense',
	`sort_order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sub_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL DEFAULT 0,
	`category_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sub_categories_id` PRIMARY KEY(`id`)
);
