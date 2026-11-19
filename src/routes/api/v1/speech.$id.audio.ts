import { createFileRoute } from "@tanstack/react-router";
import { apiMember, audioResponse, notFound } from "@/server/api";
import { getJobAudio } from "@/server/jobs";

export const Route = createFileRoute("/api/v1/speech/$id/audio")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const user = await apiMember(request);
        if (user instanceof Response) return user;
        const found = await getJobAudio(user.id, params.id);
        if (!found || found.job.kind !== "speech") return notFound();
        return audioResponse(found.object, found.job.projectName, "speech", true);
      },
    },
  },
});
