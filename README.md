# Arabic Voice Studio

Turns Arabic text into speech in sixteen dialects and eight voices, and transcribes short Arabic recordings. Each member works within a monthly allowance of audio seconds that an admin sets.

Inspired by https://fasihtts.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Generate speech from up to 10,000 characters of Arabic text, with a dialect, a voice and an optional tone, then play or download the MP3.
- Browse, filter, play, download and delete your own past speech and transcription jobs.
- Keep up to 20 named drafts, and export or import them as JSON files.
- Share one monthly allowance of audio seconds between speech and transcription, set by an admin.
- Transcribe an Arabic MP3 of up to 2 minutes and 5 MB, then edit, copy or download the transcript.
- Submit and poll speech jobs from scripts through a JSON API under `/api/v1`.

Left out: accounts and sign-in, which your Gateway handles; paid plans and billing; designing custom voices; the Arabic-language interface.

## Setup

```sh
pnpm install
pnpm dev          # run locally
pnpm test         # unit tests
pnpm run deploy   # deploy to your Gateway
```

The app needs no secrets or settings of its own. Speech and transcription use your Gateway's OpenAI provider: add a key with `everyapp provider add openai` (https://platform.openai.com/api-keys). Until then the studio shows that step and generating stays off.

API clients authenticate with a Gateway personal access token. `POST /api/v1/speech` takes `text`, `voice`, optional `dialect`, `tone` and `projectName`, and an `Idempotency-Key` header; `GET /api/v1/speech/:id`, `/api/v1/speech/:id/audio`, `/api/v1/voices`, `/api/v1/dialects` and `/api/v1/usage` read the rest.

## Limitations

- Speech and transcripts come from OpenAI's models, and each call is billed to your OpenAI account.
- The allowance starts at 3,600 seconds per member per month until an admin changes it.
- The checks in `checks/` run against a local stand-in for the OpenAI provider; real OpenAI calls and a real deployment were not part of them.
