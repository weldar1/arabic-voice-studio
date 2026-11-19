import { createFileRoute } from "@tanstack/react-router";
import { apiMember } from "@/server/api";
import { getBalance } from "@/server/usage";

export const Route = createFileRoute("/api/v1/usage")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const user = await apiMember(request);
        if (user instanceof Response) return user;
        return Response.json(await getBalance(user.id));
      },
    },
  },
});
