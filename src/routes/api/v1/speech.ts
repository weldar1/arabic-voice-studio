import { createFileRoute } from "@tanstack/react-router";
import { TEXT_LIMIT } from "@/lib/catalog";
import { apiError, apiMember } from "@/server/api";
import { IdempotencyConflictError, TextLimitError, speechInput, submitSpeech } from "@/server/jobs";
import { speechSetup } from "@/server/openai";
import { QuotaError } from "@/server/usage";

export const Route = createFileRoute("/api/v1/speech")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const user = await apiMember(request);
        if (user instanceof Response) return user;
        const key = request.headers.get("idempotency-key");
        if (!key || key.length > 128) {
          return apiError(400, "idempotency_key_required", "Send an Idempotency-Key header of 1 to 128 characters.");
        }
        const body: unknown = await request.json().catch(() => null);
        const text = (body as { text?: unknown } | null)?.text;
        if (typeof text === "string" && text.length > TEXT_LIMIT) {
          return apiError(400, "text_limit_exceeded", new TextLimitError(text.length).message, { limit: TEXT_LIMIT });
        }
        const parsed = speechInput.safeParse(body);
        if (!parsed.success) {
          return apiError(400, "invalid_request", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
        }
        const setup = await speechSetup();
        if (!setup.configured) {
          return apiError(503, "speech_not_configured", "Speech isn't set up on this Gateway.", { setup: setup.setup, command: setup.command });
        }
        try {
          const job = await submitSpeech(user.id, parsed.data, key);
          return Response.json({ jobId: job.jobId, status: "queued", reservedSeconds: job.reservedSeconds }, { status: 202 });
        } catch (error) {
          if (error instanceof IdempotencyConflictError) return apiError(409, "idempotency_conflict", error.message);
          if (error instanceof QuotaError) {
            return apiError(429, "quota_exceeded", error.message, {
              reason: error.reason,
              neededSeconds: error.needed,
              remainingSeconds: error.balance.remainingSeconds,
            });
          }
          throw error;
        }
      },
    },
  },
});
