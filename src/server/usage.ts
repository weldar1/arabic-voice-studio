// The monthly allowance: seconds of audio per member per calendar month (UTC),
// shared by speech and transcription. A job reserves an estimate when it is
// submitted; when it finishes it is charged once for what it really played.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { charges, jobs, members, settings } from "@/db/schema";

/** The allowance until an admin sets one: an hour a month. */
export const DEFAULT_ALLOWANCE_SECONDS = 3600;

const HOLDING = ["queued", "processing"] as const;

/** "2026-11" for any moment in November 2026, UTC. */
export function periodOf(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export async function getAllowance(): Promise<number> {
  const [row] = await db
    .select({ seconds: settings.allowanceSeconds })
    .from(settings)
    .where(eq(settings.id, 1));
  return row?.seconds ?? DEFAULT_ALLOWANCE_SECONDS;
}

export async function setAllowance(seconds: number): Promise<number> {
  await db
    .insert(settings)
    .values({ id: 1, allowanceSeconds: seconds })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        allowanceSeconds: seconds,
        updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      },
    });
  return seconds;
}

export interface Balance {
  period: string;
  allowanceSeconds: number;
  usedSeconds: number;
  reservedSeconds: number;
  /** Null when the allowance is unlimited. */
  remainingSeconds: number | null;
}

export async function getBalance(userId: string, period = periodOf()): Promise<Balance> {
  const [allowance, [used], [reserved]] = await Promise.all([
    getAllowance(),
    db
      .select({ seconds: sql<number>`coalesce(sum(${charges.seconds}), 0)` })
      .from(charges)
      .where(and(eq(charges.userId, userId), eq(charges.period, period))),
    db
      .select({ seconds: sql<number>`coalesce(sum(${jobs.reservedSeconds}), 0)` })
      .from(jobs)
      .where(
        and(
          eq(jobs.userId, userId),
          eq(jobs.period, period),
          inArray(jobs.status, [...HOLDING]),
        ),
      ),
  ]);
  const usedSeconds = Number(used?.seconds ?? 0);
  const reservedSeconds = Number(reserved?.seconds ?? 0);
  return {
    period,
    allowanceSeconds: allowance,
    usedSeconds,
    reservedSeconds,
    remainingSeconds:
      allowance === 0 ? null : Math.max(0, allowance - usedSeconds - reservedSeconds),
  };
}

export class QuotaError extends Error {
  constructor(
    readonly reason: "exceeds_remaining" | "held_by_other_jobs",
    readonly balance: Balance,
    readonly needed: number,
  ) {
    super(
      reason === "exceeds_remaining"
        ? `This needs about ${needed} s of audio, and ${Math.max(0, balance.allowanceSeconds - balance.usedSeconds)} s are left this month.`
        : `This needs about ${needed} s of audio. ${balance.reservedSeconds} s are held by your jobs in progress, which leaves ${balance.remainingSeconds ?? 0} s. Wait for them to finish and try again.`,
    );
  }
}

export interface NewJob {
  id: string;
  userId: string;
  kind: "speech" | "transcription";
  projectName: string;
  text: string;
  dialect: string | null;
  voice: string | null;
  tone: string;
  characters: number;
  reservedSeconds: number;
  audioKey: string | null;
  fileName: string | null;
  durationSeconds: number | null;
  idempotencyKey: string | null;
  requestHash: string | null;
}

/**
 * Inserts the job as queued, holding its reservation, in one statement that
 * only writes while the member's balance covers it. Returns false when the
 * row wasn't written (the balance, or a repeated idempotency key).
 */
export async function insertReservedJob(job: NewJob): Promise<boolean> {
  const period = periodOf();
  const result = await env.DB.prepare(
    `INSERT INTO jobs (id, user_id, kind, status, period, project_name, text, dialect, voice, tone,
       characters, reserved_seconds, audio_key, file_name, duration_seconds, idempotency_key, request_hash)
     SELECT ?1, ?2, ?3, 'queued', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
     WHERE (SELECT coalesce((SELECT allowance_seconds FROM settings WHERE id = 1), ?17)) = 0
        OR coalesce((SELECT sum(seconds) FROM charges WHERE user_id = ?2 AND period = ?4), 0)
         + coalesce((SELECT sum(reserved_seconds) FROM jobs WHERE user_id = ?2 AND period = ?4
                     AND status IN ('queued', 'processing')), 0)
         + ?11 <= (SELECT coalesce((SELECT allowance_seconds FROM settings WHERE id = 1), ?17))
     ON CONFLICT DO NOTHING`,
  )
    .bind(
      job.id,
      job.userId,
      job.kind,
      period,
      job.projectName,
      job.text,
      job.dialect,
      job.voice,
      job.tone,
      job.characters,
      job.reservedSeconds,
      job.audioKey,
      job.fileName,
      job.durationSeconds,
      job.idempotencyKey,
      job.requestHash,
      DEFAULT_ALLOWANCE_SECONDS,
    )
    .run();
  return result.meta.changes > 0;
}

/** Why a reservation of `needed` seconds was refused. */
export async function quotaRefusal(userId: string, needed: number): Promise<QuotaError> {
  const balance = await getBalance(userId);
  const free = balance.allowanceSeconds - balance.usedSeconds;
  return new QuotaError(needed > free ? "exceeds_remaining" : "held_by_other_jobs", balance, needed);
}

/**
 * Marks a processing job finished and charges it once, in one batch: its
 * reservation is released and its real seconds, rounded up, go on the ledger.
 * False when the job was no longer processing (deleted, or already settled).
 */
export async function settleCharged(
  job: { id: string; userId: string; kind: "speech" | "transcription"; period: string; label: string },
  status: "completed" | "ready",
  durationSeconds: number,
  fields: { audioKey?: string; rawTranscript?: string } = {},
): Promise<boolean> {
  const seconds = Math.max(1, Math.ceil(durationSeconds - 1e-9));
  const [update] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE jobs SET status = ?2, charged_seconds = ?3, duration_seconds = ?4, reserved_seconds = 0,
         audio_key = coalesce(?5, audio_key), raw_transcript = coalesce(?6, raw_transcript),
         transcript = coalesce(?6, transcript), revision = CASE WHEN ?6 IS NULL THEN revision ELSE 1 END,
         error = NULL, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?1 AND status = 'processing'`,
    ).bind(job.id, status, seconds, durationSeconds, fields.audioKey ?? null, fields.rawTranscript ?? null),
    env.DB.prepare(
      `INSERT INTO charges (id, user_id, job_id, kind, label, period, seconds)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS
         (SELECT 1 FROM jobs WHERE id = ?3 AND status = ?8 AND charged_seconds = ?7)
       ON CONFLICT DO NOTHING`,
    ).bind(crypto.randomUUID(), job.userId, job.id, job.kind, job.label, job.period, seconds, status),
  ]);
  return (update?.meta.changes ?? 0) > 0;
}

/** Ends a job without a charge: everything it held is released. */
export async function settleReleased(
  jobId: string,
  status: "failed" | "no_speech",
  error: string | null,
  fields: { rawTranscript?: string } = {},
): Promise<void> {
  await env.DB.prepare(
    `UPDATE jobs SET status = ?2, error = ?3, reserved_seconds = 0, charged_seconds = 0,
       raw_transcript = coalesce(?4, raw_transcript), transcript = coalesce(?4, transcript),
       completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND status IN ('queued', 'processing')`,
  )
    .bind(jobId, status, error, fields.rawTranscript ?? null)
    .run();
}

export function listCharges(userId: string, period = periodOf()) {
  return db
    .select({
      id: charges.id,
      jobId: charges.jobId,
      kind: charges.kind,
      label: charges.label,
      seconds: charges.seconds,
      createdAt: charges.createdAt,
    })
    .from(charges)
    .where(and(eq(charges.userId, userId), eq(charges.period, period)))
    .orderBy(desc(charges.createdAt), desc(charges.id));
}

/** Every member's usage this month, for an admin. */
export async function listMemberUsage(period = periodOf()) {
  const rows = await db
    .select({
      id: members.id,
      email: members.email,
      usedSeconds: sql<number>`coalesce((select sum(${charges.seconds}) from ${charges} where ${charges.userId} = ${members.id} and ${charges.period} = ${period}), 0)`,
      reservedSeconds: sql<number>`coalesce((select sum(${jobs.reservedSeconds}) from ${jobs} where ${jobs.userId} = ${members.id} and ${jobs.period} = ${period} and ${jobs.status} in ('queued', 'processing')), 0)`,
    })
    .from(members)
    .orderBy(members.email);
  return rows.map((r) => ({ ...r, usedSeconds: Number(r.usedSeconds), reservedSeconds: Number(r.reservedSeconds) }));
}
