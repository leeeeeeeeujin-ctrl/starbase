Mobile CLI Bridge (Local)

Goal
- Run template executions on the device without using the main server.

Usage
- Requirements: Node.js on the device (e.g., Termux on Android).
- Start the bridge:
  - `node mobile/cli-bridge.js`
  - Optional: set `GEMINI_CLI_CMD` to forward payload to your Gemini CLI.

- In Template Studio, set Proxy URL to:
  - `http://127.0.0.1:4311/run-template`

Notes
- By default, the bridge runs the mock template executor locally.
- When `GEMINI_CLI_CMD` is set, the bridge writes a JSON payload to the CLI stdin and returns stdout.
- Keep secrets on-device; nothing is sent to the main server.

