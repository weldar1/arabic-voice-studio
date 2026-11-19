// Who may do what: private paths, no sign-in page of the app's own, no public routes,
// one member's objects hidden from and unchangeable by another, admin-only allowance,
// and the generator's state when speech is not configured.
import { startWithSpeech, setSpeechConfigured, expect, mp3, json, waitForJob, submitSpeech, captureServerCall, replay } from "./lib.mjs";

const runtime = await startWithSpeech();
const step = (name) => console.log(`- ${name}`);
try {
  step("private paths");
  await runtime.assertPrivateAccess(["/", "/library", "/drafts", "/transcribe", "/usage", "/api/v1/voices", "/api/v1/dialects", "/api/v1/usage"]);
  for (const role of [undefined, "outsider"]) {
    const r = await runtime.fetch("/api/v1/speech", json(role, "POST", { text: "مرحبا", voice: "karim" }, { "idempotency-key": "anon" }));
    expect([401, 403]).toContain(r.status);
  }

  step("no public routes and no sign-in page");
  expect(runtime.manifest.public ?? []).toEqual([]);
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/register", "/logout"]) {
    const r = await runtime.fetch(path, { role: "member" });
    expect(r.status, path).toBe(404);
  }
  const visitor = await runtime.context(null);
  const anonPage = await visitor.newPage();
  const anon = await anonPage.goto("/");
  expect([401, 403]).toContain(anon.status());
  await expect(anonPage.locator("input[type=password]")).toHaveCount(0);
  await visitor.close();

  step("member objects");
  const voice = "karim";
  const made = await submitSpeech(runtime, "member", "private-1", { text: "رسالة خاصة بالعضو.", voice, projectName: "Member secret" });
  expect(made.status).toBe(202);
  const memberJob = await waitForJob(runtime, "member", made.body.jobId);
  expect(memberJob.status).toBe("completed");
  const sameKey = await submitSpeech(runtime, "owner", "private-1", { text: "رسالة المالك.", voice });
  expect(sameKey.status).toBe(202);
  expect(sameKey.body.jobId).not.toBe(made.body.jobId);
  for (const path of [`/api/v1/speech/${made.body.jobId}`, `/api/v1/speech/${made.body.jobId}/audio`, `/files/${made.body.jobId}`]) {
    const r = await runtime.fetch(path, { role: "owner" });
    expect(r.status, path).toBe(404);
    const o = await runtime.fetch(path, { role: "outsider" });
    expect([401, 403, 404]).toContain(o.status);
  }

  const memberCtx = await runtime.context("member");
  const page = await memberCtx.newPage();
  await page.goto("/transcribe");
  await page.getByTestId("transcribe-file").setInputFiles({ name: "member-call.mp3", mimeType: "audio/mpeg", buffer: mp3(8) });
  await page.getByTestId("transcribe-submit").click();
  await expect(page.getByTestId("transcription-status")).toHaveText("Ready", { timeout: 30_000 });
  const transcriptionId = page.url().split("/").pop();
  const saveCall = await captureServerCall(page, async () => {
    await page.getByTestId("transcript-text").fill("نص العضو");
    await page.getByTestId("transcript-save").click();
  });
  await expect(page.getByTestId("transcript-revision")).toContainText("2");

  await page.goto("/");
  await page.getByTestId("speech-text").fill("مسودة خاصة");
  await page.getByTestId("save-draft-button").click();
  await page.getByTestId("draft-name").fill("Member draft");
  await page.getByTestId("draft-save-confirm").click();
  await page.goto("/drafts");
  const draftRow = page.getByTestId("draft-row").filter({ hasText: "Member draft" });
  await expect(draftRow).toBeVisible();
  const draftHref = await draftRow.getByTestId("draft-open").getAttribute("href");
  const draftId = new URL(draftHref, "http://x").searchParams.get("draft");
  await draftRow.getByTestId("draft-rename").click();
  await page.getByTestId("draft-name").fill("Member draft renamed");
  const renameCall = await captureServerCall(page, () => page.getByTestId("draft-rename-confirm").click());
  await expect(page.getByTestId("draft-row").filter({ hasText: "Member draft renamed" })).toBeVisible();

  step("another member sees none of it");
  const ownerCtx = await runtime.context("owner");
  const ownerPage = await ownerCtx.newPage();
  await ownerPage.goto("/library");
  await expect(ownerPage.getByText("Member secret")).toHaveCount(0);
  await expect(ownerPage.getByText("member-call")).toHaveCount(0);
  await ownerPage.goto(`/transcribe/${transcriptionId}`);
  await expect(ownerPage.getByTestId("transcript-text")).toHaveCount(0);
  await expect(ownerPage.getByText("نص العضو")).toHaveCount(0);
  await ownerPage.goto("/drafts");
  await expect(ownerPage.getByText("Member draft")).toHaveCount(0);
  await ownerPage.goto(`/?draft=${draftId}`);
  await expect(ownerPage.getByTestId("speech-text")).toHaveValue("");
  r404(await runtime.fetch(`/files/${transcriptionId}`, { role: "owner" }));

  step("another member changes none of it");
  // The member's own calls replayed by the owner: refused, and nothing changed.
  await replay(runtime, saveCall, "owner", (b) => b.replace("نص العضو", "تغيير المالك").replace(/("expectedRevision":)1/, "$12"));
  await replay(runtime, renameCall, "owner", (b) => b.replace("Member draft renamed", "Owner was here"));
  await page.goto(`/transcribe/${transcriptionId}`);
  await expect(page.getByTestId("transcript-text")).toHaveValue("نص العضو");
  await page.goto("/drafts");
  await expect(page.getByTestId("draft-row").filter({ hasText: "Member draft renamed" })).toBeVisible();
  await expect(page.getByText("Owner was here")).toHaveCount(0);
  // Owner's delete call aimed at the member's job.
  const own = await submitSpeech(runtime, "owner", "owner-1", { text: "رسالة المالك الثانية.", voice, projectName: "Owner note" });
  await waitForJob(runtime, "owner", own.body.jobId);
  await ownerPage.goto("/library");
  await ownerPage.getByTestId("library-row").filter({ hasText: "Owner note" }).getByTestId("library-delete").click();
  const deleteCall = await captureServerCall(ownerPage, () => ownerPage.getByRole("button", { name: "Delete", exact: true }).click());
  await replay(runtime, deleteCall, "owner", (b) => b.replaceAll(own.body.jobId, made.body.jobId));
  expect((await runtime.fetch(`/api/v1/speech/${made.body.jobId}`, { role: "member" })).status).toBe(200);
  expect((await runtime.fetch(`/api/v1/speech/${made.body.jobId}/audio`, { role: "member" })).status).toBe(200);

  step("admin-only allowance");
  await page.goto("/usage");
  await expect(page.getByTestId("usage-used")).toBeVisible();
  await expect(page.getByTestId("allowance-input")).toHaveCount(0);
  await expect(page.getByTestId("member-usage-row")).toHaveCount(0);
  await ownerPage.goto("/usage");
  await ownerPage.getByTestId("allowance-input").fill("777");
  const allowanceCall = await captureServerCall(ownerPage, () => ownerPage.getByTestId("allowance-save").click());
  await expect(ownerPage.getByTestId("allowance-current")).toContainText("777");
  const refused = await replay(runtime, allowanceCall, "member", (b) => b.replace("777", "5"));
  expect(refused.status).not.toBe(200);
  const usage = await (await runtime.fetch("/api/v1/usage", { role: "member" })).json();
  expect(usage.allowanceSeconds).toBe(777);

  step("speech not configured");
  await setSpeechConfigured(runtime, false);
  const off = await submitSpeech(runtime, "member", "off-1", { text: "مرحبا", voice });
  expect(off.status).toBe(503);
  expect(off.body.error.code).toBe("speech_not_configured");
  await page.goto("/");
  await expect(page.getByTestId("speech-setup")).toBeVisible();
  await expect(page.getByTestId("speech-setup")).toContainText("OpenAI");
  await memberCtx.close();
  await ownerCtx.close();
  console.log("authorization: ok");
} finally {
  await runtime.close();
}

function r404(response) {
  expect(response.status).toBe(404);
}
