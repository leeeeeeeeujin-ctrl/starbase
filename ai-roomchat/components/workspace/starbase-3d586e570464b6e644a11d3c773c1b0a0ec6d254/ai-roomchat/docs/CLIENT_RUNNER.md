# Device Runner (Client-side) — Overview & Quickstart

This document describes the lightweight "device-runner" approach used by the project to allow on-device execution of prompts (Gemini CLI or local runner) without pushing every run to the central server.

Goals
- Provide a small, easy-to-run HTTP shim that accepts POST /run { prompt } and returns a provider-like response.
- Make it easy for developers to run the runner locally (desktop) or on Android devices (Termux). iOS is constrained and is discussed below.
- Keep the runner intentionally minimal and safe for local/dev use. Production-grade runners (if required) should be hardened and run in trusted environments.

Files
- `lib/clientRunner/shim.js` — Node-based local runner stub. Runs with `node lib/clientRunner/shim.js` or `npm run device-runner`.

Quickstart (desktop)

1. Install dependencies (from `ai-roomchat`):

```powershell
cd ai-roomchat
npm ci
npm run device-runner
```

By default the runner listens on port 3001. To set a secret and different port:

```powershell
$env:DEVICE_RUNNER_SECRET = 's3cret'
$env:PORT = '3001'
npm run device-runner
```

2. Call the runner from the Prompt Editor (example):

Fetch example (JavaScript in browser or editor):

```javascript
await fetch('http://192.168.0.5:3001/run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-runner-secret': 's3cret' // if set
  },
  body: JSON.stringify({ prompt: 'Hello {{player.name}}', options: { signWith: null } })
});
```

Android (Termux)

1. Install Termux from F-Droid and open it.
2. Install Node.js inside Termux:

```bash
pkg update && pkg install nodejs
```

3. Clone the repo (or copy `ai-roomchat/lib/clientRunner/shim.js` into device) and run:

```bash
cd ~/path/to/ai-roomchat
npm ci
export PORT=3001
export DEVICE_RUNNER_SECRET='s3cret' # optional
npm run device-runner
```

4. From your desktop/browser/editor, call `http://<phone-ip>:3001/run`.

iOS notes

- iOS does not allow arbitrary background daemons or arbitrary binaries to be installed in the same way as Android. Running a Node-based runner on iOS is not practical without a dedicated app.
- Options:
  - Use a small companion app (native) that provides the same `/run` HTTP API (requires app store distribution or TestFlight for internal use).
  - Use the server fallback: if device-runner is unavailable, the editor can POST to the server's `/api/runs` (server runs in a hardened environment).

Security notes (quick)
- The included shim is a development convenience. It has minimal security (optional `DEVICE_RUNNER_SECRET`). Do not expose it to untrusted networks.
- Never store service-role/other high-privilege keys on device-runner.
- The editor will optionally sign runs with a capability token or HMAC; server-side endpoints must verify signatures.

Next steps / Integrations
- Replace the simulated response in the shim with a CLI invocation (shelling out to an installed Gemini CLI) — implement carefully with timeouts and process isolation.
- Add a small systemd/service or Termux startup helper if you want the runner to persist across reboots (desktop/Android).
- For production or multi-user device-runners, consider containerizing (on desktop/edge) and adding authentication and TLS.

Troubleshooting
- If mobile device is not reachable: check local network (same Wi-Fi), firewall, and that Termux permits incoming connections.
- If runner fails to start: ensure Node.js and dependencies are installed.

Example run JSON response

```json
{
  "text": "SIMULATED_RUN: Hello {player.name}",
  "rendered_prompt": "Hello {player.name}",
  "meta": { "runAt": "2025-10-30T00:00:00.000Z", "runner": "shim" }
}
```

If you want, I can extend the shim to shell out to an installed CLI (with timeouts) and add basic process isolation notes. Ask for that explicitly.
