CREATE TABLE `recoveryRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int,
	`fetchRunId` int,
	`notificationId` int,
	`kind` enum('fetch_retry','notification_retry','stuck_run') NOT NULL,
	`status` enum('pending','succeeded','abandoned') NOT NULL DEFAULT 'pending',
	`retryCount` int NOT NULL DEFAULT 0,
	`nextAttemptAt` timestamp NOT NULL,
	`lastError` text,
	`details` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `recoveryRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `changeEvents` DROP INDEX `change_events_version_pair_idx`;--> statement-breakpoint
ALTER TABLE `sources` ADD `rateLimitSeconds` int DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `changeEvents` ADD CONSTRAINT `change_events_observation_idx` UNIQUE(`observationId`);--> statement-breakpoint
ALTER TABLE `recoveryRecords` ADD CONSTRAINT `recoveryRecords_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recoveryRecords` ADD CONSTRAINT `recoveryRecords_fetchRunId_fetchRuns_id_fk` FOREIGN KEY (`fetchRunId`) REFERENCES `fetchRuns`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recoveryRecords` ADD CONSTRAINT `recoveryRecords_notificationId_notifications_id_fk` FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `recovery_records_status_next_idx` ON `recoveryRecords` (`status`,`nextAttemptAt`);--> statement-breakpoint
CREATE INDEX `recovery_records_source_created_idx` ON `recoveryRecords` (`sourceId`,`createdAt`);