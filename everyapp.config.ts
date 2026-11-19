import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "arabic-voice-studio",
  name: "Arabic Voice Studio",
  description:
    "Turns Arabic text into speech in sixteen dialects and transcribes Arabic recordings, within a monthly allowance per member.",
  resources: {
    d1: ["DB"],
    r2: ["audio"],
    queues: [{ name: "jobs", consumer: { maxBatchSize: 1, maxBatchTimeout: 1, maxRetries: 2 } }],
  },
  providers: [
    {
      id: "openai",
      why: "Speaks the text and transcribes uploaded recordings.",
      docs: "https://platform.openai.com/api-keys",
    },
  ],
  features: {
    speech: {
      name: "Speech and transcription",
      why: "Generates speech and transcribes recordings.",
      providers: ["openai"],
      steps: [
        "Create an API key at https://platform.openai.com/api-keys",
        "Add it to the Gateway: `everyapp provider add openai`",
      ],
    },
  },
});
