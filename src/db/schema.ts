import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** Members the app has seen, keyed by the Gateway's user id. */
export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  firstSeenAt: text("first_seen_at").notNull().default(now),
  lastSeenAt: text("last_seen_at").notNull().default(now),
});

/** One row: the monthly allowance in seconds per member (0 is unlimited). */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  allowanceSeconds: integer("allowance_seconds").notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

/** Speech and transcription jobs. */
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: ["speech", "transcription"] }).notNull(),
    status: text("status", {
      enum: ["queued", "processing", "completed", "ready", "failed", "no_speech"],
    }).notNull(),
    period: text("period").notNull(),
    projectName: text("project_name").notNull().default(""),
    text: text("text").notNull().default(""),
    dialect: text("dialect"),
    voice: text("voice"),
    tone: text("tone").notNull().default(""),
    characters: integer("characters").notNull().default(0),
    reservedSeconds: integer("reserved_seconds").notNull().default(0),
    chargedSeconds: integer("charged_seconds").notNull().default(0),
    durationSeconds: real("duration_seconds"),
    audioKey: text("audio_key"),
    fileName: text("file_name"),
    error: text("error"),
    rawTranscript: text("raw_transcript"),
    transcript: text("transcript"),
    revision: integer("revision").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
    completedAt: text("completed_at"),
  },
  (t) => [
    index("jobs_user_created").on(t.userId, t.createdAt),
    index("jobs_user_period").on(t.userId, t.period, t.status),
    uniqueIndex("jobs_user_idempotency").on(t.userId, t.idempotencyKey),
  ],
);

/** What each finished job cost: one row per job, written once. */
export const charges = sqliteTable(
  "charges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    jobId: text("job_id").notNull(),
    kind: text("kind", { enum: ["speech", "transcription"] }).notNull(),
    label: text("label").notNull(),
    period: text("period").notNull(),
    seconds: integer("seconds").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("charges_job").on(t.jobId),
    index("charges_user_period").on(t.userId, t.period),
  ],
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    text: text("text").notNull(),
    dialect: text("dialect").notNull(),
    voice: text("voice").notNull(),
    tone: text("tone").notNull().default(""),
    projectName: text("project_name").notNull().default(""),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("drafts_user").on(t.userId, t.updatedAt)],
);
