import { createServerFn } from "@tanstack/react-start";
import * as jobs from "@/server/jobs";
import { QuotaError } from "@/server/usage";
import { memberMiddleware } from "./member";

export const getTranscriptions = createServerFn()
  .middleware([memberMiddleware])
  .handler(({ context: { user } }) => jobs.listJobs(user.id, { kind: "transcription", limit: 50 }));

export const uploadRecording = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => {
    const file = data instanceof FormData ? data.get("file") : null;
    if (!(file instanceof File)) throw new Error("Choose an MP3 file.");
    return file;
  })
  .handler(async ({ data, context: { user } }) => {
    try {
      return await jobs.submitTranscription(user.id, data);
    } catch (error) {
      if (error instanceof jobs.UploadError || error instanceof QuotaError) throw new Error(error.message);
      throw error;
    }
  });

export const getTranscription = createServerFn()
  .middleware([memberMiddleware])
  .validator((data: unknown) => jobs.jobIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const job = await jobs.getJob(user.id, data.id);
    if (!job || job.kind !== "transcription") return null;
    return {
      id: job.id,
      status: job.status,
      fileName: job.fileName ?? "recording.mp3",
      durationSeconds: job.durationSeconds,
      chargedSeconds: job.chargedSeconds,
      transcript: job.transcript ?? "",
      rawTranscript: job.rawTranscript ?? "",
      revision: job.revision,
      error: job.error,
      createdAt: job.createdAt,
    };
  });

export const saveTranscript = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => jobs.saveTranscriptInput.parse(data))
  .handler(({ data, context: { user } }) => jobs.saveTranscript(user.id, data));
