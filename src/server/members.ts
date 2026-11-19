import { sql } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";

interface Person {
  id: string;
  email: string;
}

/** Records the member on first sight and keeps their email current. */
export async function rememberMember(user: Person): Promise<void> {
  await db
    .insert(members)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({
      target: members.id,
      set: { email: user.email, lastSeenAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` },
    });
}
