# Secrets & dev-defaults inventory

This file records locations in the repository that reference high-privilege Supabase secrets or
developer-default credentials (e.g. `localdev`). Use this as a checklist to reduce risk and to
track remediation tasks.

Summary

- High-privilege Supabase keys:
  - `SUPABASE_SERVICE_ROLE` / `SUPABASE_SERVICE_ROLE_KEY` — service role keys should be treated as
    extremely sensitive. Avoid embedding them in workflows. Prefer: `SUPABASE_DB_URL` for psql runs
    or `SUPABASE_ACCESS_TOKEN` (personal access token) for CLI workflows where possible.

- Developer default passwords:
  - `ADMIN_PORTAL_PASSWORD=localdev` — convenient for local dev but must never be baked into
    production CI or images.

Locations found (review and remediate as needed)

Supabase service-role mentions:

- `ai-roomchat/.github/workflows/edge-functions-deploy.yml`
  - sets `SUPABASE_SERVICE_ROLE: ${{ secrets.SUPABASE_SERVICE_ROLE }}` in the job env
  - Recommendation: keep as secret only if required; prefer `SUPABASE_ACCESS_TOKEN` and remove
    service-role usage from workflows unless absolutely needed. Protect the workflow with an
    environment that requires manual approval for `production`.

- `ai-roomchat/starbase/ai-roomchat/scripts/deploy-edge-functions.js`
  - reads `SUPABASE_SERVICE_ROLE` and uses it to create a supabase client for recording deployment
    attempts. Recommendation: if only for recording, use a least-privileged API key or call the
    API from a secure backend.

- `ai-roomchat/starbase/ai-roomchat/scripts/*.js` (createDirectSession.js, runSelftest.js,
  testSqlExec.js, querySupabase.js, notify-audio-event-trends.js)
  - many scripts read `SUPABASE_SERVICE_ROLE_KEY` from env. Recommendation: mark these scripts as
    server-only and do not expose in client contexts; prefer using `SUPABASE_ACCESS_TOKEN` in CI
    flows when invoking supabase CLI.

- `ai-roomchat/starbase/ai-roomchat/supabase/functions/_shared/supabaseClient.ts`
  - reads `SUPABASE_SERVICE_ROLE`/`SUPABASE_SERVICE_ROLE_KEY` from environment variables for
    server-side functions. Recommendation: ensure these secrets are set only in protected
    environments (Edge/Function secrets) and not in general CI logs.


Developer default password mentions (ADMIN_PORTAL_PASSWORD=localdev):

- `Run-AdminPortal.cmd` — sets `ADMIN_PORTAL_PASSWORD=localdev` (dev convenience)
  - Recommendation: leave for dev but add clear comment that this is DEVELOPMENT ONLY and that
    the secret must not be committed to production secrets. Prefer to read from environment and
    require operators to set it explicitly in production.

- `.devcontainer/devcontainer.json`, `.vscode/tasks.json`, README.md and one workflow
  (`.github/workflows/run-ad hoc-command.yml`) — several developer flows set `ADMIN_PORTAL_PASSWORD`
  to `localdev` for convenience.
  - Recommendation: document clearly and ensure production workflows do not use this default.


Next steps (recommended)

1. Replace or remove `SUPABASE_SERVICE_ROLE` usage in CI/workflows where not necessary. Prefer
   `SUPABASE_DB_URL` for direct SQL runs or `SUPABASE_ACCESS_TOKEN` for CLI operations.
2. Protect any workflows that require service-role keys using GitHub Environments and required
   reviewers/manually-approved deployments for `production` environment.
3. Mark `ADMIN_PORTAL_PASSWORD=localdev` as dev-only in README and devcontainer (done in a
   separate patch) and remove from workflows that might run in non-dev contexts.
4. Rotate any leaked or widely-shared service-role keys and adopt a documented rotation policy.

If you want, I can: (A) add inline warnings to each file, (B) remove usage from selected workflows,
or (C) open a follow-up PR that performs the recommended changes. Tell me which you prefer.
