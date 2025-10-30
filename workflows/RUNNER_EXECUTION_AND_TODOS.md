# Runner Execution Policy & Implementation TODOs

Created: 2025-10-30
Author: agent (auto-generated, update as needed)

Purpose

This document centralizes the current todo list and the planned implementation structure for the prompt-node code editor, block editor, and runner execution flows (including user-consented local/remote CLI runs and a server-side isolated runner).

Location: `workflows/RUNNER_EXECUTION_AND_TODOS.md`

---

## Executive summary

We support a code-first prompt-node editor and a block-based editor that both produce prompt-template JSON. Users need the ability to run those templates locally (on-device) or via a runner service. Because executing generated code or shell/CLI commands can be dangerous, we require explicit user consent before any CLI invocation, strong authentication for runner endpoints, audit logging, and a secure sandboxed execution environment.

Key high-level decisions:
- Mobile on-device CLI (e.g., Gemini CLI) is allowed only with explicit user consent and when the runtime environment supports it (Android/Termux feasible; iOS largely limited to WASM/web-based alternatives).
- We will provide pluggable runner support so users can point the editor at their own runner server (host, port, auth). The system will validate credentials and sign requests.
- For untrusted execution we will prefer WASM for client-side sandboxing and ephemeral container-based isolation (server-side) for heavier workloads. Containers should run per-job with strict resource caps.

---

## Snapshot: inventory — implemented, in-progress, planned

This section is intended to be a precise, up-to-date inventory so contributors can quickly see what's done, what's being worked on, and what remains. The agent-managed canonical todo store (internal) remains the source of truth for tracking progress; this document is a readable summary and roadmap.

Implemented (Completed)
- Prompt editor save/load
  - Files: `ai-roomchat/components/PromptEditor.js`
  - Acceptance: UI can create/edit/save/load prompt templates and tests cover basic CRUD in fallback mode. (todo id #2)
- Prompt-templates API (DB-first with JSON fallback)
  - Files: `ai-roomchat/pages/api/prompt-templates/index.js`, `ai-roomchat/pages/api/prompt-templates/[id].js`
  - Acceptance: API serves templates from DB when service role is available; falls back to file-backed store for local dev. Tests for file-fallback mode exist. (todo id #3)
- SQL migration file for `prompt_templates`
  - Files: `ai-roomchat/sql/004_create_prompt_templates.sql`
  - Acceptance: SQL file committed and reviewed. Remote apply pending due to network/CI gating. (todo id #4)
- Device-runner development shim and docs
  - Files: `ai-roomchat/lib/clientRunner/shim.js`, `ai-roomchat/docs/CLIENT_RUNNER.md`
  - Acceptance: `npm run device-runner` starts a local Express shim that accepts POST /run and returns simulated provider-like responses for manual testing. (todo id #6)
- Workflow & policy documents (initial)
  - Files: `workflows/RUNNER_EXECUTION_AND_TODOS.md`, `ai-roomchat/docs/MIGRATIONS.md`, `ai-roomchat/docs/CONSENT_AND_HMAC.md`
  - Acceptance: Docs created and linked from the workflow. (todo ids #24, #16, #new doc)

In-progress
- Wire editor to device-runner (client integration)
  - Target files: `ai-roomchat/components/PromptEditor.js` (Run button -> POST to runner)
  - Acceptance: Run button shows consent modal, calls runner shim with HMAC headers when device is registered. (todo id #7)
- Device registration & HMAC signing (spec + doc + initial client helpers)
  - Files to add: `ai-roomchat/pages/api/devices/register.js`, client helper in `PromptEditor` and `ai-roomchat/lib/clientRunner/*`
  - Acceptance: `/api/devices/register` returns device_id + device_secret once; client stores secret; signRequest helper produces required headers. (todo id #8)
  - Current: Spec doc `ai-roomchat/docs/CONSENT_AND_HMAC.md` created; implementation pending.

Planned / Backlog (high priority order)
- Apply migrations in CI (gated)
  - Goal: Create GitHub Actions job to apply SQL migrations using secure secrets (DATABASE_URL or Supabase service role) with optional dry-run and manual approval.
  - Acceptance: workflow run that safely applies `ai-roomchat/sql/004_create_prompt_templates.sql` to target DB; tests run against DB post-migration. (todo id #5)
- Audit logging schema & API
  - Goal: Add `audit_run_events` migration and `/api/audit/run-event` ingestion route.
  - Acceptance: All run events (consent, device_id, template_id, summary) persisted to DB or file-fallback and viewable in admin UI. (todo id #9)
- Harden server-runner sandbox (server-side isolation)
  - Options: ephemeral containers (Firecracker/gVisor/Docker) or server-side WASM sandbox.
  - Acceptance: per-run isolation with time/memory limits and post-run cleanup. (todo id #10)
- WASM runner PoC (client-side safe execution)
  - Goal: PoC that runs a minimal templating/transformer step in WASM in the browser or on-device with a fixed capability set. (todo id #11)
- Block-based visual editor + mapping
  - Files: `ai-roomchat/components/maker/editor/*` and mapping libraries.
  - Acceptance: UI can create flows, map them to prompt-template JSON, and persist via prompt-templates API. (todo ids #12,#13)
- Pluggable external runner support & auth
  - Goal: UI + config to allow user-provided runner endpoints and credentials; example server-side validation + forwarding. (todo id #23)

Lower priority / longer-term
- Tests: unit & e2e for runner and templates (including e2e that uses shim) (todo id #14)
- CI: add migration/test matrix and gating (todo id #15)
- Repository cleanup & audit (secrets, stale files) (todo id #18)
- Mobile packaging & Termux guide (todo id #19)
- Follow-up: unblock migrations (operational checklist) (todo id #20)

---

For the most up-to-date status programmatically, consult the agent-managed todo store (the agent updates it as work is started/completed).

---

## Required policies & UX

1. User consent flow (mandatory):
   - Before any operation that will execute a CLI or any code outside the editor sandbox, show a modal with clear wording asking for consent.
   - Consent must be explicit (checkbox + timestamped acceptance), and the consent event must be logged to the audit store.
   - Provide an opt-in persistent setting per-device ("Allow on-device CLI runs"), revocable in settings.

2. Runner configuration (pluggable):
   - Users can supply a runner URL and credentials via the UI.
   - Credentials should be bearer tokens or signed HMAC secrets. The client must never ship service-role keys; only user-scoped credentials.
   - The editor will send signed requests (HMAC over body+timestamp+nonce) to the runner endpoint.

3. Audit & transparency:
   - All runs (device ID, user ID, template ID, inputs, outputs summary, consent record) are logged to an audit endpoint.
   - Provide a UI to view recent runs and revoke device tokens.

4. Safe defaults:
   - Disable CLI execution by default on new installs; enable only after explicit opt-in.
   - Block any template operation that requests network access or file-system access unless the runner explicitly supports those capabilities and the user consents.

---

## Implementation structure (where files live / pointers)

- Client/UI
  - `ai-roomchat/components/PromptEditor.js` — code editor + run button + consent modal.
  - `ai-roomchat/components/maker/editor/*` — block editor (to implement).
  - Local storage: device token store + runner config.

- Dev shim (local runner)
  - `ai-roomchat/lib/clientRunner/shim.js` — local Express runner for dev/testing (already present).
  - `ai-roomchat/docs/CLIENT_RUNNER.md` — how to run shim locally / Termux notes.

- Server/API
  - `ai-roomchat/pages/api/prompt-templates/*` — prompt template CRUD (DB-first with file fallback).
  - `ai-roomchat/pages/api/devices/*` — (to add) device register / token route.
  - `ai-roomchat/pages/api/audit/*` — (to add) run event ingestion.

- Migrations & CI
  - `ai-roomchat/sql/004_create_prompt_templates.sql` — present.
  - CI migration workflow: to be added in `.github/workflows/migrations.yml` (todo).

- Workflows / Docs
  - `workflows/RUNNER_EXECUTION_AND_TODOS.md` — (this file)
  - `ai-roomchat/docs/MIGRATIONS.md` — migration notes.

---

## Short-term next steps (this week)

1. Finalize User-Consent policy + UI modal copy (agent can create draft copy).
2. Implement minimal device registration endpoints and HMAC signing example (client + server stub).
3. Wire `PromptEditor` Run button to the local `device-runner` shim for manual testing, requiring explicit consent modal before sending.
4. Create CI job stub for applying migrations using repo secrets (no secrets stored here).

---

## Operational gaps & missing action items (sync with agent todo-store)

The following items were identified by the agent as missing from this document or under-documented. They are actionable operational tasks that complement the architecture and implementation notes above. Each item is mapped to the agent-managed todo store where work will be tracked.

1. Commit local `001_create_prompt_runs.sql` and open PR (todo-store #3)
  - Ensure the migration ordering, filename, and author metadata follow repo conventions. Add a short test that validates idempotency.

2. Exclude local secret file and document local pooler usage (`ai-roomchat/SPPP_SI`) (todo-store #4)
  - Add `.gitignore`/`.git/info/exclude` guidance and a short paragraph in `ai-roomchat/docs/MIGRATIONS.md` describing secure local usage.

3. CI: prefer `MIGRATE_DATABASE_URL` and document secret usage (todo-store #2, #5)
  - Make the Node migration runner the primary CI path when `MIGRATE_DATABASE_URL` is present. Document secret naming and security tradeoffs (pooler vs service-role keys).

4. Draft and add the consent modal copy + consent audit event (todo: new)
  - Short, explicit consent copy and example audit event payload. This is required before enabling any runner/CLI execution UX.

5. NonceStore: Redis integration plan & sample config (todo-store #8)
  - Provide a Redis-backed implementation and fallback to in-memory for dev; include helm/docker-compose snippets.

6. Master key encryption & rotation runbook (todo-store #9, #18)
  - `rotate-master-key.js` usage, rollback steps, and compatibility considerations for device secrets.

7. Capability tokens: spec + implementation plan (todo-store #7)
  - Short-lived capability tokens (HMAC-signed) for client-run operations; include revocation and scope model.

8. Fuzzer & matching-samples CI integration (todo-store #13)
  - Document how to run fuzz tests locally and in CI; add sample job stub.

9. Playwright/E2E test plan + CI execution policy (todo-store #14)
  - List critical flows, test owners, and how/when tests run in CI (PRs vs nightly).

10. Self-hosted runner evaluation & guide (todo-store #19)
   - Evaluate cost/op, provide quickstart to run a runner VM within DB network for reliable migrations.

11. Performance & security review checklist (todo-store #23)
   - Quick checks: expensive queries, missing indexes (audit logs), encryption validation, threat model.

12. Telemetry & observability plan (todo-store #24)
   - Metrics to capture: migration duration, run success/failure, device registration rate, audit volume.

These items will be added to the agent-managed todo-store and tracked there; this document will link to or reference the todo-store statuses when items move in-progress or complete.


## Long-term roadmap (high level)

- Implement block-editor and DSL that restricts capabilities (no arbitrary shell by default).
- Implement WASM PoC for client-side safe execution of templating logic.
- Implement server-side ephemeral container runner for heavier tasks (Firecracker/gVisor/Docker with per-run time/mem caps).
- Add audit immutability guarantees (append-only store or signed logs).
- Run security review/fuzzing and add policy docs for production use.

---

If you want, I can now:
- A) Draft the consent modal copy and the device registration/HMAC endpoints and code (client + server examples).
- B) Implement the `PromptEditor` wiring to the local shim and add a small UI consent modal.
- C) Open a PR with the `workflows/` doc and the updated todo list (I can prepare changes and tests).

Tell me which of A/B/C you want me to do next and I'll start (I will also mark the corresponding todo item `in-progress` and update when complete).