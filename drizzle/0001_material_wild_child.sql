CREATE TABLE `blog_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform` varchar(100),
	`campaign_type` varchar(50),
	`category` varchar(50),
	`business_name` varchar(200),
	`amount` bigint DEFAULT 0,
	`start_date` varchar(20),
	`end_date` varchar(20),
	`visit_date` varchar(20),
	`review_done` boolean DEFAULT false,
	`completed` boolean DEFAULT false,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blog_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(100) NOT NULL,
	`description` varchar(200),
	`debt_type` varchar(50),
	`principal` bigint DEFAULT 0,
	`monthly_payment` bigint DEFAULT 0,
	`interest_rate` decimal(10,4),
	`balance` bigint DEFAULT 0,
	`expiry_date` varchar(50),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `debts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fixed_expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`main_category` varchar(100) NOT NULL,
	`sub_category` varchar(100),
	`payment_account` varchar(100),
	`monthly_amount` bigint NOT NULL DEFAULT 0,
	`total_amount` bigint DEFAULT 0,
	`interest_rate` decimal(10,4),
	`expiry_date` varchar(50),
	`payment_day` int,
	`note` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fixed_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entry_date` date NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`main_category` varchar(50) NOT NULL,
	`sub_category` varchar(100),
	`description` text,
	`amount` bigint NOT NULL DEFAULT 0,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ledger_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `other_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(100) NOT NULL,
	`monthly_deposit` bigint DEFAULT 0,
	`paid_amount` bigint DEFAULT 0,
	`total_amount` bigint DEFAULT 0,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `other_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pension_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pension_type` varchar(50) NOT NULL,
	`company` varchar(100),
	`asset_type` varchar(20),
	`stock_name` varchar(100),
	`ticker` varchar(20),
	`avg_buy_price` bigint DEFAULT 0,
	`quantity` decimal(15,4) DEFAULT '0',
	`buy_amount` bigint DEFAULT 0,
	`current_price` bigint DEFAULT 0,
	`current_amount` bigint DEFAULT 0,
	`return_rate` decimal(10,6) DEFAULT '0',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pension_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `real_estates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`district` varchar(100),
	`dong` varchar(100),
	`apt_name` varchar(100) NOT NULL,
	`built_year` varchar(20),
	`households` int,
	`area_size` decimal(10,2),
	`floor` varchar(20),
	`direction` varchar(20),
	`sale_price` bigint DEFAULT 0,
	`lease_price` bigint DEFAULT 0,
	`lease_ratio` decimal(10,6),
	`gap` bigint DEFAULT 0,
	`price_per_pyeong` decimal(15,4),
	`price_201912` bigint DEFAULT 0,
	`price_202112` bigint DEFAULT 0,
	`current_price` bigint DEFAULT 0,
	`rise_from_201912` decimal(10,6),
	`rise_from_202112` decimal(10,6),
	`note` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `real_estates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `savings_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(50) NOT NULL,
	`description` varchar(100) NOT NULL,
	`bank` varchar(100),
	`account_number` varchar(100),
	`monthly_deposit` varchar(50),
	`interest_rate` decimal(10,4),
	`total_amount` decimal(20,4) DEFAULT '0',
	`expiry_date` varchar(50),
	`note` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `savings_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_portfolio` (
	`id` int AUTO_INCREMENT NOT NULL,
	`market` varchar(20),
	`broker` varchar(50),
	`sector` varchar(50),
	`stock_name` varchar(100) NOT NULL,
	`ticker` varchar(20),
	`avg_buy_price` bigint DEFAULT 0,
	`quantity` decimal(15,4) DEFAULT '0',
	`buy_amount` bigint DEFAULT 0,
	`current_price` bigint DEFAULT 0,
	`current_amount` bigint DEFAULT 0,
	`return_rate` decimal(10,6) DEFAULT '0',
	`note` text,
	`snapshot_month` varchar(7),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_portfolio_id` PRIMARY KEY(`id`)
);
