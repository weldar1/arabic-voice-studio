import { createMiddleware } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { rememberMember } from "@/server/members";

/** The signed-in member (`context.user`), recorded on first sight. */
export const memberMiddleware = createMiddleware({ type: "function" })
  .middleware([ensureUserMiddleware])
  .server(async ({ next, context }) => {
    await rememberMember(context.user);
    return next();
  });
