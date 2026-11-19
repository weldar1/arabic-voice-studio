// Main path of every feature: API (F006) with speech jobs (F001) and the allowance (F004),
// then one member's browser journey through studio, drafts (F003), transcription (F005)
// and library (F002), and a phone-sized smoke.
import { startWithSpeech, expect, mp3, json, waitForJob, submitSpeech, captureServerCall, replay } from "./lib.mjs";

const runtime = await startWithSpeech();
const step = (name) => console.log(`- ${name}`);
try {
  step("catalog");
  const voices = await (await runtime.fetch("/api/v1/voices", { role: "member" })).json();
  expect(voices.voices).toHaveLength(8);
  expect(voices.voices.filter((v) => v.gender === "male")).toHaveLength(4);
  expect(voices.voices.filter((v) => v.gender === "female")).toHaveLength(4);
  const dialects = await (await runtime.fetch("/api/v1/dialects", { role: "member" })).json();
  expect(dialects.dialects).toHaveLength(16);
  expect(dialects.dialects.map((d) => d.name)).toEqual(expect.arrayContaining(["Modern Standard Arabic", "Saudi Najdi", "Cairene Egyptian", "Levantine", "Tunisian"]));
  const voice = voices.voices[0].id;

  step("API validation");
  let r = await runtime.fetch("/api/v1/speech", json("member", "POST", { text: "مرحبا", voice }));
  expect(r.status).toBe(400);
  expect((await r.json()).error.code).toBe("idempotency_key_required");
  r = await runtime.fetch("/api/v1/speech", json("member", "POST", { text: "مرحبا", voice }, { "idempotency-key": "k".repeat(129) }));
  expect(r.status).toBe(400);
  let res = await submitSpeech(runtime, "member", "too-long", { text: "ا".repeat(10_001), voice });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe("text_limit_exceeded");
  res = await submitSpeech(runtime, "member", "no-voice", { text: "مرحبا" });
  expect(res.status).toBe(400);
  res = await submitSpeech(runtime, "member", "bad-voice", { text: "مرحبا", voice: "nobody" });
  expect(res.status).toBe(400);
  r = await runtime.fetch("/api/v1/speech/00000000-0000-0000-0000-000000000000", { role: "member" });
  expect(r.status).toBe(404);
  expect((await r.json()).error.code).toBe("not_found");

  step("API job: submit, idempotency, poll, download");
  const text = "أهلا وسهلا بكم. هذا تسجيل تجريبي للنشرة الصوتية! هل أنتم مستعدون؟ ".repeat(40); // long text, several chunks
  expect(text.length).toBeLessThanOrEqual(10_000);
  const payload = { text, voice, dialect: "egyptian", tone: "Warm and friendly", projectName: "Morning bulletin" };
  const first = await submitSpeech(runtime, "member", "bulletin-1", payload);
  expect(first.status).toBe(202);
  expect(first.body.jobId).toBeTruthy();
  expect(first.body.reservedSeconds).toBeGreaterThan(0);
  const again = await submitSpeech(runtime, "member", "bulletin-1", payload);
  expect(again.status).toBe(202);
  expect(again.body.jobId).toBe(first.body.jobId);
  const conflict = await submitSpeech(runtime, "member", "bulletin-1", { ...payload, text: "نص مختلف" });
  expect(conflict.status).toBe(409);
  const done = await waitForJob(runtime, "member", first.body.jobId);
  expect(done.status).toBe("completed");
  expect(done.dialect).toBe("egyptian");
  expect(done.chargedSeconds).toBe(Math.ceil(done.durationSeconds));
  expect(done.chargedSeconds).toBeLessThan(first.body.reservedSeconds);
  expect(new URL(done.audioUrl).hostname).toBe(runtime.hostname);
  const audio = await runtime.fetch(new URL(done.audioUrl).pathname, { role: "member" });
  expect(audio.status).toBe(200);
  expect(audio.headers.get("content-type")).toContain("audio/mpeg");
  expect(audio.headers.get("content-disposition")).toContain("Morning bulletin");
  const bytes = Buffer.from(await audio.arrayBuffer());
  expect(bytes[0]).toBe(0xff);
  // Stitched from several chunks: 0.05 s per character in the stand-in, so the whole text's length.
  expect(Math.abs(done.durationSeconds - text.length * 0.05)).toBeLessThan(2);
  let usage = await (await runtime.fetch("/api/v1/usage", { role: "member" })).json();
  expect(usage.usedSeconds).toBe(done.chargedSeconds);
  expect(usage.reservedSeconds).toBe(0);

  step("failed job releases its reservation and shows a reason");
  const failed = await submitSpeech(runtime, "member", "fail-1", { text: "هذا FAILTEST نص", voice });
  expect(failed.status).toBe(202);
  const failedJob = await waitForJob(runtime, "member", failed.body.jobId);
  expect(failedJob.status).toBe("failed");
  expect(failedJob.error).toBeTruthy();
  expect(failedJob.chargedSeconds).toBe(0);
  expect(failedJob.audioUrl).toBeNull();
  usage = await (await runtime.fetch("/api/v1/usage", { role: "member" })).json();
  expect(usage.usedSeconds).toBe(done.chargedSeconds);
  expect(usage.reservedSeconds).toBe(0);

  step("admin sets the allowance");
  const owner = await runtime.context("owner");
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/usage");
  await ownerPage.getByTestId("allowance-input").fill(String(usage.usedSeconds + 60));
  await ownerPage.getByTestId("allowance-save").click();
  await expect(ownerPage.getByTestId("allowance-current")).toContainText(`${usage.usedSeconds + 60}`);
  await expect(ownerPage.getByTestId("member-usage-row").filter({ hasText: "member@example.test" })).toBeVisible();

  step("quota refusals");
  usage = await (await runtime.fetch("/api/v1/usage", { role: "member" })).json();
  expect(usage.allowanceSeconds).toBe(usage.usedSeconds + 60);
  expect(usage.remainingSeconds).toBe(60);
  const tooBig = await submitSpeech(runtime, "member", "big-1", { text: "ب".repeat(2000), voice });
  expect(tooBig.status).toBe(429);
  expect(tooBig.body.error.code).toBe("quota_exceeded");
  expect(tooBig.body.error.reason).toBe("exceeds_remaining");
  const slow = await submitSpeech(runtime, "member", "slow-1", { text: "SLOWTEST " + "ت".repeat(400), voice });
  expect(slow.status).toBe(202);
  usage = await (await runtime.fetch("/api/v1/usage", { role: "member" })).json();
  expect(usage.reservedSeconds).toBe(slow.body.reservedSeconds);
  const blocked = await submitSpeech(runtime, "member", "held-1", { text: "ث".repeat(400), voice });
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.reason).toBe("held_by_other_jobs");
  expect(blocked.body.error.message).toMatch(/in progress/i);
  await waitForJob(runtime, "member", slow.body.jobId);
  // Unlimited again for the journey.
  await ownerPage.getByTestId("allowance-input").fill("0");
  await ownerPage.getByTestId("allowance-save").click();
  await expect(ownerPage.getByTestId("allowance-current")).toContainText("Unlimited");
  await owner.close();

  step("studio: generate speech");
  const context = await runtime.context("member");
  const page = await context.newPage();
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByTestId("project-name").fill("Clinic welcome message");
  const script = "مرحبا بكم في عيادة الشفاء. مواعيد العمل من التاسعة صباحا حتى الخامسة مساء. للحجز يرجى الاتصال بنا.";
  await page.getByTestId("speech-text").fill(script);
  await expect(page.getByTestId("char-count")).toContainText(`${script.length}`);
  await expect(page.getByTestId("speech-text")).toHaveAttribute("dir", "rtl");
  await page.getByTestId("dialect-select").click();
  await page.getByRole("option", { name: "Levantine" }).click();
  await page.getByTestId("voice-select").click();
  await page.getByRole("option", { name: /Noor/ }).click();
  await page.getByRole("button", { name: "Calm" }).click();
  await expect(page.getByTestId("tone-input")).not.toHaveValue("");
  await page.getByTestId("generate-button").click();
  const card = page.getByTestId("job-card").filter({ hasText: "Clinic welcome message" }).first();
  await expect(card).toHaveAttribute("data-status", "completed", { timeout: 30_000 });
  await expect(card.getByTestId("job-audio")).toBeAttached();
  await expect(card.getByTestId("job-download")).toHaveAttribute("download", "Clinic welcome message.mp3");
  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("job-download").click()]);
  expect(download.suggestedFilename()).toBe("Clinic welcome message.mp3");

  step("studio: empty and too-long text refused");
  await page.getByTestId("speech-text").fill("");
  await expect(page.getByTestId("generate-button")).toBeDisabled();
  await page.getByTestId("speech-text").fill("ا".repeat(10_001));
  await expect(page.getByTestId("char-count")).toContainText("10,001");
  await expect(page.getByTestId("generate-button")).toBeDisabled();

  step("drafts: save, reopen, overwrite, rename, export, import, delete, limit");
  await page.getByTestId("speech-text").fill(script);
  await page.getByTestId("save-draft-button").click();
  await page.getByTestId("draft-name").fill("Clinic greeting");
  await page.getByTestId("draft-save-confirm").click();
  await page.getByRole("navigation").getByRole("link", { name: "Drafts" }).click();
  const row = page.getByTestId("draft-row").filter({ hasText: "Clinic greeting" });
  await expect(row).toBeVisible();
  await row.getByTestId("draft-open").click();
  await expect(page.getByTestId("speech-text")).toHaveValue(script);
  await expect(page.getByTestId("project-name")).toHaveValue("Clinic welcome message");
  await expect(page.getByTestId("dialect-select")).toContainText("Levantine");
  await page.getByTestId("speech-text").fill(script + " شكرا لكم.");
  await page.getByTestId("draft-overwrite").click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Drafts" }).click();
  await row.getByTestId("draft-rename").click();
  await page.getByTestId("draft-name").fill("Clinic greeting v2");
  await page.getByTestId("draft-rename-confirm").click();
  const renamed = page.getByTestId("draft-row").filter({ hasText: "Clinic greeting v2" });
  await expect(renamed).toBeVisible();
  const [exported] = await Promise.all([page.waitForEvent("download"), renamed.getByTestId("draft-export").click()]);
  const exportedJson = JSON.parse(await (await import("node:fs/promises")).readFile(await exported.path(), "utf8"));
  expect(exportedJson.text).toBe(script + " شكرا لكم.");
  expect(exportedJson.dialect).toBe("levantine");
  await page.getByTestId("draft-import-input").setInputFiles({ name: "promo.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...exportedJson, name: "Ramadan promo", text: "عروض رمضان بدأت الآن في جميع الفروع." })) });
  await expect(page.getByTestId("draft-row").filter({ hasText: "Ramadan promo" })).toBeVisible();
  await page.getByTestId("draft-import-input").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"text": 5}') });
  await expect(page.getByTestId("drafts-error")).toBeVisible();
  const importCall = await captureServerCall(page, () => page.getByTestId("draft-import-input").setInputFiles({ name: "extra.json",
    mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...exportedJson, name: "Extra" })) }));
  await expect(page.getByTestId("draft-row").filter({ hasText: "Extra" })).toBeVisible();
  for (let i = 0; i < 20; i++) await replay(runtime, importCall, "member");
  await page.reload();
  await expect(page.getByTestId("draft-row")).toHaveCount(20);
  await page.getByTestId("draft-import-input").setInputFiles({ name: "one-more.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...exportedJson, name: "One too many" })) });
  await expect(page.getByTestId("drafts-error")).toContainText("20");
  await expect(page.getByTestId("draft-row")).toHaveCount(20);
  const extra = page.getByTestId("draft-row").filter({ hasText: "Extra" });
  for (let left = await extra.count(); left > 0; left--) {
    await extra.first().getByTestId("draft-delete").click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(extra).toHaveCount(left - 1);
  }
  await expect(page.getByTestId("draft-row")).toHaveCount(2);

  step("transcription: refuse bad files, transcribe, edit with revisions");
  await page.getByRole("navigation").getByRole("link", { name: "Transcribe" }).click();
  await page.getByTestId("transcribe-file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.getByTestId("transcribe-submit").click();
  await expect(page.getByTestId("transcribe-error")).toContainText(/MP3/);
  await page.getByTestId("transcribe-file").setInputFiles({ name: "long.mp3", mimeType: "audio/mpeg", buffer: mp3(130) });
  await page.getByTestId("transcribe-submit").click();
  await expect(page.getByTestId("transcribe-error")).toContainText(/2 minutes/);
  await page.getByTestId("transcribe-file").setInputFiles({ name: "huge.mp3", mimeType: "audio/mpeg", buffer: Buffer.alloc(5 * 1024 * 1024 + 10, 0) });
  await page.getByTestId("transcribe-submit").click();
  await expect(page.getByTestId("transcribe-error")).toContainText(/5 MB/);
  await page.getByTestId("transcribe-file").setInputFiles({ name: "morning-news.mp3", mimeType: "audio/mpeg", buffer: mp3(12) });
  await page.getByTestId("transcribe-submit").click();
  await expect(page).toHaveURL(/\/transcribe\/[\w-]+$/);
  await expect(page.getByTestId("transcription-status")).toHaveText("Ready", { timeout: 30_000 });
  await expect(page.getByTestId("transcription-audio")).toBeAttached();
  await expect(page.getByTestId("transcript-text")).toHaveValue("مرحبا بكم في نشرة الأخبار الصباحية");
  await expect(page.getByTestId("transcript-revision")).toContainText("1");
  const transcriptUrl = page.url();
  const second = await context.newPage();
  await second.goto(transcriptUrl);
  await page.getByTestId("transcript-text").fill("مرحبا بكم في نشرة أخبار الصباح");
  await page.getByTestId("transcript-save").click();
  await expect(page.getByTestId("transcript-revision")).toContainText("2");
  await second.getByTestId("transcript-text").fill("نص قديم");
  await second.getByTestId("transcript-save").click();
  await expect(second.getByTestId("transcript-conflict")).toBeVisible();
  await second.close();
  await page.reload();
  await expect(page.getByTestId("transcript-text")).toHaveValue("مرحبا بكم في نشرة أخبار الصباح");
  const [txt] = await Promise.all([page.waitForEvent("download"), page.getByTestId("transcript-download").click()]);
  expect(txt.suggestedFilename()).toMatch(/\.txt$/);
  expect(await (await import("node:fs/promises")).readFile(await txt.path(), "utf8")).toBe("مرحبا بكم في نشرة أخبار الصباح");
  await page.getByRole("navigation").getByRole("link", { name: "Transcribe" }).click();
  await page.getByTestId("transcribe-file").setInputFiles({ name: "lobby-silence.mp3", mimeType: "audio/mpeg", buffer: mp3(5) });
  await page.getByTestId("transcribe-submit").click();
  await expect(page.getByTestId("transcription-status")).toHaveText("No speech", { timeout: 30_000 });

  step("usage page");
  await page.getByRole("navigation").getByRole("link", { name: "Usage" }).click();
  await expect(page.getByTestId("usage-remaining")).toContainText("Unlimited");
  await expect(page.getByTestId("ledger-row").first()).toBeVisible();
  // Charged: the API job, the slow job, the studio job and the 12 s transcription. Failed and no-speech jobs are not.
  await expect(page.getByTestId("ledger-row")).toHaveCount(4);

  step("library: filter, play, delete");
  await page.getByRole("navigation").getByRole("link", { name: "Library" }).click();
  await expect(page.getByTestId("library-row").first()).toContainText("silence"); // newest first
  await page.getByTestId("status-filter").click();
  await page.getByRole("option", { name: "Failed" }).click();
  await expect(page.getByTestId("library-row")).toHaveCount(1);
  await expect(page.getByTestId("library-row")).toHaveAttribute("data-status", "failed");
  await page.getByTestId("library-row").getByTestId("library-delete").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByTestId("library-row")).toHaveCount(0);
  r = await runtime.fetch(`/api/v1/speech/${failed.body.jobId}`, { role: "member" });
  expect(r.status).toBe(404);
  await page.getByTestId("status-filter").click();
  await page.getByRole("option", { name: "All" }).click();
  const slowRow = page.getByTestId("library-row").filter({ hasText: "SLOWTEST" });
  await slowRow.getByTestId("library-delete").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(slowRow).toHaveCount(0);
  r = await runtime.fetch(`/api/v1/speech/${slow.body.jobId}/audio`, { role: "member" });
  expect(r.status).toBe(404);
  const clinic = page.getByTestId("library-row").filter({ hasText: "Clinic welcome message" });
  await clinic.getByTestId("library-play").click();
  await expect(page.getByTestId("library-player")).toBeAttached();
  await expect(page.getByTestId("library-row").filter({ hasText: "morning-news" })).toHaveAttribute("data-kind", "transcription");
  await runtime.assertBackLink(page);
  await runtime.screenshot(page);
  await context.close();

  step("phone smoke");
  const phone = await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phonePage = await phone.newPage();
  await phonePage.goto("/");
  await expect(phonePage.getByTestId("speech-text")).toBeVisible();
  await expect(phonePage.getByTestId("generate-button")).toBeVisible();
  const overflow = await phonePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await phone.close();
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
