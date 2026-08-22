ALTER TABLE `recoveryRecords` MODIFY COLUMN `kind` enum('fetch_retry','notification_retry','stuck_run','report_retry') NOT NULL;--> statement-breakpoint
ALTER TABLE `recoveryRecords` MODIFY COLUMN `kind` enum('fetch_retry','notification_retry','stuck_run','report_retry') NOT NULL;--> statement-breakpoint
ALTER TABLE `recoveryRecords` ADD `reportDeliveryId` int;--> statement-breakpoint
ALTER TABLE `recoveryRecords` ADD CONSTRAINT `recoveryRecords_reportDeliveryId_reportDeliveries_id_fk` FOREIGN KEY (`reportDeliveryId`) REFERENCES `reportDeliveries`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `recovery_records_report_delivery_created_idx` ON `recoveryRecords` (`reportDeliveryId`,`createdAt`);
