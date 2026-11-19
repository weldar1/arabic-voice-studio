// Named drafts of the generator's form, at most 20 per member.
import { and, desc, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { drafts } from "@/db/schema";
import {
  DIALECTS,
  DRAFT_LIMIT,
  PROJECT_NAME_LIMIT,
  TEXT_LIMIT,
  TONE_LIMIT,
  VOICES,
} from "@/lib/catalog";

const dialectIds = DIALECTS.map((d) => d.id) as [string, ...string[]];
const voiceIds = VOICES.map((v) => v.id) as [string, ...string[]];

const name = z.string().trim().min(1, "Give the draft a name").max(80);

/** What a draft holds; also the shape of an exported file, which import checks. */
export const draftContent = z.object({
  name,
  text: z.string().max(TEXT_LIMIT, `Text is limited to ${TEXT_LIMIT.toLocaleString("en")} characters`),
  dialect: z.enum(dialectIds),
  voice: z.enum(voiceIds),
  tone: z.string().max(TONE_LIMIT).default(""),
  projectName: z.string().max(PROJECT_NAME_LIMIT).default(""),
});
export type DraftContent = z.infer<typeof draftContent>;

export const updateDraftInput = draftContent.omit({ name: true }).extend({ id: z.string().min(1).max(64) });
export const renameDraftInput = z.object({ id: z.string().min(1).max(64), name });
export const draftIdInput = z.object({ id: z.string().min(1).max(64) });

export class DraftLimitError extends Error {
  constructor() {
    super(`You have ${DRAFT_LIMIT} drafts, the most you can keep. Delete one to save another.`);
  }
}

const shown = {
  id: drafts.id,
  name: drafts.name,
  text: drafts.text,
  dialect: drafts.dialect,
  voice: drafts.voice,
  tone: drafts.tone,
  projectName: drafts.projectName,
  updatedAt: drafts.updatedAt,
};

export function listDrafts(userId: string) {
  return db
    .select(shown)
    .from(drafts)
    .where(eq(drafts.userId, userId))
    .orderBy(desc(drafts.updatedAt), desc(drafts.id));
}

export async function getDraft(userId: string, id: string) {
  const [row] = await db
    .select(shown)
    .from(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.userId, userId)));
  return row ?? null;
}

/** Saves a new draft, unless the member already has 20: one statement, so two saves can't both slip in. */
export async function createDraft(userId: string, content: DraftContent) {
  const id = crypto.randomUUID();
  const result = await env.DB.prepare(
    `INSERT INTO drafts (id, user_id, name, text, dialect, voice, tone, project_name)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
     WHERE (SELECT count(*) FROM drafts WHERE user_id = ?2) < ?9`,
  )
    .bind(id, userId, content.name, content.text, content.dialect, content.voice, content.tone, content.projectName, DRAFT_LIMIT)
    .run();
  if (result.meta.changes === 0) throw new DraftLimitError();
  return { id };
}

const touched = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export async function updateDraft(userId: string, { id, ...content }: z.infer<typeof updateDraftInput>) {
  const [row] = await db
    .update(drafts)
    .set({ ...content, updatedAt: touched })
    .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
    .returning({ id: drafts.id });
  return row ?? null;
}

export async function renameDraft(userId: string, { id, name }: z.infer<typeof renameDraftInput>) {
  const [row] = await db
    .update(drafts)
    .set({ name, updatedAt: touched })
    .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
    .returning({ id: drafts.id });
  return row ?? null;
}

export async function deleteDraft(userId: string, id: string) {
  const [row] = await db
    .delete(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
    .returning({ id: drafts.id });
  return row ?? null;
}
