import { createFileRoute } from "@tanstack/react-router";
import { apiMember, notFound } from "@/server/api";
import { getJob } from "@/server/jobs";

export const Route = createFileRoute("/api/v1/speech/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const user = await apiMember(request);
        if (user instanceof Response) return user;
        const job = await getJob(user.id, params.id);
        if (!job || job.kind !== "speech") return notFound();
        const origin = new URL(request.url).origin;
        return Response.json({
          id: job.id,
          status: job.status,
          projectName: job.projectName,
          dialect: job.dialect,
          voice: job.voice,
          characters: job.characters,
          reservedSeconds: job.reservedSeconds,
          chargedSeconds: job.chargedSeconds,
          durationSeconds: job.durationSeconds,
          error: job.error,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          audioUrl: job.status === "completed" ? `${origin}/api/v1/speech/${job.id}/audio` : null,
        });
      },
    },
  },
});
