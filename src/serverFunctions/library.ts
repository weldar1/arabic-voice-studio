import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as jobs from "@/server/jobs";
import { memberMiddleware } from "./member";

const STATUSES = ["queued", "processing", "completed", "ready", "failed", "no_speech"] as const;

export const getLibrary = createServerFn()
  .middleware([memberMiddleware])
  .validator((data: unknown) => z.object({ status: z.enum(STATUSES).optional() }).parse(data ?? {}))
  .handler(({ data, context: { user } }) => jobs.listJobs(user.id, { status: data.status }));

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => jobs.jobIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await jobs.deleteJob(user.id, data.id))) throw new Error("That job doesn't exist.");
    return { ok: true };
  });
