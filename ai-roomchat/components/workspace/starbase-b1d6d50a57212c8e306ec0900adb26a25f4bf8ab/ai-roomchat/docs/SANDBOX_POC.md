# Sandbox PoC (Docker)

This document describes a small, local-first sandbox PoC that uses Docker to run untrusted JavaScript (PoC only).

Purpose
- Provide a quick way for developers to run converted Blockly/JS or test runner code in an isolated container with basic resource limits.
- NOT production-grade. Use this only for local testing.

Files
- `ai-roomchat/scripts/sandbox_run.sh` — Bash script for Linux/macOS/dev environments with Docker available.
- `ai-roomchat/scripts/sandbox_run.ps1` — PowerShell variant for Windows developers.

Usage (Linux/macOS)
```bash
cd ai-roomchat
./scripts/sandbox_run.sh workflows/blockly-sample.out.js 5
```

Usage (Windows PowerShell)
```powershell
cd ai-roomchat
.\scripts\sandbox_run.ps1 -ScriptPath workflows\blockly-sample.out.js -TimeoutSeconds 5
```

Security notes / limitations
- This PoC relies on Docker; it mounts the script's directory into the container for convenience. In production you should avoid mounting host directories and instead copy the payload into ephemeral images or pass via STDIN.
- Timeouts are enforced by the host script which kills the container after the configured timeout. That is okay for PoC but not robust for production.
- For production, consider Firecracker or gVisor-based isolation, immutable signed images, strict network policies, UID mapping, and audit logging.

Next steps
- Replace PoC with a containerized worker pool that pulls signed job images and runs them under strong isolation (gVisor/Firecracker).
- Add CI integration to build and scan sandbox images and publish them to registry.
