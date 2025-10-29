# Gemini CLI integration (server-side)

This document describes how the server-side Gemini CLI provider works and what environment variables are expected when running the Next.js `ai-roomchat` server.

Overview

- The repository includes a server-side provider adapter at `lib/providers/geminiCliProvider.js`.
- The adapter invokes a local Gemini CLI executable using `child_process.spawn`. It supports two invocation modes:
  - stdin mode: write the prompt to the process stdin (recommended when the CLI supports it)
  - file mode: write the prompt to a temporary file and pass the path to the CLI
- The run API (`/api/prompts/:id/run`) will use this adapter when the request `provider` is set to `gemini`.

Required environment variables

- `GEMINI_CLI_PATH` (optional) — path to the Gemini CLI executable. Defaults to `gemini` (must be on PATH or resolved).
- `GEMINI_CLI_ARGS` (optional) — extra CLI args to pass, as a space-separated string.
- `GEMINI_CLI_ACCEPT_STDIN` (optional) — if set to `1` (default) the adapter writes the prompt to stdin; set to `0` to use file mode.
- `GEMINI_CLI_TIMEOUT_MS` (optional) — timeout for the CLI run in milliseconds. Default: `30000` (30s).

Security and operational notes

- The server process runs the CLI as the service account user. Ensure the CLI is installed and secured on your servers.
- Be careful with secrets: any secret tokens or private keys passed to the CLI via env or args are accessible to the server process. Limit access to the server and rotate keys regularly.
- Concurrency: invoking the CLI directly is blocking for the duration of the process. If you expect high volume, consider:
  - using a job queue (Redis/RabbitMQ) and worker pool to run requests
  - rate-limiting calls
  - pooling/shared worker processes (if the CLI supports it)
- Logging: CLI stdout/stderr are captured and stored in run rows (see `prompt_runs.provider_response`). Avoid storing secrets in these logs.

How it is wired

- `pages/api/prompts/[id]/run.js` inspects the `provider` string in the request body. If it equals `gemini`, the handler will attempt to `require('../../../../lib/providers/geminiCliProvider')` and call its `callProvider` function. If the adapter fails to load, the handler falls back to the mock provider.

Testing locally

1. Install the Gemini CLI and ensure `gemini` is on PATH, or set `GEMINI_CLI_PATH` to its full path.
2. Optionally set `GEMINI_CLI_ACCEPT_STDIN=1` if the CLI accepts stdin. If not, set it to `0`.
3. Start the dev server and run a prompt run request (e.g. via the AI Assist UI or curl) with `{ "provider": "gemini", "input": { ... } }`.

Preferred client-side flow (recommended)

- For app-first UX, run Gemini (or other LLM) on the device/app and send the resulting `provider_response` to the server when saving a run.
- The server exposes verification logic to mark runs as `verified` or `unverified` based on simple checks (rendered prompt match, length limits, banned patterns). See `lib/providers/verifyProviderResponse.js`.
- To use this flow, call the LLM from the client, then POST to `/api/prompts/:id/run` with body:

  ```json
  {
    "provider": "client", // or "gemini-client"
    "input": { ... },
    "provider_response": { "text": "...", "rendered_prompt": "..." },
    "source": "client"
  }
  ```

The server will render the prompt server-side and compare with the client's `rendered_prompt` to detect mismatches and perform sanitization before persisting. If verification fails the run is stored as `unverified` so it can be audited.

Example env (Windows PowerShell):

```powershell
$env:GEMINI_CLI_PATH = 'C:\tools\gemini\bin\gemini.exe'
$env:GEMINI_CLI_ACCEPT_STDIN = '1'
$env:GEMINI_CLI_TIMEOUT_MS = '45000'
```

Next steps / improvements

- Implement a queued worker backed by Redis to offload heavy or slow CLI runs.
- Add structured usage reporting (tokens consumed, latency) if the CLI provides such metrics.
- Harden input sanitization and secret redaction before saving provider responses to `prompt_runs`.

If you'd like, I can:

- wire a simple job-queue worker to run Gemini invocations off the main request path, or
- add unit tests for the `geminiCliProvider.js` behaviour (timeout, stdin/file modes).
