import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { z } from "zod";
import * as usage from "@/server/usage";
import { memberMiddleware } from "./member";

export const getUsage = createServerFn()
  .middleware([memberMiddleware])
  .handler(async ({ context: { user } }) => {
    const admin = isAdmin(user);
    const [balance, charges, members] = await Promise.all([
      usage.getBalance(user.id),
      usage.listCharges(user.id),
      admin ? usage.listMemberUsage() : null,
    ]);
    return { balance, charges, admin, members };
  });

export const setAllowance = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) =>
    z.object({ seconds: z.number().int().min(0).max(10_000_000) }).parse(data),
  )
  .handler(async ({ data, context: { user } }) => {
    if (!isAdmin(user)) throw new Response("Only an admin can change the allowance.", { status: 403 });
    return { seconds: await usage.setAllowance(data.seconds) };
  });
