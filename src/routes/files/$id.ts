import { createFileRoute } from "@tanstack/react-router";
import { apiMember, audioResponse, notFound } from "@/server/api";
import { getJobAudio } from "@/server/jobs";

// The member's own audio for the pages: speech made, or a recording uploaded.
export const Route = createFileRoute("/files/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const user = await apiMember(request);
        if (user instanceof Response) return user;
        const found = await getJobAudio(user.id, params.id);
        if (!found) return notFound();
        const download = new URL(request.url).searchParams.has("download");
        return audioResponse(found.object, found.job.projectName, found.job.kind === "speech" ? "speech" : "recording", download);
      },
    },
  },
});
