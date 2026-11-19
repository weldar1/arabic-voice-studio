import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { processJob } from "@/server/processor";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401).
const app = everyApp<Env>(async (request) => tanstackEntry.fetch(request));

export default {
  fetch: app.fetch,
  // Speech and transcription run here, one job per message.
  async queue(batch: MessageBatch<{ jobId: string }>) {
    for (const message of batch.messages) {
      await processJob(message.body.jobId);
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, { jobId: string }>;
