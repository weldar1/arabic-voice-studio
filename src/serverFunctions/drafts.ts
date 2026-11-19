import { createServerFn } from "@tanstack/react-start";
import * as drafts from "@/server/drafts";
import { memberMiddleware } from "./member";

export const getDrafts = createServerFn()
  .middleware([memberMiddleware])
  .handler(({ context: { user } }) => drafts.listDrafts(user.id));

/** Saves the form as a new draft; also how an exported file comes back in. */
export const createDraft = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => drafts.draftContent.parse(data))
  .handler(async ({ data, context: { user } }) => {
    try {
      return await drafts.createDraft(user.id, data);
    } catch (error) {
      if (error instanceof drafts.DraftLimitError) throw new Error(error.message);
      throw error;
    }
  });

export const updateDraft = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => drafts.updateDraftInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await drafts.updateDraft(user.id, data))) throw new Error("That draft doesn't exist.");
    return { ok: true };
  });

export const renameDraft = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => drafts.renameDraftInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await drafts.renameDraft(user.id, data))) throw new Error("That draft doesn't exist.");
    return { ok: true };
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([memberMiddleware])
  .validator((data: unknown) => drafts.draftIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await drafts.deleteDraft(user.id, data.id))) throw new Error("That draft doesn't exist.");
    return { ok: true };
  });
