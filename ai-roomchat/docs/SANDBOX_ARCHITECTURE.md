```markdown
# Sandboxing & Safe Execution Architecture

This document describes practical, deployable patterns to safely execute user-created prompt templates and small code artifacts coming from the Prompt-Node/Block editors. It focuses on preventing information leakage and blocking malicious operations while preserving good UX and performance.

## Goals
- Prevent templates or editor-provided artifacts from exfiltrating secrets or accessing host device information.
- Provide layered defenses: static validation, runtime sandboxing, and audit/observability.
- Support a mix of client-local execution (trusted / user-owned) and server-side execution (untrusted / centralized) with minimal performance impact.

## Recommended layered defense
1. Editor (Client) — Prevent supply of obviously malicious content early
   - Whitelist block types in BlockEditor. No raw shell execution block by default.
   - Run quick static checks in the browser for banned substrings: `curl`, `ssh`, `scp`, `/dev/tcp`, `rm -rf`, `wget`, `nc`, `base64 -d`, `openssl`.
   - Provide immediate UI warnings and refuse to run locally if a high-risk pattern is detected.

2. Edge — Lightweight validation & preview
   - Edge workers (Vercel Edge, Cloudflare Workers) provide low-latency previews and apply the same static checks.
   - For preview mode, use trimmed inputs and small token budgets to reduce cost/risk.

3. Server — Trusted execution only with strong isolation
   - Use ephemeral execution environments for untrusted heavy runs:
     - Preferred: microVMs (Firecracker, Kata) for multi-tenant strong isolation.
     - Practical: ephemeral containers with strict seccomp/AppArmor + no-new-privileges, read-only rootfs, network disabled by default.
   - Enforce resource caps (CPU, memory), timeouts, and mount only minimal read-only inputs.
   - Always run with a manifest that declares allowed flags, max tokens, and timeout — enforcable by the runner.

4. Post-run analysis & audit
   - Scan run output for sensitive patterns (API keys, e-mails, URLs matching certain domains) and redact or flag results.
   - Persist `device_events` / `prompt_runs` with execution metadata (sha256(template), device_id, user_id, runtime, exit_code) for forensic review.

## Practical implementation notes

### Fast static checks (client + edge)
- Implement a compact rule engine based on substring checks and a small regex list. Example rules:
  - Deny `rm\s+-rf`, `\b(curl|wget|nc|ssh|scp)\b`, `/dev/tcp`, `base64\s+-d`, `openssl\s+`, and raw `sudo` usage.
  - Deny suspicious heredocs containing `bash`/`sh` tokens or nested backticks.

### Wasm-first strategy (recommended for light transforms)
- Put deterministic text/format transforms and sanitizers in a Wasm module (Rust → wasm). Wasm runs safely in the browser, edge, and server with near-native performance.
- Use the same Wasm module everywhere to ensure consistent sanitization.

### Container runtime hardening (server)
- Start containers with these minimum constraints:
  - read-only root filesystem; mount `/tmp` as tmpfs.
  - drop all Linux capabilities; NO new privileges.
  - custom seccomp JSON profile to allow minimal syscalls only.
  - disable networking by default; if network is required, proxy egress through an auditing gateway.
  - resource limits: memory 512MB, CPU quota 0.5 cores (configurable), timeout 60s.

### MicroVM path (higher security)
- If you need strict multi-tenant isolation, use microVMs (Firecracker) spawned per job. This increases ops cost but offers stronger guarantees versus containers.

### Execution manifest & enforcement
- Jobs must include a small manifest (JSON) with:
  - `allowed_flags`: array
  - `max_tokens`: number
  - `max_runtime_seconds`: number
  - `allow_network`: boolean
- The runner enforces the manifest and rejects jobs that request disallowed capabilities.

## Mobile considerations
- iOS: cannot rely on running arbitrary native binaries; prefer Wasm or server run.
- Android: Termux/ADB can run local binaries but is heterogeneous and not recommended as the default.
- Mobile app should only offer local-run option for advanced users and always warn that local runs use user device resources and are their responsibility.

## Example: minimal container run wrapper (pseudocode)
```bash
# spawn container with limited resources (illustrative only)
docker run --rm \
  --read-only \
  --cap-drop all \
  --security-opt no-new-privileges \
  --security-opt seccomp=/etc/seccomp-profile.json \
  --network none \
  --cpus="0.5" \
  --memory="512m" \
  -v /tmp/job-input:/job/input:ro \
  -v /tmp/job-tmp:/job/tmp:rw,tmpfs \
  my-runner-image:latest \
  /runner/execute --manifest /job/input/manifest.json
```

## Quick checklist to implement (initial sprint)
1. Add client-side static rules and UI warnings (BlockEditor + PromptEditor).
2. Create a Wasm sanitizer for text transforms; wire into client + edge + server.
3. Implement server runner wrapper enforcing manifest, seccomp profile, and resource caps.
4. Persist audit logs to `device_events` and `prompt_runs` with execution metadata.

## Links
- See `ai-roomchat/docs/hybrid-architecture.md` for how client/server split is designed.

---
_Generated and suggested by project architect assistant — update rules to match your operational constraints before deployment._
```
