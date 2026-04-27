CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service_name` varchar(200) NOT NULL,
	`category` enum('비즈니스','미디어','자기계발','기타') NOT NULL DEFAULT '기타',
	`billing_cycle` enum('매달','매주','매일') NOT NULL DEFAULT '매달',
	`price` bigint NOT NULL DEFAULT 0,
	`start_date` varchar(20),
	`payment_method` varchar(200),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
