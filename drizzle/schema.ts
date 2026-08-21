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
export const recoveryKinds = ["fetch_retry", "notification_retry", "stuck_run"] as const;
export const recoveryStatuses = ["pending", "succeeded", "abandoned"] as const;

export const sources = mysqlTable(
  "sources",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Source = typeof sources.$inferSelect;
