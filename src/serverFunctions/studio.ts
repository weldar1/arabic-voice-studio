import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDraft } from "@/server/drafts";
import * as jobs from "@/server/jobs";
import { speechSetup } from "@/server/openai";
import { QuotaError } from "@/server/usage";
import { memberMiddleware } from "./member";

export const getStudio = createServerFn()
  .middleware([memberMiddleware])
  .validator((data: unknown) => z.object({ draftId: z.string().max(64).optional() }).parse(data ?? {}))
  .handler(async ({ data, context: { user } }) => {
    const [setup, recent, draft] = await Promise.all([
      speechSetup(),
      jobs.listJobs(user.id, { kind: "speech", limit: 6 }),
      data.draftId ? getDraft(user.id, data.draftId) : null,
    ]);
    return { setup, recent, draft };
  });

export const getRecentSpeech = createServerFn()
  .middleware([memberMiddleware])
  .handler(({ context: { user } }) => jobs.listJobs(user.id, { kind: "speech", limit: 6 }));

export const generateSpeech = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => jobs.speechInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const setup = await speechSetup();
    if (!setup.configured) throw new Error("Speech isn't set up yet.");
    try {
      return await jobs.submitSpeech(user.id, data);
    } catch (error) {
      if (error instanceof QuotaError || error instanceof jobs.TextLimitError) throw new Error(error.message);
      throw error;
    }
  });
