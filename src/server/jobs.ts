// Speech and transcription jobs: submitting (with a reservation), reading,
// deleting and editing. Every query takes the member's id.
import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import {
  DIALECTS,
  PROJECT_NAME_LIMIT,
  TEXT_LIMIT,
  TONE_LIMIT,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_SECONDS,
  VOICES,
  estimateSpeechSeconds,
} from "@/lib/catalog";
import { mp3Duration } from "@/server/mp3";
import { insertReservedJob, quotaRefusal } from "@/server/usage";

const dialectIds = DIALECTS.map((d) => d.id) as [string, ...string[]];
const voiceIds = VOICES.map((v) => v.id) as [string, ...string[]];

export class TextLimitError extends Error {
  constructor(length: number) {
    super(`The text is ${length.toLocaleString("en")} characters; the limit is ${TEXT_LIMIT.toLocaleString("en")}.`);
  }
}
export class IdempotencyConflictError extends Error {
  constructor() {
    super("This Idempotency-Key was already used for a different request.");
  }
}
export class UploadError extends Error {}

export const speechInput = z.object({
  text: z.string().refine((t) => t.trim().length > 0, "Enter some text"),
  dialect: z.enum(dialectIds).default("msa"),
  voice: z.enum(voiceIds, { message: "Pick one of the listed voices" }),
  // Only the first 500 characters are used.
  tone: z
    .string()
    .default("")
    .transform((t) => t.trim().slice(0, TONE_LIMIT)),
  projectName: z
    .string()
    .default("")
    .transform((t) => t.trim().slice(0, PROJECT_NAME_LIMIT)),
});
export type SpeechInput = z.infer<typeof speechInput>;

export const jobIdInput = z.object({ id: z.string().min(1).max(64) });

const listed = {
  id: jobs.id,
  kind: jobs.kind,
  status: jobs.status,
  projectName: jobs.projectName,
  text: jobs.text,
  fileName: jobs.fileName,
  dialect: jobs.dialect,
  voice: jobs.voice,
  characters: jobs.characters,
  reservedSeconds: jobs.reservedSeconds,
  chargedSeconds: jobs.chargedSeconds,
  durationSeconds: jobs.durationSeconds,
  error: jobs.error,
  hasAudio: jobs.audioKey,
  createdAt: jobs.createdAt,
  completedAt: jobs.completedAt,
};

export type JobRow = Awaited<ReturnType<typeof listJobs>>[number];

export async function listJobs(userId: string, filter: { status?: string; kind?: string; limit?: number } = {}) {
  const conditions = [eq(jobs.userId, userId)];
  if (filter.status) conditions.push(eq(jobs.status, filter.status as never));
  if (filter.kind) conditions.push(eq(jobs.kind, filter.kind as never));
  const rows = await db
    .select(listed)
    .from(jobs)
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(filter.limit ?? 500);
  return rows.map(({ text, hasAudio, ...row }) => ({
    ...row,
    hasAudio: Boolean(hasAudio),
    // The list shows the start of the text, never all of it.
    excerpt: text.slice(0, 120),
  }));
}

export async function getJob(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)));
  return row ?? null;
}

function audioKey(userId: string, jobId: string, suffix: string) {
  return `${encodeURIComponent(userId)}/${jobId}${suffix}.mp3`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Queues a speech job, holding its estimated seconds. With an idempotency
 * key, the same key and payload give back the first job.
 */
export async function submitSpeech(
  userId: string,
  input: SpeechInput,
  idempotencyKey: string | null = null,
): Promise<{ jobId: string; reservedSeconds: number; repeated: boolean }> {
  if (input.text.length > TEXT_LIMIT) throw new TextLimitError(input.text.length);
  const requestHash = idempotencyKey
    ? await sha256(JSON.stringify([input.text, input.dialect, input.voice, input.tone, input.projectName]))
    : null;
  const earlier = async () => {
    if (!idempotencyKey) return null;
    const [row] = await db
      .select({ id: jobs.id, hash: jobs.requestHash, reserved: jobs.reservedSeconds, charged: jobs.chargedSeconds })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.idempotencyKey, idempotencyKey)));
    if (!row) return null;
    if (row.hash !== requestHash) throw new IdempotencyConflictError();
    return { jobId: row.id, reservedSeconds: Math.max(row.reserved, row.charged), repeated: true };
  };
  const found = await earlier();
  if (found) return found;

  const id = crypto.randomUUID();
  const reservedSeconds = estimateSpeechSeconds(input.text);
  const written = await insertReservedJob({
    id,
    userId,
    kind: "speech",
    projectName: input.projectName,
    text: input.text,
    dialect: input.dialect,
    voice: input.voice,
    tone: input.tone,
    characters: input.text.length,
    reservedSeconds,
    audioKey: null,
    fileName: null,
    durationSeconds: null,
    idempotencyKey,
    requestHash,
  });
  if (!written) {
    const raced = await earlier();
    if (raced) return raced;
    throw await quotaRefusal(userId, reservedSeconds);
  }
  await env.jobs.send({ jobId: id });
  return { jobId: id, reservedSeconds, repeated: false };
}

/** Checks an upload, stores it and queues its transcription. */
export async function submitTranscription(userId: string, file: File): Promise<{ jobId: string }> {
  const named = file.name.toLowerCase().endsWith(".mp3");
  const typed = ["audio/mpeg", "audio/mp3", "audio/mpeg3", ""].includes(file.type);
  if (!named || !typed) throw new UploadError("Choose an MP3 file.");
  if (file.size > UPLOAD_MAX_BYTES) throw new UploadError("The file is larger than 5 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const duration = mp3Duration(bytes);
  if (duration === null) throw new UploadError("This file isn't playable MP3 audio.");
  if (duration > UPLOAD_MAX_SECONDS) throw new UploadError("The recording is longer than 2 minutes.");

  const id = crypto.randomUUID();
  const key = audioKey(userId, id, "-upload");
  const reservedSeconds = Math.max(1, Math.ceil(duration));
  const fileName = file.name.slice(0, 200);
  await env.audio.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
  const written = await insertReservedJob({
    id,
    userId,
    kind: "transcription",
    projectName: fileName.replace(/\.mp3$/i, ""),
    text: "",
    dialect: null,
    voice: null,
    tone: "",
    characters: 0,
    reservedSeconds,
    audioKey: key,
    fileName,
    durationSeconds: duration,
    idempotencyKey: null,
    requestHash: null,
  });
  if (!written) {
    await env.audio.delete(key);
    throw await quotaRefusal(userId, reservedSeconds);
  }
  await env.jobs.send({ jobId: id });
  return { jobId: id };
}

/** Deletes the member's job and its stored audio. */
export async function deleteJob(userId: string, id: string): Promise<boolean> {
  const [row] = await db
    .delete(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
    .returning({ audioKey: jobs.audioKey });
  if (!row) return false;
  if (row.audioKey) await env.audio.delete(row.audioKey);
  return true;
}

export const saveTranscriptInput = z.object({
  id: z.string().min(1).max(64),
  transcript: z.string().max(100_000),
  expectedRevision: z.number().int().min(0),
});

export type SaveResult =
  | { ok: true; revision: number }
  | { ok: false; reason: "conflict"; revision: number; transcript: string }
  | { ok: false; reason: "not_found" };

/** Saves an edit made against `expectedRevision`; a newer save wins and this one is refused. */
export async function saveTranscript(
  userId: string,
  input: z.infer<typeof saveTranscriptInput>,
): Promise<SaveResult> {
  const result = await env.DB.prepare(
    `UPDATE jobs SET transcript = ?3, revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND user_id = ?2 AND kind = 'transcription' AND status = 'ready' AND revision = ?4`,
  )
    .bind(input.id, userId, input.transcript, input.expectedRevision)
    .run();
  if (result.meta.changes > 0) return { ok: true, revision: input.expectedRevision + 1 };
  const current = await getJob(userId, input.id);
  if (!current || current.kind !== "transcription" || current.status !== "ready") {
    return { ok: false, reason: "not_found" };
  }
  return { ok: false, reason: "conflict", revision: current.revision, transcript: current.transcript ?? "" };
}

/** The member's stored audio for a job: the speech made, or the recording uploaded. */
export async function getJobAudio(userId: string, id: string) {
  const job = await getJob(userId, id);
  if (!job?.audioKey) return null;
  if (job.kind === "speech" && job.status !== "completed") return null;
  const object = await env.audio.get(job.audioKey);
  if (!object) return null;
  return { job, object };
}
