import { createFileRoute } from "@tanstack/react-router";
import { DIALECTS } from "@/lib/catalog";
import { apiMember } from "@/server/api";

export const Route = createFileRoute("/api/v1/dialects")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const user = await apiMember(request);
        if (user instanceof Response) return user;
        return Response.json({ dialects: DIALECTS.map(({ id, name }) => ({ id, name })) });
      },
    },
  },
});
