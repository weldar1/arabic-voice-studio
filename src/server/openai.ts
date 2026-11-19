// Speech and transcription through the Gateway's OpenAI provider. The key
// stays on the Gateway; a missing one is a refusal the pages show.
import { env } from "cloudflare:workers";
import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
  refusalFromError,
  type GatewayCallFor,
  type GatewayRefusal,
} from "@every-app/sdk/server";

const SPEECH_MODEL = "gpt-4o-mini-tts";
const TRANSCRIBE_MODEL = "gpt-4o-transcribe";
const ATTEMPTS = 3;

const NOT_CONFIGURED = new Set([
  "ai_provider_not_configured",
  "ai_default_not_configured",
  "integration_not_configured",
]);

export interface SpeechSetup {
  configured: boolean;
  setup: string | null;
  command: string | null;
}

/** A failure the person reads on the job. */
export class JobFailure extends Error {}

function url(path: string) {
  return `${aiBaseUrl("openai")}${path}`;
}

function setupOf(refusal: GatewayRefusal): SpeechSetup {
  return {
    configured: false,
    setup: refusal.setup ?? "An admin adds an OpenAI key to the Gateway.",
    command: refusal.command ?? "everyapp provider add openai",
  };
}

/**
 * Whether speech can be made now. Sends the provider an empty request: the
 * Gateway refuses it when no key is set, and the provider answers 400 when
 * one is, without making any audio.
 */
export async function speechSetup(): Promise<SpeechSetup> {
  try {
    const response = await createGatewayFetch({ env })(url("/audio/speech"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const refusal = await gatewayRefusal(response);
    if (!response.bodyUsed) await response.body?.cancel();
    if (refusal && NOT_CONFIGURED.has(refusal.code)) return setupOf(refusal);
    return { configured: true, setup: null, command: null };
  } catch (error) {
    const refusal = refusalFromError(error);
    if (refusal && NOT_CONFIGURED.has(refusal.code)) return setupOf(refusal);
    throw error;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Queue work: no person's request, so the organization's background work. */
function background(): GatewayCallFor {
  const organizationId = (env as { EVERY_APP_ORG_ID?: string }).EVERY_APP_ORG_ID;
  return organizationId ? { background: true, organizationId } : { background: true };
}

/** Calls the provider, trying again on a network error, 429 or 5xx. */
async function callWithRetries(
  path: string,
  init: () => RequestInit,
): Promise<Response> {
  const call = createGatewayFetch({ env, for: background() });
  let lastProblem = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await call(url(path), init());
    } catch (error) {
      const refusal = refusalFromError(error);
      if (refusal) throw failureOf(refusal);
      lastProblem = "the speech service could not be reached";
      await sleep(attempt * 1000);
      continue;
    }
    const refusal = await gatewayRefusal(response);
    if (refusal) throw failureOf(refusal);
    if (response.ok) return response;
    const detail = await response.text().catch(() => "");
    lastProblem = `the speech service answered ${response.status}${messageIn(detail)}`;
    if (response.status !== 429 && response.status < 500) break;
    await sleep(attempt * 1000);
  }
  throw new JobFailure(`Failed: ${lastProblem}.`);
}

function messageIn(body: string): string {
  try {
    const message = (JSON.parse(body) as { error?: { message?: string } }).error?.message;
    return message ? ` (${message.slice(0, 200)})` : "";
  } catch {
    return "";
  }
}

function failureOf(refusal: GatewayRefusal): JobFailure {
  if (NOT_CONFIGURED.has(refusal.code)) {
    return new JobFailure("Speech isn't set up on this Gateway: an admin needs to add an OpenAI key.");
  }
  return new JobFailure(`The Gateway refused the call: ${refusal.message || refusal.code}.`);
}

/** One piece of text spoken as MP3. */
export async function speak(input: {
  text: string;
  voice: string;
  instructions: string;
}): Promise<Uint8Array> {
  const response = await callWithRetries("/audio/speech", () => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: SPEECH_MODEL,
      voice: input.voice,
      input: input.text,
      instructions: input.instructions,
      response_format: "mp3",
    }),
  }));
  return new Uint8Array(await response.arrayBuffer());
}

/** The Arabic text spoken in an MP3. */
export async function transcribe(audio: Uint8Array, fileName: string): Promise<string> {
  const response = await callWithRetries("/audio/transcriptions", () => {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), fileName);
    form.set("model", TRANSCRIBE_MODEL);
    form.set("language", "ar");
    form.set("response_format", "json");
    return { method: "POST", body: form };
  });
  const body = (await response.json()) as { text?: unknown };
  return typeof body.text === "string" ? body.text : "";
}
