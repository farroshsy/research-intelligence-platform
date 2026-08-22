CREATE TABLE `alertMatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertRuleId` int NOT NULL,
	`changeEventId` int NOT NULL,
	`status` enum('matched','dismissed','acknowledged') NOT NULL DEFAULT 'matched',
	`matchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alertMatches_id` PRIMARY KEY(`id`),
	CONSTRAINT `alert_matches_rule_event_idx` UNIQUE(`alertRuleId`,`changeEventId`)
);
--> statement-breakpoint
CREATE TABLE `alertRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`sourceId` int,
	`collectionId` int,
	`tag` varchar(80),
	`keywords` json NOT NULL,
	`minSignificance` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`cooldownMinutes` int NOT NULL DEFAULT 60,
	`ownerAlertEligible` boolean NOT NULL DEFAULT false,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alertRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `anomalyFindings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`sourceId` int NOT NULL,
	`kind` enum('change_spike','failure_spike') NOT NULL,
	`status` enum('open','acknowledged','dismissed') NOT NULL DEFAULT 'open',
	`observedValue` double NOT NULL,
	`baselineValue` double NOT NULL,
	`thresholdValue` double NOT NULL,
	`explanation` text NOT NULL,
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`triagedAt` timestamp,
	CONSTRAINT `anomalyFindings_id` PRIMARY KEY(`id`),
	CONSTRAINT `anomaly_findings_source_kind_day_idx` UNIQUE(`sourceId`,`kind`,`detectedAt`)
);
--> statement-breakpoint
CREATE TABLE `changeAnnotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeEventId` int NOT NULL,
	`authorId` int NOT NULL,
	`body` text NOT NULL,
	`category` enum('note','decision','follow_up') NOT NULL DEFAULT 'note',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `changeAnnotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sourceCollectionMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionId` int NOT NULL,
	`sourceId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sourceCollectionMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `source_collection_members_unique_idx` UNIQUE(`collectionId`,`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `sourceCollections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`color` varchar(20) NOT NULL DEFAULT 'teal',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sourceCollections_id` PRIMARY KEY(`id`),
	CONSTRAINT `source_collections_owner_name_idx` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `sourceTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`tag` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sourceTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `source_tags_unique_idx` UNIQUE(`sourceId`,`tag`)
);
--> statement-breakpoint
ALTER TABLE `sources` ADD `steward` varchar(160);--> statement-breakpoint
ALTER TABLE `alertMatches` ADD CONSTRAINT `alertMatches_alertRuleId_alertRules_id_fk` FOREIGN KEY (`alertRuleId`) REFERENCES `alertRules`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alertMatches` ADD CONSTRAINT `alertMatches_changeEventId_changeEvents_id_fk` FOREIGN KEY (`changeEventId`) REFERENCES `changeEvents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alertRules` ADD CONSTRAINT `alertRules_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alertRules` ADD CONSTRAINT `alertRules_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `alertRules` ADD CONSTRAINT `alertRules_collectionId_sourceCollections_id_fk` FOREIGN KEY (`collectionId`) REFERENCES `sourceCollections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `anomalyFindings` ADD CONSTRAINT `anomalyFindings_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `anomalyFindings` ADD CONSTRAINT `anomalyFindings_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `changeAnnotations` ADD CONSTRAINT `changeAnnotations_changeEventId_changeEvents_id_fk` FOREIGN KEY (`changeEventId`) REFERENCES `changeEvents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `changeAnnotations` ADD CONSTRAINT `changeAnnotations_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sourceCollectionMembers` ADD CONSTRAINT `sourceCollectionMembers_collectionId_sourceCollections_id_fk` FOREIGN KEY (`collectionId`) REFERENCES `sourceCollections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sourceCollectionMembers` ADD CONSTRAINT `sourceCollectionMembers_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sourceCollections` ADD CONSTRAINT `sourceCollections_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sourceTags` ADD CONSTRAINT `sourceTags_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `alert_matches_status_idx` ON `alertMatches` (`status`,`matchedAt`);--> statement-breakpoint
CREATE INDEX `alert_rules_owner_enabled_idx` ON `alertRules` (`ownerId`,`enabled`);--> statement-breakpoint
CREATE INDEX `alert_rules_source_idx` ON `alertRules` (`sourceId`);--> statement-breakpoint
CREATE INDEX `anomaly_findings_owner_status_idx` ON `anomalyFindings` (`ownerId`,`status`,`detectedAt`);--> statement-breakpoint
CREATE INDEX `change_annotations_event_created_idx` ON `changeAnnotations` (`changeEventId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `source_collection_members_source_idx` ON `sourceCollectionMembers` (`sourceId`);--> statement-breakpoint
CREATE INDEX `source_tags_tag_idx` ON `sourceTags` (`tag`);