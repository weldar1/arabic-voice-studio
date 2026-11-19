// Helpers for the JSON API under /api/v1 and the audio downloads.
import { env } from "cloudflare:workers";
import { getEveryAppUser, type EveryAppUser } from "@every-app/sdk/server";
import { downloadName } from "@/lib/catalog";
import { rememberMember } from "@/server/members";

export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

/** The member who called, or the 401 to send back. */
export async function apiMember(request: Request): Promise<EveryAppUser | Response> {
  const user = await getEveryAppUser(request, env);
  if (!user) return apiError(401, "unauthorized", "Sign in through the Gateway.");
  await rememberMember(user);
  return user;
}

export const notFound = () => apiError(404, "not_found", "No job with that id.");

/** An MP3 from storage, inline or as a named download. */
export function audioResponse(object: R2ObjectBody, projectName: string, fallback: string, download: boolean) {
  const name = downloadName(projectName, fallback, "mp3");
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(object.body, {
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(object.size),
      "cache-control": "private, no-store",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
