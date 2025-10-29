# Mobile runner installer & packaging notes

This document describes a safe, repeatable way to provide a mobile-friendly Gemini CLI runner for Android (Termux) and how to bundle/install it for users.

Key constraints

- We DO NOT ship Gemini binaries in this repository. Binaries are typically large and may have license constraints.
- Instead we provide an installer script that downloads a binary from a URL you control and verifies a checksum.

Options for delivering the runner with your app

1. Recommended — Bundled installer URL + one-click in-app helper

- Host the Gemini CLI binary (or a vendor-approved wrapper) on a secure URL you control (S3, GCS, your CDN).
- Create a signed release for each target architecture (arm64-v8a, armeabi-v7a, x86_64).
- Provide a SHA256 checksum per artifact.
- In the app/installer, add a small helper that downloads the correct artifact for the device, verifies checksum and installs it to the app's accessible folder (Termux: $HOME/.local/bin).

We provide `scripts/install-gemini-termux.sh` as a CLI helper users can run on-device (Termux). The script requires you to pass a trusted download URL and optional SHA256 checksum.

2. Alternative — Provide pre-built Android APK that includes the runner

- This is technically possible but has legal/licensing and app-store review complications. Only do this if you have the right to redistribute the binary and understand Play Store policies.

3. Fallback — Use client-first flow without bundling the binary

- If bundling is not possible, guide users to run the installer script themselves (Termux), or provide a lightweight native client that connects to a user-controlled runner.

Security & UX notes

- Never hardcode credentials or tokens in the installer script. Use per-device secrets or let the user paste a trusted source URL.
- Use HTTPS and require SHA256 verification.
- Limit network exposure: runner should bind to localhost by default or require a local secret header when exposing on LAN.

How to test locally

1. On your development machine or an Android device with Termux installed:

```bash
# copy the install script to device and run
bash install-gemini-termux.sh https://your-hosted-binaries.example/gemini-arm64.tar.gz <sha256>

# then start the runner (set GEMINI_CLI_PATH to installed path)
export GEMINI_CLI_PATH=$HOME/.local/bin/gemini
export RUNNER_PORT=3001
export RUNNER_SECRET=my-secret
node scripts/mobile-runner.js
```

2. Use `PromptEditor` in the app to point to `http://<device-ip>:3001` and the secret.

If you want, I can help prepare a small packaging script (upload + checksum generation) and a UI flow for in-app installer that downloads artifacts from a chosen URL and performs verification.
