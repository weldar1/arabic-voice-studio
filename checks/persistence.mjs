// Jobs, audio, the ledger, drafts and the allowance survive a restart.
import { startWithSpeech, expect, waitForJob, submitSpeech } from "./lib.mjs";

const runtime = await startWithSpeech();
try {
  const made = await submitSpeech(runtime, "member", "keep-1", { text: "نشرة الطقس لهذا اليوم: الجو مشمس.", voice: "huda", dialect: "emirati", projectName: "Weather" });
  expect(made.status).toBe(202);
  const job = await waitForJob(runtime, "member", made.body.jobId);
  expect(job.status).toBe("completed");
  const audio = Buffer.from(await (await runtime.fetch(`/api/v1/speech/${job.id}/audio`, { role: "member" })).arrayBuffer());
  const usage = await (await runtime.fetch("/api/v1/usage", { role: "member" })).json();

  const ctx = await runtime.context("member");
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByTestId("speech-text").fill("مسودة نشرة الطقس");
  await page.getByTestId("save-draft-button").click();
  await page.getByTestId("draft-name").fill("Weather draft");
  await page.getByTestId("draft-save-confirm").click();
  await page.goto("/drafts");
  await expect(page.getByTestId("draft-row").filter({ hasText: "Weather draft" })).toBeVisible();
  await ctx.close();

  await runtime.restart();

  const after = await (await runtime.fetch(`/api/v1/speech/${job.id}`, { role: "member" })).json();
  expect(after.status).toBe("completed");
  expect(after.chargedSeconds).toBe(job.chargedSeconds);
  const audioAfter = Buffer.from(await (await runtime.fetch(`/api/v1/speech/${job.id}/audio`, { role: "member" })).arrayBuffer());
  expect(audioAfter.equals(audio)).toBe(true);
  const usageAfter = await (await runtime.fetch("/api/v1/usage", { role: "member" })).json();
  expect(usageAfter.usedSeconds).toBe(usage.usedSeconds);
  const ctx2 = await runtime.context("member");
  const page2 = await ctx2.newPage();
  await page2.goto("/drafts");
  await expect(page2.getByTestId("draft-row").filter({ hasText: "Weather draft" })).toBeVisible();
  await page2.goto("/library");
  await expect(page2.getByTestId("library-row").filter({ hasText: "Weather" })).toBeVisible();
  await ctx2.close();
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
