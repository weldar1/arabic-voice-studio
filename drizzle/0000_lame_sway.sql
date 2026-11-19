CREATE TABLE `charges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`period` text NOT NULL,
	`seconds` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `charges_job` ON `charges` (`job_id`);--> statement-breakpoint
CREATE INDEX `charges_user_period` ON `charges` (`user_id`,`period`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`text` text NOT NULL,
	`dialect` text NOT NULL,
	`voice` text NOT NULL,
	`tone` text DEFAULT '' NOT NULL,
	`project_name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drafts_user` ON `drafts` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`period` text NOT NULL,
	`project_name` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`dialect` text,
	`voice` text,
	`tone` text DEFAULT '' NOT NULL,
	`characters` integer DEFAULT 0 NOT NULL,
	`reserved_seconds` integer DEFAULT 0 NOT NULL,
	`charged_seconds` integer DEFAULT 0 NOT NULL,
	`duration_seconds` real,
	`audio_key` text,
	`file_name` text,
	`error` text,
	`raw_transcript` text,
	`transcript` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text,
	`request_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `jobs_user_created` ON `jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_user_period` ON `jobs` (`user_id`,`period`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_user_idempotency` ON `jobs` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`allowance_seconds` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
