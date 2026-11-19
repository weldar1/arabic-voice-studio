// The queue's work: speaks or transcribes one job, then settles its allowance.
import { env } from "cloudflare:workers";
import { DIALECTS, VOICES } from "@/lib/catalog";
import { splitIntoChunks } from "@/server/chunks";
import { joinMp3, mp3Duration } from "@/server/mp3";
import { JobFailure, speak, transcribe } from "@/server/openai";
import { settleCharged, settleReleased } from "@/server/usage";

interface Claimed {
  id: string;
  user_id: string;
  kind: "speech" | "transcription";
  period: string;
  project_name: string;
  text: string;
  dialect: string | null;
  voice: string | null;
  tone: string;
  audio_key: string | null;
  file_name: string | null;
}

/** Takes the job for processing; null when it is gone or already settled. */
async function claim(jobId: string): Promise<Claimed | null> {
  return env.DB.prepare(
    `UPDATE jobs SET status = 'processing', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?1 AND status IN ('queued', 'processing')
     RETURNING id, user_id, kind, period, project_name, text, dialect, voice, tone, audio_key, file_name`,
  )
    .bind(jobId)
    .first<Claimed>();
}

export async function processJob(jobId: string): Promise<void> {
  const job = await claim(jobId);
  if (!job) return;
  try {
    if (job.kind === "speech") await makeSpeech(job);
    else await makeTranscript(job);
  } catch (error) {
    console.error(`job ${jobId} failed`, error);
    const reason = error instanceof JobFailure ? error.message : "Something went wrong while making this job.";
    await settleReleased(jobId, "failed", reason);
  }
}

function label(job: Claimed): string {
  return job.project_name || job.file_name || job.text.slice(0, 60) || "Untitled";
}

async function makeSpeech(job: Claimed) {
  const voice = VOICES.find((v) => v.id === job.voice);
  const dialect = DIALECTS.find((d) => d.id === job.dialect) ?? DIALECTS[0];
  if (!voice) throw new JobFailure("This voice is no longer offered.");
  const instructions = `Speak in ${dialect.hint}, with natural Arabic pronunciation for that dialect. ${job.tone}`.trim();
  const parts: Uint8Array[] = [];
  for (const chunk of splitIntoChunks(job.text)) {
    parts.push(await speak({ text: chunk, voice: voice.base, instructions }));
  }
  const audio = joinMp3(parts);
  const duration = mp3Duration(audio);
  if (!duration) throw new JobFailure("Failed: the speech service sent back no audio.");
  const key = `${encodeURIComponent(job.user_id)}/${job.id}.mp3`;
  await env.audio.put(key, audio, { httpMetadata: { contentType: "audio/mpeg" } });
  const settled = await settleCharged(
    { id: job.id, userId: job.user_id, kind: "speech", period: job.period, label: label(job) },
    "completed",
    duration,
    { audioKey: key },
  );
  // Deleted while it was being made: keep nothing.
  if (!settled) await env.audio.delete(key);
}

async function makeTranscript(job: Claimed) {
  const object = job.audio_key ? await env.audio.get(job.audio_key) : null;
  if (!object) throw new JobFailure("The uploaded recording is missing.");
  const audio = new Uint8Array(await object.arrayBuffer());
  const duration = mp3Duration(audio) ?? 0;
  const text = (await transcribe(audio, job.file_name ?? "recording.mp3")).trim();
  if (!text) {
    await settleReleased(job.id, "no_speech", null, { rawTranscript: "" });
    return;
  }
  await settleCharged(
    { id: job.id, userId: job.user_id, kind: "transcription", period: job.period, label: label(job) },
    "ready",
    duration,
    { rawTranscript: text },
  );
}
