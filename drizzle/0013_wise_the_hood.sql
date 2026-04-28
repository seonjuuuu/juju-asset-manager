CREATE TABLE `business_incomes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL DEFAULT 0,
	`client_name` varchar(200) NOT NULL,
	`work_amount` bigint NOT NULL DEFAULT 0,
	`deposit_percent` int NOT NULL DEFAULT 50,
	`work_start_date` varchar(20),
	`is_completed` boolean NOT NULL DEFAULT false,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_incomes_id` PRIMARY KEY(`id`)
);
