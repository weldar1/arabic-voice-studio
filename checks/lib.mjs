// Shared by the suites: a local stand-in for the Gateway's OpenAI proxy (test
// only, never shipped) and a builder for small valid MP3 files.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";

export { expect };

const FAKE_GATEWAY = `
let configured = true;
const FRAME = 417; // MPEG-1 Layer III, 128 kbps, 44.1 kHz: 1152 samples, about 26 ms
function mp3(seconds) {
  const frames = Math.max(1, Math.round(seconds * 44100 / 1152));
  const bytes = new Uint8Array(frames * FRAME);
  for (let i = 0; i < frames; i++) bytes.set([0xff, 0xfb, 0x90, 0x00], i * FRAME);
  return bytes;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function refuse(code, status = 503) {
  return Response.json({ error: "Service Unavailable", code, message: "OpenAI has no key on this Gateway.",
    setup: "An admin adds an OpenAI key to the Gateway.", command: "everyapp provider add openai" },
    { status, headers: { "x-everyapp-error": code } });
}
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/__mode") { configured = url.searchParams.get("configured") === "1"; return new Response("ok"); }
  if (!url.pathname.startsWith("/api/ai/openai/")) return refuse("integration_not_configured");
  if (!configured) return refuse("ai_provider_not_configured");
  if (url.pathname.endsWith("/v1/audio/speech")) {
    const body = await request.json().catch(() => ({}));
    if (typeof body.input !== "string" || !body.input) return Response.json({ error: { message: "input is required" } }, { status: 400 });
    if (body.input.includes("FAILTEST")) return Response.json({ error: { message: "upstream exploded" } }, { status: 500 });
    if (body.input.includes("SLOWTEST")) await sleep(5000);
    return new Response(mp3(body.input.length * 0.05), { headers: { "content-type": "audio/mpeg" } });
  }
  if (url.pathname.endsWith("/v1/audio/transcriptions")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || form.get("language") !== "ar") return Response.json({ error: { message: "bad form" } }, { status: 400 });
    const text = String(file.name).includes("silence") ? "" : "مرحبا بكم في نشرة الأخبار الصباحية";
    return Response.json({ text });
  }
  return refuse("ai_route_not_allowed", 403);
} };`;

/** A runtime whose Gateway answers OpenAI speech and transcription calls. */
export function startWithSpeech() {
  return startRuntime({
    bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-openai-gateway" } },
    workers: [{ config: { name: "fake-openai-gateway", compatibilityDate: "2025-01-01",
      manifest: { mainModule: "gateway.mjs", modules: { "gateway.mjs": { type: "esm", contents: FAKE_GATEWAY } } } } }],
  });
}

export async function setSpeechConfigured(runtime, on) {
  const worker = await runtime.mf.getWorker("fake-openai-gateway");
  await worker.fetch(`http://gateway/__mode?configured=${on ? 1 : 0}`);
}

/** A valid MP3 of about `seconds` seconds. */
export function mp3(seconds) {
  const FRAME = 417;
  const frames = Math.max(1, Math.round((seconds * 44100) / 1152));
  const bytes = Buffer.alloc(frames * FRAME);
  for (let i = 0; i < frames; i++) bytes.set([0xff, 0xfb, 0x90, 0x00], i * FRAME);
  return bytes;
}

export const json = (role, method, body, headers = {}) => ({
  role, method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});

/** Polls an API job until it leaves queued/processing. */
export async function waitForJob(runtime, role, id) {
  for (let i = 0; i < 120; i++) {
    const response = await runtime.fetch(`/api/v1/speech/${id}`, { role });
    const job = await response.json();
    if (!["queued", "processing"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Job ${id} never finished`);
}

export async function submitSpeech(runtime, role, key, payload) {
  const response = await runtime.fetch("/api/v1/speech", json(role, "POST", payload, { "idempotency-key": key }));
  return { status: response.status, body: await response.json() };
}

/** Records the next server-function POST the page makes while `action` runs. */
export async function captureServerCall(page, action) {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/_serverFn/")),
    action(),
  ]);
  return { url: new URL(request.url()).pathname + new URL(request.url()).search, body: request.postData(), headers: await request.allHeaders() };
}

/** Replays a recorded server-function call as another role, with `swap` applied to its body. */
export function replay(runtime, call, role, swap = (b) => b) {
  const headers = Object.fromEntries(Object.entries(call.headers).filter(([k]) => !["cookie", "host", "content-length"].includes(k) && !k.startsWith(":")));
  return runtime.fetch(call.url, { role, method: "POST", headers, body: swap(call.body) });
}
