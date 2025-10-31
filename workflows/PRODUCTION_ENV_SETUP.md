# Create GitHub Environment: production

This guide shows the minimal steps to create a protected GitHub Environment (e.g. `production`) and add the secrets required by the `run-migrations.yml` workflow in this repository.

Why: The `apply` job in the migrations workflow uses a GitHub Environment to require manual approvals and to store production-only secrets (for example, `MIGRATE_DATABASE_URL`). Creating the environment and storing secrets there prevents accidental use in PRs and enforces reviewer approvals.

Steps

1. Create the `production` Environment

- In the repository on GitHub, go to Settings → Environments → New environment.
- Enter the environment name `production` and create it.

2. Configure required reviewers (recommended)

- In the Environment settings, require at least one or two reviewers (team or user) for `production` deployments.
- This enforces an approval gate before the `apply` job runs against production.

3. Add required secrets to the Environment (do NOT add to repo-level unprotected secrets)

Minimum secrets used by the `run-migrations.yml` workflow:

- `MIGRATE_DATABASE_URL` — recommended: session-pooler URL or production DB connection string used by `ai-roomchat/scripts/apply-migrations.js`.
- `SUPABASE_SERVICE_ROLE_KEY` — optional, only required if you want the workflow to upload backups to Supabase Storage as a fallback.
- `SUPABASE_URL` — optional, e.g. `https://<project>.supabase.co`.
- `SUPABASE_BUCKET` — optional, e.g. `migration-backups`.

How to add secrets to the environment:

- Go to the environment page in the repo settings, open `Secrets`, and click `Add secret`.
- Paste the secret value (keep service role key secure).

4. Validation checklist (after adding secrets)

- Create a small test run of the `run-migrations.yml` workflow against a staging environment (not `production`) and verify dry-run behavior.
- Verify that the `apply` job is blocked and requires environment approval when `dry_run=false` and the target `environment` is `production`.
- If you expect Supabase fallback to be used, ensure `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, and `SUPABASE_BUCKET` are set in the Environment.

Notes & Security

- The `SUPABASE_SERVICE_ROLE_KEY` is powerful; store it only in protected environment secrets and rotate it periodically.
- Do not commit secrets or .env files to the repo. Local developers can use `ai-roomchat/.env.local` for local runs but this file must not be committed.
- Consider limiting runner access and using organization-level required reviewers for higher assurance.

If you'd like, I can prepare a tiny checklist PR template or a CONTRIBUTING note that references this environment creation doc and the PR approval expectations.
