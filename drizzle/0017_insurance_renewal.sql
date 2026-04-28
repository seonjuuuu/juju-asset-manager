ALTER TABLE `insurance` ADD `renewal_type` enum('비갱신형','갱신형') NOT NULL DEFAULT '비갱신형';
--> statement-breakpoint
ALTER TABLE `insurance` ADD `renewal_cycle_years` int;
