import { createFileRoute } from "@tanstack/react-router";
import { VOICES } from "@/lib/catalog";
import { apiMember } from "@/server/api";

export const Route = createFileRoute("/api/v1/voices")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const user = await apiMember(request);
        if (user instanceof Response) return user;
        return Response.json({
          voices: VOICES.map(({ id, name, gender, description }) => ({ id, name, gender, description })),
        });
      },
    },
  },
});
