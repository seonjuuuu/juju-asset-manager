CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bank_name` varchar(100) NOT NULL,
	`account_type` enum('입출금','저축','CMA','파킹통장','청약','기타') NOT NULL DEFAULT '입출금',
	`account_number` varchar(100),
	`account_holder` varchar(100),
	`balance` bigint NOT NULL DEFAULT 0,
	`interest_rate` varchar(20),
	`linked_card` varchar(200),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
