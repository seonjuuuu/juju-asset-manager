CREATE TABLE `installments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL DEFAULT 0,
	`name` varchar(200) NOT NULL,
	`card_id` int,
	`total_amount` bigint NOT NULL DEFAULT 0,
	`months` int NOT NULL DEFAULT 1,
	`start_date` varchar(20) NOT NULL,
	`end_date` varchar(20) NOT NULL,
	`is_interest_free` boolean NOT NULL DEFAULT true,
	`interest_rate` decimal(10,4) DEFAULT '0',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `installments_id` PRIMARY KEY(`id`)
);
