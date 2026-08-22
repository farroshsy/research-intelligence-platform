CREATE TABLE `reportDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`templateId` int,
	`name` varchar(140) NOT NULL,
	`cron` varchar(100) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`enabled` boolean NOT NULL DEFAULT false,
	`recipients` json NOT NULL,
	`primaryEmailProvider` enum('resend','gmail','outlook') NOT NULL,
	`fallbackProviders` json NOT NULL,
	`slackEnabled` boolean NOT NULL DEFAULT true,
	`filters` json NOT NULL,
	`lastAttemptAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reportDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `report_deliveries_schedule_task_uid_idx` UNIQUE(`scheduleCronTaskUid`)
);
--> statement-breakpoint
CREATE TABLE `reportDeliveryAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deliveryId` int NOT NULL,
	`status` enum('pending','running','succeeded','partial','failed') NOT NULL DEFAULT 'pending',
	`providersAttempted` json NOT NULL,
	`deliveredProviders` json NOT NULL,
	`reportSummary` json NOT NULL,
	`errorSummary` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `reportDeliveryAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reportTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`description` text,
	`filters` json NOT NULL,
	`includeSuppressed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reportTemplates_id` PRIMARY KEY(`id`),
	CONSTRAINT `report_templates_owner_name_idx` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `reportDeliveries` ADD CONSTRAINT `reportDeliveries_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reportDeliveries` ADD CONSTRAINT `reportDeliveries_templateId_reportTemplates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `reportTemplates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reportDeliveryAttempts` ADD CONSTRAINT `reportDeliveryAttempts_deliveryId_reportDeliveries_id_fk` FOREIGN KEY (`deliveryId`) REFERENCES `reportDeliveries`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reportTemplates` ADD CONSTRAINT `reportTemplates_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `report_deliveries_owner_enabled_idx` ON `reportDeliveries` (`ownerId`,`enabled`);--> statement-breakpoint
CREATE INDEX `report_delivery_attempts_delivery_started_idx` ON `reportDeliveryAttempts` (`deliveryId`,`startedAt`);