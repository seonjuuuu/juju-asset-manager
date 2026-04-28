ALTER TABLE `insurance` ADD COLUMN IF NOT EXISTS `insurance_type` enum('보장형','저축형');
