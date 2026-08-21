CREATE TABLE `advisoryExplanations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeEventId` int NOT NULL,
	`model` varchar(100) NOT NULL,
	`promptVersion` varchar(40) NOT NULL,
	`summary` text,
	`whyItMayMatter` text,
	`suggestedSignificance` enum('low','medium','high'),
	`confidence` double,
	`caveats` json,
	`schemaValid` boolean NOT NULL DEFAULT false,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `advisoryExplanations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`fetchRunId` int,
	`artifactType` enum('raw','normalized','diff') NOT NULL,
	`storageKey` varchar(600),
	`storageUrl` varchar(800),
	`contentType` varchar(255) NOT NULL,
	`byteSize` int NOT NULL,
	`sha256` varchar(128) NOT NULL,
	`previewText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `changeEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`observationId` int NOT NULL,
	`previousVersionId` int,
	`currentVersionId` int NOT NULL,
	`classification` enum('baseline','no_change','cosmetic','material') NOT NULL,
	`status` enum('pending_review','confirmed','not_material','suppressed') NOT NULL DEFAULT 'pending_review',
	`changedFields` json NOT NULL,
	`structuredDiff` json NOT NULL,
	`diffArtifactId` int,
	`deterministicScore` double NOT NULL,
	`suggestedSignificance` enum('low','medium','high') NOT NULL,
	`explanationStatus` enum('not_requested','pending','ready','failed') NOT NULL DEFAULT 'not_requested',
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `changeEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `change_events_version_pair_idx` UNIQUE(`sourceId`,`previousVersionId`,`currentVersionId`)
);
--> statement-breakpoint
CREATE TABLE `contentVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`observationId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`normalizedArtifactId` int,
	`rawArtifactId` int,
	`contentHash` varchar(128) NOT NULL,
	`canonicalText` text NOT NULL,
	`structuredPayload` json,
	`isBaseline` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contentVersions_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_versions_source_hash_idx` UNIQUE(`sourceId`,`contentHash`),
	CONSTRAINT `content_versions_source_number_idx` UNIQUE(`sourceId`,`versionNumber`)
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeEventId` int NOT NULL,
	`artifactId` int NOT NULL,
	`role` enum('before_raw','after_raw','before_normalized','after_normalized','diff') NOT NULL,
	`excerpt` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fetchRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`workflowExecutionId` int,
	`idempotencyKey` varchar(255) NOT NULL,
	`status` enum('running','succeeded','failed','skipped') NOT NULL DEFAULT 'running',
	`initiatedBy` varchar(40) NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`httpStatus` int,
	`contentType` varchar(255),
	`responseHash` varchar(128),
	`latencyMs` int,
	`retryCount` int NOT NULL DEFAULT 0,
	`errorCode` varchar(100),
	`errorMessage` text,
	CONSTRAINT `fetchRuns_id` PRIMARY KEY(`id`),
	CONSTRAINT `fetch_runs_idempotency_key_idx` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeEventId` int NOT NULL,
	`notificationType` varchar(60) NOT NULL,
	`dedupeKey` varchar(255) NOT NULL,
	`status` enum('pending','sent','failed','suppressed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`lastError` text,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_dedupe_key_idx` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`fetchRunId` int NOT NULL,
	`rawArtifactId` int,
	`normalizedArtifactId` int,
	`canonicalHash` varchar(128) NOT NULL,
	`extractionVersion` varchar(40) NOT NULL DEFAULT 'v1',
	`classification` enum('baseline','no_change','cosmetic','material') NOT NULL,
	`observedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeEventId` int NOT NULL,
	`reviewerId` int NOT NULL,
	`decision` enum('confirm_material','not_material','incorrect','needs_follow_up') NOT NULL,
	`correctedClassification` enum('baseline','no_change','cosmetic','material'),
	`notes` text,
	`reviewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`sourceType` enum('json_api','html_page','rss','plain_text') NOT NULL,
	`url` varchar(2048) NOT NULL,
	`checkCron` varchar(100) NOT NULL,
	`parserConfig` json NOT NULL,
	`ignoreRules` json NOT NULL,
	`materialityPolicy` json NOT NULL,
	`status` enum('paused','active','retired') NOT NULL DEFAULT 'paused',
	`health` enum('unknown','healthy','degraded','failed') NOT NULL DEFAULT 'unknown',
	`scheduleCronTaskUid` varchar(65),
	`lastCheckAt` timestamp,
	`lastSuccessAt` timestamp,
	`lastFailureAt` timestamp,
	`consecutiveFailureCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `sources_schedule_task_uid_idx` UNIQUE(`scheduleCronTaskUid`)
);
--> statement-breakpoint
CREATE TABLE `systemJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`kind` enum('reconciliation') NOT NULL,
	`cron` varchar(100) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`enabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `systemJobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_jobs_owner_kind_idx` UNIQUE(`ownerId`,`kind`),
	CONSTRAINT `system_jobs_schedule_task_uid_idx` UNIQUE(`scheduleCronTaskUid`)
);
--> statement-breakpoint
CREATE TABLE `workflowExecutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int,
	`workflowName` varchar(120) NOT NULL,
	`externalExecutionId` varchar(160),
	`status` enum('running','succeeded','partial','failed') NOT NULL DEFAULT 'running',
	`itemsReceived` int NOT NULL DEFAULT 0,
	`itemsSucceeded` int NOT NULL DEFAULT 0,
	`itemsFailed` int NOT NULL DEFAULT 0,
	`errorSummary` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `workflowExecutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `advisoryExplanations` ADD CONSTRAINT `advisoryExplanations_changeEventId_changeEvents_id_fk` FOREIGN KEY (`changeEventId`) REFERENCES `changeEvents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `artifacts` ADD CONSTRAINT `artifacts_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `artifacts` ADD CONSTRAINT `artifacts_fetchRunId_fetchRuns_id_fk` FOREIGN KEY (`fetchRunId`) REFERENCES `fetchRuns`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `changeEvents` ADD CONSTRAINT `changeEvents_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `changeEvents` ADD CONSTRAINT `changeEvents_observationId_observations_id_fk` FOREIGN KEY (`observationId`) REFERENCES `observations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `changeEvents` ADD CONSTRAINT `changeEvents_previousVersionId_contentVersions_id_fk` FOREIGN KEY (`previousVersionId`) REFERENCES `contentVersions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `changeEvents` ADD CONSTRAINT `changeEvents_currentVersionId_contentVersions_id_fk` FOREIGN KEY (`currentVersionId`) REFERENCES `contentVersions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `changeEvents` ADD CONSTRAINT `changeEvents_diffArtifactId_artifacts_id_fk` FOREIGN KEY (`diffArtifactId`) REFERENCES `artifacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contentVersions` ADD CONSTRAINT `contentVersions_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contentVersions` ADD CONSTRAINT `contentVersions_observationId_observations_id_fk` FOREIGN KEY (`observationId`) REFERENCES `observations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contentVersions` ADD CONSTRAINT `contentVersions_normalizedArtifactId_artifacts_id_fk` FOREIGN KEY (`normalizedArtifactId`) REFERENCES `artifacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contentVersions` ADD CONSTRAINT `contentVersions_rawArtifactId_artifacts_id_fk` FOREIGN KEY (`rawArtifactId`) REFERENCES `artifacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_changeEventId_changeEvents_id_fk` FOREIGN KEY (`changeEventId`) REFERENCES `changeEvents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_artifactId_artifacts_id_fk` FOREIGN KEY (`artifactId`) REFERENCES `artifacts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fetchRuns` ADD CONSTRAINT `fetchRuns_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fetchRuns` ADD CONSTRAINT `fetchRuns_workflowExecutionId_workflowExecutions_id_fk` FOREIGN KEY (`workflowExecutionId`) REFERENCES `workflowExecutions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_changeEventId_changeEvents_id_fk` FOREIGN KEY (`changeEventId`) REFERENCES `changeEvents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_fetchRunId_fetchRuns_id_fk` FOREIGN KEY (`fetchRunId`) REFERENCES `fetchRuns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_rawArtifactId_artifacts_id_fk` FOREIGN KEY (`rawArtifactId`) REFERENCES `artifacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `observations` ADD CONSTRAINT `observations_normalizedArtifactId_artifacts_id_fk` FOREIGN KEY (`normalizedArtifactId`) REFERENCES `artifacts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_changeEventId_changeEvents_id_fk` FOREIGN KEY (`changeEventId`) REFERENCES `changeEvents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_reviewerId_users_id_fk` FOREIGN KEY (`reviewerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sources` ADD CONSTRAINT `sources_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `systemJobs` ADD CONSTRAINT `systemJobs_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflowExecutions` ADD CONSTRAINT `workflowExecutions_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `advisory_explanations_change_event_idx` ON `advisoryExplanations` (`changeEventId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `artifacts_source_created_idx` ON `artifacts` (`sourceId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `change_events_source_status_detected_idx` ON `changeEvents` (`sourceId`,`status`,`detectedAt`);--> statement-breakpoint
CREATE INDEX `change_events_status_detected_idx` ON `changeEvents` (`status`,`detectedAt`);--> statement-breakpoint
CREATE INDEX `evidence_change_event_idx` ON `evidence` (`changeEventId`);--> statement-breakpoint
CREATE INDEX `fetch_runs_source_started_idx` ON `fetchRuns` (`sourceId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `fetch_runs_status_started_idx` ON `fetchRuns` (`status`,`startedAt`);--> statement-breakpoint
CREATE INDEX `notifications_status_created_idx` ON `notifications` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `observations_source_observed_idx` ON `observations` (`sourceId`,`observedAt`);--> statement-breakpoint
CREATE INDEX `reviews_change_event_reviewed_idx` ON `reviews` (`changeEventId`,`reviewedAt`);--> statement-breakpoint
CREATE INDEX `sources_owner_status_idx` ON `sources` (`ownerId`,`status`);--> statement-breakpoint
CREATE INDEX `workflow_executions_owner_started_idx` ON `workflowExecutions` (`ownerId`,`startedAt`);