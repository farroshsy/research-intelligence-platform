CREATE TABLE `entityRelations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`fromEntityId` int NOT NULL,
	`toEntityId` int NOT NULL,
	`relationType` varchar(80) NOT NULL,
	`evidenceClaimId` int,
	`confidence` double NOT NULL DEFAULT 0.5,
	`humanAssessment` enum('unreviewed','trusted','uncertain','rejected') NOT NULL DEFAULT 'unreviewed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entityRelations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `entityRelations` ADD CONSTRAINT `entityRelations_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entityRelations` ADD CONSTRAINT `entityRelations_fromEntityId_entities_id_fk` FOREIGN KEY (`fromEntityId`) REFERENCES `entities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entityRelations` ADD CONSTRAINT `entityRelations_toEntityId_entities_id_fk` FOREIGN KEY (`toEntityId`) REFERENCES `entities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entityRelations` ADD CONSTRAINT `entityRelations_evidenceClaimId_evidenceClaims_id_fk` FOREIGN KEY (`evidenceClaimId`) REFERENCES `evidenceClaims`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `entity_relations_owner_from_idx` ON `entityRelations` (`ownerId`,`fromEntityId`);--> statement-breakpoint
CREATE INDEX `entity_relations_owner_to_idx` ON `entityRelations` (`ownerId`,`toEntityId`);