import {
  boolean,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export type JsonObject = Record<string, unknown>;

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const sourceTypes = ["json_api", "html_page", "rss", "plain_text"] as const;
export const sourceStatuses = ["paused", "active", "retired"] as const;
export const sourceHealths = ["unknown", "healthy", "degraded", "failed"] as const;
export const fetchRunStatuses = ["running", "succeeded", "failed", "skipped"] as const;
export const observationClassifications = ["baseline", "no_change", "cosmetic", "material"] as const;
export const changeEventStatuses = ["pending_review", "confirmed", "not_material", "suppressed"] as const;
export const notificationStatuses = ["pending", "sent", "failed", "suppressed"] as const;
export const artifactTypes = ["raw", "normalized", "diff"] as const;
export const reviewDecisions = ["confirm_material", "not_material", "incorrect", "needs_follow_up"] as const;
export const explanationStatuses = ["not_requested", "pending", "ready", "failed"] as const;
export const workflowStatuses = ["running", "succeeded", "partial", "failed"] as const;
export const recoveryKinds = ["fetch_retry", "notification_retry", "stuck_run", "report_retry"] as const;
export const recoveryStatuses = ["pending", "succeeded", "abandoned"] as const;
export const deliveryStatuses = ["pending", "running", "succeeded", "partial", "failed"] as const;
export const deliveryAttemptKinds = ["scheduled", "reconciliation", "manual_test"] as const;

export const sources = mysqlTable(
  "sources",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    steward: varchar("steward", { length: 160 }),
    sourceType: mysqlEnum("sourceType", sourceTypes).notNull(),
    url: varchar("url", { length: 2048 }).notNull(),
    checkCron: varchar("checkCron", { length: 100 }).notNull(),
    rateLimitSeconds: int("rateLimitSeconds").default(60).notNull(),
    parserConfig: json("parserConfig").$type<JsonObject>().notNull(),
    ignoreRules: json("ignoreRules").$type<JsonObject>().notNull(),
    materialityPolicy: json("materialityPolicy").$type<JsonObject>().notNull(),
    status: mysqlEnum("status", sourceStatuses).default("paused").notNull(),
    health: mysqlEnum("health", sourceHealths).default("unknown").notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    lastCheckAt: timestamp("lastCheckAt"),
    lastSuccessAt: timestamp("lastSuccessAt"),
    lastFailureAt: timestamp("lastFailureAt"),
    consecutiveFailureCount: int("consecutiveFailureCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("sources_owner_status_idx").on(table.ownerId, table.status),
    uniqueIndex("sources_schedule_task_uid_idx").on(table.scheduleCronTaskUid),
  ]
);

export const workflowExecutions = mysqlTable(
  "workflowExecutions",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").references(() => users.id, { onDelete: "set null" }),
    workflowName: varchar("workflowName", { length: 120 }).notNull(),
    externalExecutionId: varchar("externalExecutionId", { length: 160 }),
    status: mysqlEnum("status", workflowStatuses).default("running").notNull(),
    itemsReceived: int("itemsReceived").default(0).notNull(),
    itemsSucceeded: int("itemsSucceeded").default(0).notNull(),
    itemsFailed: int("itemsFailed").default(0).notNull(),
    errorSummary: text("errorSummary"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [index("workflow_executions_owner_started_idx").on(table.ownerId, table.startedAt)]
);

export const fetchRuns = mysqlTable(
  "fetchRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
    workflowExecutionId: int("workflowExecutionId").references(() => workflowExecutions.id, { onDelete: "set null" }),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    status: mysqlEnum("status", fetchRunStatuses).default("running").notNull(),
    initiatedBy: varchar("initiatedBy", { length: 40 }).notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    httpStatus: int("httpStatus"),
    contentType: varchar("contentType", { length: 255 }),
    responseHash: varchar("responseHash", { length: 128 }),
    latencyMs: int("latencyMs"),
    retryCount: int("retryCount").default(0).notNull(),
    errorCode: varchar("errorCode", { length: 100 }),
    errorMessage: text("errorMessage"),
  },
  table => [
    uniqueIndex("fetch_runs_idempotency_key_idx").on(table.idempotencyKey),
    index("fetch_runs_source_started_idx").on(table.sourceId, table.startedAt),
    index("fetch_runs_status_started_idx").on(table.status, table.startedAt),
  ]
);

export const artifacts = mysqlTable(
  "artifacts",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
    fetchRunId: int("fetchRunId").references(() => fetchRuns.id, { onDelete: "set null" }),
    artifactType: mysqlEnum("artifactType", artifactTypes).notNull(),
    storageKey: varchar("storageKey", { length: 600 }),
    storageUrl: varchar("storageUrl", { length: 800 }),
    contentType: varchar("contentType", { length: 255 }).notNull(),
    byteSize: int("byteSize").notNull(),
    sha256: varchar("sha256", { length: 128 }).notNull(),
    previewText: text("previewText"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("artifacts_source_created_idx").on(table.sourceId, table.createdAt)]
);

export const observations = mysqlTable(
  "observations",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
    fetchRunId: int("fetchRunId").notNull().references(() => fetchRuns.id, { onDelete: "cascade" }),
    rawArtifactId: int("rawArtifactId").references(() => artifacts.id, { onDelete: "set null" }),
    normalizedArtifactId: int("normalizedArtifactId").references(() => artifacts.id, { onDelete: "set null" }),
    canonicalHash: varchar("canonicalHash", { length: 128 }).notNull(),
    extractionVersion: varchar("extractionVersion", { length: 40 }).default("v1").notNull(),
    classification: mysqlEnum("classification", observationClassifications).notNull(),
    observedAt: timestamp("observedAt").defaultNow().notNull(),
  },
  table => [index("observations_source_observed_idx").on(table.sourceId, table.observedAt)]
);

export const contentVersions = mysqlTable(
  "contentVersions",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
    observationId: int("observationId").notNull().references(() => observations.id, { onDelete: "cascade" }),
    versionNumber: int("versionNumber").notNull(),
    normalizedArtifactId: int("normalizedArtifactId").references(() => artifacts.id, { onDelete: "set null" }),
    rawArtifactId: int("rawArtifactId").references(() => artifacts.id, { onDelete: "set null" }),
    contentHash: varchar("contentHash", { length: 128 }).notNull(),
    canonicalText: text("canonicalText").notNull(),
    structuredPayload: json("structuredPayload").$type<JsonObject>(),
    isBaseline: boolean("isBaseline").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("content_versions_source_hash_idx").on(table.sourceId, table.contentHash),
    uniqueIndex("content_versions_source_number_idx").on(table.sourceId, table.versionNumber),
  ]
);

export const changeEvents = mysqlTable(
  "changeEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
    observationId: int("observationId").notNull().references(() => observations.id, { onDelete: "cascade" }),
    previousVersionId: int("previousVersionId").references(() => contentVersions.id, { onDelete: "set null" }),
    currentVersionId: int("currentVersionId").notNull().references(() => contentVersions.id, { onDelete: "cascade" }),
    classification: mysqlEnum("classification", observationClassifications).notNull(),
    status: mysqlEnum("status", changeEventStatuses).default("pending_review").notNull(),
    changedFields: json("changedFields").$type<string[]>().notNull(),
    structuredDiff: json("structuredDiff").$type<JsonObject>().notNull(),
    diffArtifactId: int("diffArtifactId").references(() => artifacts.id, { onDelete: "set null" }),
    deterministicScore: double("deterministicScore").notNull(),
    suggestedSignificance: mysqlEnum("suggestedSignificance", ["low", "medium", "high"]).notNull(),
    explanationStatus: mysqlEnum("explanationStatus", explanationStatuses).default("not_requested").notNull(),
    detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("change_events_observation_idx").on(table.observationId),
    index("change_events_source_status_detected_idx").on(table.sourceId, table.status, table.detectedAt),
    index("change_events_status_detected_idx").on(table.status, table.detectedAt),
  ]
);

export const sourceCollections = mysqlTable(
  "sourceCollections",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    color: varchar("color", { length: 20 }).default("teal").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("source_collections_owner_name_idx").on(table.ownerId, table.name)]
);

export const sourceCollectionMembers = mysqlTable(
  "sourceCollectionMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    collectionId: int("collectionId").notNull().references(() => sourceCollections.id, { onDelete: "cascade" }),
    sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("source_collection_members_unique_idx").on(table.collectionId, table.sourceId), index("source_collection_members_source_idx").on(table.sourceId)]
);

export const sourceTags = mysqlTable(
  "sourceTags",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 80 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("source_tags_unique_idx").on(table.sourceId, table.tag), index("source_tags_tag_idx").on(table.tag)]
);

export const alertRules = mysqlTable(
  "alertRules",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    sourceId: int("sourceId").references(() => sources.id, { onDelete: "cascade" }),
    collectionId: int("collectionId").references(() => sourceCollections.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 80 }),
    keywords: json("keywords").$type<string[]>().notNull(),
    minSignificance: mysqlEnum("minSignificance", ["low", "medium", "high"]).default("medium").notNull(),
    severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
    cooldownMinutes: int("cooldownMinutes").default(60).notNull(),
    ownerAlertEligible: boolean("ownerAlertEligible").default(false).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("alert_rules_owner_enabled_idx").on(table.ownerId, table.enabled), index("alert_rules_source_idx").on(table.sourceId)]
);

export const alertMatches = mysqlTable(
  "alertMatches",
  {
    id: int("id").autoincrement().primaryKey(),
    alertRuleId: int("alertRuleId").notNull().references(() => alertRules.id, { onDelete: "cascade" }),
    changeEventId: int("changeEventId").notNull().references(() => changeEvents.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["matched", "dismissed", "acknowledged"]).default("matched").notNull(),
    matchedAt: timestamp("matchedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("alert_matches_rule_event_idx").on(table.alertRuleId, table.changeEventId), index("alert_matches_status_idx").on(table.status, table.matchedAt)]
);

export const changeAnnotations = mysqlTable(
  "changeAnnotations",
  {
    id: int("id").autoincrement().primaryKey(),
    changeEventId: int("changeEventId").notNull().references(() => changeEvents.id, { onDelete: "cascade" }),
    authorId: int("authorId").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    category: mysqlEnum("category", ["note", "decision", "follow_up"]).default("note").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("change_annotations_event_created_idx").on(table.changeEventId, table.createdAt)]
);

export const anomalyFindings = mysqlTable(
  "anomalyFindings",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["change_spike", "failure_spike"]).notNull(),
    status: mysqlEnum("status", ["open", "acknowledged", "dismissed"]).default("open").notNull(),
    observedValue: double("observedValue").notNull(),
    baselineValue: double("baselineValue").notNull(),
    thresholdValue: double("thresholdValue").notNull(),
    explanation: text("explanation").notNull(),
    detectedAt: timestamp("detectedAt").defaultNow().notNull(),
    triagedAt: timestamp("triagedAt"),
  },
  table => [index("anomaly_findings_owner_status_idx").on(table.ownerId, table.status, table.detectedAt), uniqueIndex("anomaly_findings_source_kind_day_idx").on(table.sourceId, table.kind, table.detectedAt)]
);

export const evidence = mysqlTable(
  "evidence",
  {
    id: int("id").autoincrement().primaryKey(),
    changeEventId: int("changeEventId").notNull().references(() => changeEvents.id, { onDelete: "cascade" }),
    artifactId: int("artifactId").notNull().references(() => artifacts.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["before_raw", "after_raw", "before_normalized", "after_normalized", "diff"]).notNull(),
    excerpt: text("excerpt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("evidence_change_event_idx").on(table.changeEventId)]
);

export const reviews = mysqlTable(
  "reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    changeEventId: int("changeEventId").notNull().references(() => changeEvents.id, { onDelete: "cascade" }),
    reviewerId: int("reviewerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    decision: mysqlEnum("decision", reviewDecisions).notNull(),
    correctedClassification: mysqlEnum("correctedClassification", observationClassifications),
    notes: text("notes"),
    reviewedAt: timestamp("reviewedAt").defaultNow().notNull(),
  },
  table => [index("reviews_change_event_reviewed_idx").on(table.changeEventId, table.reviewedAt)]
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    changeEventId: int("changeEventId").notNull().references(() => changeEvents.id, { onDelete: "cascade" }),
    notificationType: varchar("notificationType", { length: 60 }).notNull(),
    dedupeKey: varchar("dedupeKey", { length: 255 }).notNull(),
    status: mysqlEnum("status", notificationStatuses).default("pending").notNull(),
    attempts: int("attempts").default(0).notNull(),
    lastError: text("lastError"),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("notifications_dedupe_key_idx").on(table.dedupeKey),
    index("notifications_status_created_idx").on(table.status, table.createdAt),
  ]
);

export const recoveryRecords = mysqlTable(
  "recoveryRecords",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").references(() => sources.id, { onDelete: "set null" }),
    fetchRunId: int("fetchRunId").references(() => fetchRuns.id, { onDelete: "set null" }),
    notificationId: int("notificationId").references(() => notifications.id, { onDelete: "set null" }),
    reportDeliveryId: int("reportDeliveryId").references(() => reportDeliveries.id, { onDelete: "set null" }),
    kind: mysqlEnum("kind", recoveryKinds).notNull(),
    status: mysqlEnum("status", recoveryStatuses).default("pending").notNull(),
    retryCount: int("retryCount").default(0).notNull(),
    nextAttemptAt: timestamp("nextAttemptAt").notNull(),
    lastError: text("lastError"),
    details: json("details").$type<JsonObject>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
  },
  table => [
    index("recovery_records_status_next_idx").on(table.status, table.nextAttemptAt),
    index("recovery_records_source_created_idx").on(table.sourceId, table.createdAt),
    index("recovery_records_report_delivery_created_idx").on(table.reportDeliveryId, table.createdAt),
  ]
);

export const advisoryExplanations = mysqlTable(
  "advisoryExplanations",
  {
    id: int("id").autoincrement().primaryKey(),
    changeEventId: int("changeEventId").notNull().references(() => changeEvents.id, { onDelete: "cascade" }),
    model: varchar("model", { length: 100 }).notNull(),
    promptVersion: varchar("promptVersion", { length: 40 }).notNull(),
    summary: text("summary"),
    whyItMayMatter: text("whyItMayMatter"),
    suggestedSignificance: mysqlEnum("suggestedSignificance", ["low", "medium", "high"]),
    confidence: double("confidence"),
    caveats: json("caveats").$type<string[]>(),
    schemaValid: boolean("schemaValid").default(false).notNull(),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("advisory_explanations_change_event_idx").on(table.changeEventId, table.createdAt)]
);

export const systemJobs = mysqlTable(
  "systemJobs",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["reconciliation"]).notNull(),
    cron: varchar("cron", { length: 100 }).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("system_jobs_owner_kind_idx").on(table.ownerId, table.kind),
    uniqueIndex("system_jobs_schedule_task_uid_idx").on(table.scheduleCronTaskUid),
  ]
);

export const reportTemplates = mysqlTable(
  "reportTemplates",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description"),
    filters: json("filters").$type<JsonObject>().notNull(),
    includeSuppressed: boolean("includeSuppressed").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("report_templates_owner_name_idx").on(table.ownerId, table.name)]
);

export const reportDeliveries = mysqlTable(
  "reportDeliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    templateId: int("templateId").references(() => reportTemplates.id, { onDelete: "set null" }),
    name: varchar("name", { length: 140 }).notNull(),
    cron: varchar("cron", { length: 100 }).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    enabled: boolean("enabled").default(false).notNull(),
    recipients: json("recipients").$type<string[]>().notNull(),
    primaryEmailProvider: mysqlEnum("primaryEmailProvider", ["resend", "gmail", "outlook"]).notNull(),
    fallbackProviders: json("fallbackProviders").$type<string[]>().notNull(),
    emailEnabled: boolean("emailEnabled").default(true).notNull(),
    slackEnabled: boolean("slackEnabled").default(true).notNull(),
    filters: json("filters").$type<JsonObject>().notNull(),
    lastAttemptAt: timestamp("lastAttemptAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("report_deliveries_owner_enabled_idx").on(table.ownerId, table.enabled),
    uniqueIndex("report_deliveries_schedule_task_uid_idx").on(table.scheduleCronTaskUid),
  ]
);

export const reportDeliveryAttempts = mysqlTable(
  "reportDeliveryAttempts",
  {
    id: int("id").autoincrement().primaryKey(),
    deliveryId: int("deliveryId").notNull().references(() => reportDeliveries.id, { onDelete: "cascade" }),
    attemptKind: mysqlEnum("attemptKind", deliveryAttemptKinds).default("scheduled").notNull(),
    status: mysqlEnum("status", deliveryStatuses).default("pending").notNull(),
    providersAttempted: json("providersAttempted").$type<string[]>().notNull(),
    deliveredProviders: json("deliveredProviders").$type<string[]>().notNull(),
    reportSummary: json("reportSummary").$type<JsonObject>().notNull(),
    errorSummary: text("errorSummary"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [index("report_delivery_attempts_delivery_started_idx").on(table.deliveryId, table.startedAt)]
);

export const researchMissions = mysqlTable("researchMissions", {
  id: int("id").autoincrement().primaryKey(), ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }), name: varchar("name", { length: 180 }).notNull(), template: mysqlEnum("template", ["general", "career", "procurement_policy"]).default("general").notNull(), decisionQuestion: text("decisionQuestion").notNull(), decisionHorizon: timestamp("decisionHorizon"), materialityPolicy: json("materialityPolicy").$type<JsonObject>().notNull(), status: mysqlEnum("status", ["draft", "active", "paused", "closed"]).default("draft").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("research_missions_owner_status_idx").on(table.ownerId, table.status)]);
export const missionSources = mysqlTable("missionSources", { id: int("id").autoincrement().primaryKey(), missionId: int("missionId").notNull().references(() => researchMissions.id, { onDelete: "cascade" }), sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }), createdAt: timestamp("createdAt").defaultNow().notNull() }, table => [uniqueIndex("mission_sources_unique_idx").on(table.missionId, table.sourceId)]);
export const entities = mysqlTable("entities", { id: int("id").autoincrement().primaryKey(), ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }), name: varchar("name", { length: 200 }).notNull(), entityType: mysqlEnum("entityType", ["organization", "person", "programme", "skill", "location", "regulation", "opportunity", "topic"]).notNull(), aliases: json("aliases").$type<string[]>().notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() }, table => [index("entities_owner_type_idx").on(table.ownerId, table.entityType)]);
export const entityRelations = mysqlTable("entityRelations", { id: int("id").autoincrement().primaryKey(), ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }), fromEntityId: int("fromEntityId").notNull().references(() => entities.id, { onDelete: "cascade" }), toEntityId: int("toEntityId").notNull().references(() => entities.id, { onDelete: "cascade" }), relationType: varchar("relationType", { length: 80 }).notNull(), evidenceClaimId: int("evidenceClaimId").references(() => evidenceClaims.id, { onDelete: "set null" }), confidence: double("confidence").default(0.5).notNull(), humanAssessment: mysqlEnum("humanAssessment", ["unreviewed", "trusted", "uncertain", "rejected"]).default("unreviewed").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() }, table => [index("entity_relations_owner_from_idx").on(table.ownerId, table.fromEntityId), index("entity_relations_owner_to_idx").on(table.ownerId, table.toEntityId)]);
export const evidenceClaims = mysqlTable("evidenceClaims", { id: int("id").autoincrement().primaryKey(), ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }), changeEventId: int("changeEventId").references(() => changeEvents.id, { onDelete: "set null" }), missionId: int("missionId").references(() => researchMissions.id, { onDelete: "set null" }), claimText: text("claimText").notNull(), stance: mysqlEnum("stance", ["support", "contradict", "context"]).default("support").notNull(), authorityScore: double("authorityScore").default(0.5).notNull(), freshnessScore: double("freshnessScore").default(0.5).notNull(), corroborationScore: double("corroborationScore").default(0).notNull(), humanAssessment: mysqlEnum("humanAssessment", ["unreviewed", "trusted", "uncertain", "rejected"]).default("unreviewed").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() }, table => [index("evidence_claims_mission_created_idx").on(table.missionId, table.createdAt)]);
export const eventClusters = mysqlTable("eventClusters", { id: int("id").autoincrement().primaryKey(), ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }), missionId: int("missionId").references(() => researchMissions.id, { onDelete: "set null" }), title: varchar("title", { length: 240 }).notNull(), noveltyScore: double("noveltyScore").default(0).notNull(), status: mysqlEnum("status", ["open", "reviewed", "closed"]).default("open").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() }, table => [index("event_clusters_owner_status_idx").on(table.ownerId, table.status)]);
export const eventClusterMembers = mysqlTable("eventClusterMembers", { id: int("id").autoincrement().primaryKey(), clusterId: int("clusterId").notNull().references(() => eventClusters.id, { onDelete: "cascade" }), changeEventId: int("changeEventId").notNull().references(() => changeEvents.id, { onDelete: "cascade" }), addedBy: mysqlEnum("addedBy", ["deterministic", "advisory", "reviewer"]).default("deterministic").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() }, table => [uniqueIndex("cluster_members_unique_idx").on(table.clusterId, table.changeEventId)]);
export const decisionBriefs = mysqlTable("decisionBriefs", { id: int("id").autoincrement().primaryKey(), missionId: int("missionId").notNull().references(() => researchMissions.id, { onDelete: "cascade" }), title: varchar("title", { length: 220 }).notNull(), executiveSignal: text("executiveSignal"), impactAssessment: text("impactAssessment"), options: json("options").$type<string[]>().notNull(), status: mysqlEnum("status", ["draft", "under_review", "approved", "deferred", "closed"]).default("draft").notNull(), decisionDeadline: timestamp("decisionDeadline"), ownerName: varchar("ownerName", { length: 160 }), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() }, table => [index("decision_briefs_mission_status_idx").on(table.missionId, table.status)]);
export const decisionActions = mysqlTable("decisionActions", { id: int("id").autoincrement().primaryKey(), briefId: int("briefId").notNull().references(() => decisionBriefs.id, { onDelete: "cascade" }), title: varchar("title", { length: 220 }).notNull(), assignee: varchar("assignee", { length: 160 }), dueAt: timestamp("dueAt"), status: mysqlEnum("status", ["open", "in_progress", "completed", "cancelled"]).default("open").notNull(), outcome: text("outcome"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() }, table => [index("decision_actions_brief_status_idx").on(table.briefId, table.status)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Source = typeof sources.$inferSelect;
