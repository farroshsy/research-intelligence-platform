CREATE TABLE `decisionActions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`briefId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`assignee` varchar(160),
	`dueAt` timestamp,
	`status` enum('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
	`outcome` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `decisionActions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `decisionBriefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`executiveSignal` text,
	`impactAssessment` text,
	`options` json NOT NULL,
	`status` enum('draft','under_review','approved','deferred','closed') NOT NULL DEFAULT 'draft',
	`decisionDeadline` timestamp,
	`ownerName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `decisionBriefs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`entityType` enum('organization','person','programme','skill','location','regulation','opportunity','topic') NOT NULL,
	`aliases` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `eventClusterMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clusterId` int NOT NULL,
	`changeEventId` int NOT NULL,
	`addedBy` enum('deterministic','advisory','reviewer') NOT NULL DEFAULT 'deterministic',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `eventClusterMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `cluster_members_unique_idx` UNIQUE(`clusterId`,`changeEventId`)
);
--> statement-breakpoint
CREATE TABLE `eventClusters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`missionId` int,
	`title` varchar(240) NOT NULL,
	`noveltyScore` double NOT NULL DEFAULT 0,
	`status` enum('open','reviewed','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `eventClusters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidenceClaims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`changeEventId` int,
	`missionId` int,
	`claimText` text NOT NULL,
	`stance` enum('support','contradict','context') NOT NULL DEFAULT 'support',
	`authorityScore` double NOT NULL DEFAULT 0.5,
	`freshnessScore` double NOT NULL DEFAULT 0.5,
	`corroborationScore` double NOT NULL DEFAULT 0,
	`humanAssessment` enum('unreviewed','trusted','uncertain','rejected') NOT NULL DEFAULT 'unreviewed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidenceClaims_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `missionSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`missionId` int NOT NULL,
	`sourceId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `missionSources_id` PRIMARY KEY(`id`),
	CONSTRAINT `mission_sources_unique_idx` UNIQUE(`missionId`,`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `researchMissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`template` enum('general','career','procurement_policy') NOT NULL DEFAULT 'general',
	`decisionQuestion` text NOT NULL,
	`decisionHorizon` timestamp,
	`materialityPolicy` json NOT NULL,
	`status` enum('draft','active','paused','closed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `researchMissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `decisionActions` ADD CONSTRAINT `decisionActions_briefId_decisionBriefs_id_fk` FOREIGN KEY (`briefId`) REFERENCES `decisionBriefs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `decisionBriefs` ADD CONSTRAINT `decisionBriefs_missionId_researchMissions_id_fk` FOREIGN KEY (`missionId`) REFERENCES `researchMissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entities` ADD CONSTRAINT `entities_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `eventClusterMembers` ADD CONSTRAINT `eventClusterMembers_clusterId_eventClusters_id_fk` FOREIGN KEY (`clusterId`) REFERENCES `eventClusters`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `eventClusterMembers` ADD CONSTRAINT `eventClusterMembers_changeEventId_changeEvents_id_fk` FOREIGN KEY (`changeEventId`) REFERENCES `changeEvents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `eventClusters` ADD CONSTRAINT `eventClusters_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `eventClusters` ADD CONSTRAINT `eventClusters_missionId_researchMissions_id_fk` FOREIGN KEY (`missionId`) REFERENCES `researchMissions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidenceClaims` ADD CONSTRAINT `evidenceClaims_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidenceClaims` ADD CONSTRAINT `evidenceClaims_changeEventId_changeEvents_id_fk` FOREIGN KEY (`changeEventId`) REFERENCES `changeEvents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidenceClaims` ADD CONSTRAINT `evidenceClaims_missionId_researchMissions_id_fk` FOREIGN KEY (`missionId`) REFERENCES `researchMissions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `missionSources` ADD CONSTRAINT `missionSources_missionId_researchMissions_id_fk` FOREIGN KEY (`missionId`) REFERENCES `researchMissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `missionSources` ADD CONSTRAINT `missionSources_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `researchMissions` ADD CONSTRAINT `researchMissions_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `decision_actions_brief_status_idx` ON `decisionActions` (`briefId`,`status`);--> statement-breakpoint
CREATE INDEX `decision_briefs_mission_status_idx` ON `decisionBriefs` (`missionId`,`status`);--> statement-breakpoint
CREATE INDEX `entities_owner_type_idx` ON `entities` (`ownerId`,`entityType`);--> statement-breakpoint
CREATE INDEX `event_clusters_owner_status_idx` ON `eventClusters` (`ownerId`,`status`);--> statement-breakpoint
CREATE INDEX `evidence_claims_mission_created_idx` ON `evidenceClaims` (`missionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `research_missions_owner_status_idx` ON `researchMissions` (`ownerId`,`status`);