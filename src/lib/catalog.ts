// What a person picks from: dialects, voices and tone presets. Shared by the
// pages, the server and the API.

export const TEXT_LIMIT = 10_000;
export const TONE_LIMIT = 500;
export const PROJECT_NAME_LIMIT = 120;
export const DRAFT_LIMIT = 20;
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_MAX_SECONDS = 120;

export const DIALECTS = [
  { id: "msa", name: "Modern Standard Arabic", hint: "formal Modern Standard Arabic (fusha)" },
  { id: "najdi", name: "Saudi Najdi", hint: "the Najdi dialect of central Saudi Arabia" },
  { id: "hijazi", name: "Saudi Hijazi", hint: "the Hijazi dialect of western Saudi Arabia" },
  { id: "egyptian", name: "Cairene Egyptian", hint: "the Egyptian dialect as spoken in Cairo" },
  { id: "gulf", name: "General Gulf", hint: "a general Gulf (Khaleeji) dialect" },
  { id: "levantine", name: "Levantine", hint: "the Levantine (Shami) dialect" },
  { id: "moroccan", name: "Moroccan", hint: "Moroccan Darija" },
  { id: "emirati", name: "Emirati", hint: "the Emirati dialect" },
  { id: "kuwaiti", name: "Kuwaiti", hint: "the Kuwaiti dialect" },
  { id: "qatari", name: "Qatari", hint: "the Qatari dialect" },
  { id: "bahraini", name: "Bahraini", hint: "the Bahraini dialect" },
  { id: "omani", name: "Omani", hint: "the Omani dialect" },
  { id: "iraqi", name: "Iraqi", hint: "the Iraqi dialect as spoken in Baghdad" },
  { id: "sudanese", name: "Sudanese", hint: "the Sudanese dialect" },
  { id: "algerian", name: "Algerian", hint: "Algerian Darja" },
  { id: "tunisian", name: "Tunisian", hint: "the Tunisian dialect" },
] as const;

export type DialectId = (typeof DIALECTS)[number]["id"];

/** Each voice is one of the provider's voices under a name of the app's own. */
export const VOICES = [
  { id: "karim", name: "Karim", gender: "male", base: "onyx", description: "Deep, steady" },
  { id: "tariq", name: "Tariq", gender: "male", base: "ash", description: "Clear, confident" },
  { id: "yusuf", name: "Yusuf", gender: "male", base: "echo", description: "Bright, even" },
  { id: "hadi", name: "Hadi", gender: "male", base: "verse", description: "Expressive" },
  { id: "noor", name: "Noor", gender: "female", base: "nova", description: "Warm, natural" },
  { id: "huda", name: "Huda", gender: "female", base: "shimmer", description: "Soft, calm" },
  { id: "mariam", name: "Mariam", gender: "female", base: "coral", description: "Lively" },
  { id: "rana", name: "Rana", gender: "female", base: "sage", description: "Composed" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export const TONE_PRESETS = [
  { label: "Calm", text: "Speak calmly and slowly, with gentle pauses between sentences." },
  { label: "News", text: "Read like a news presenter: clear, neutral and measured." },
  { label: "Advert", text: "Energetic and upbeat, like a radio advertisement." },
  { label: "Story", text: "Warm storytelling voice, expressive but unhurried." },
  { label: "Formal", text: "Formal and respectful, suitable for an official announcement." },
] as const;

export const isDialect = (id: unknown): id is DialectId =>
  DIALECTS.some((d) => d.id === id);
export const isVoice = (id: unknown): id is VoiceId =>
  VOICES.some((v) => v.id === id);
export const dialectName = (id: string | null) =>
  DIALECTS.find((d) => d.id === id)?.name ?? "—";
export const voiceName = (id: string | null) =>
  VOICES.find((v) => v.id === id)?.name ?? "—";

/** Seconds of audio reserved for a text before it is spoken. */
export function estimateSpeechSeconds(text: string): number {
  return Math.max(1, Math.ceil(text.length / 12));
}

/** "Morning bulletin" → "Morning bulletin.mp3"; unsafe characters dropped. */
export function downloadName(projectName: string, fallback: string, ext: string) {
  const clean = projectName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .trim()
    .slice(0, PROJECT_NAME_LIMIT);
  return `${clean || fallback}.${ext}`;
}
