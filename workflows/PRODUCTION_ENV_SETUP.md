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

## Local / manual run & verification (quick reference)

If you've tested locally and want a short checklist to run migrations or produce a verified backup before requesting `production` approval, use these quick commands. The full step-by-step verification is in `workflows/MIGRATIONS_RUNBOOK.md`.

PowerShell (Windows)

```powershell
# load local env vars (if you keep them in .env.local)
Get-Content .\.env.local | ForEach-Object { if ($_ -and -not $_.TrimStart().StartsWith('#') -and $_ -match '=') { $p = $_ -split '=',2; [Environment]::SetEnvironmentVariable($p[0].Trim(), $p[1].Trim(), 'Process') } }

# 1) Create a timestamped dump and compress
$ts = (Get-Date).ToString('yyyyMMddTHHmmss')
pg_dump $env:MIGRATE_DATABASE_URL | gzip > "migration-backup-$ts.sql.gz"

# 2) Create a SHA256 checksum
Get-FileHash -Algorithm SHA256 "migration-backup-$ts.sql.gz" | Select-Object -ExpandProperty Hash > "migration-backup-$ts.sql.gz.sha256"

# 3) (Optional) Upload to Supabase fallback if configured in env
# $env:SUPABASE_URL = 'https://<project>.supabase.co'
# $env:SUPABASE_SERVICE_ROLE_KEY = '<service_role_key>'
curl -X PUT "$($env:SUPABASE_URL)/storage/v1/object/$($env:SUPABASE_BUCKET)/migration-backup-$ts.sql.gz" -H "Authorization: Bearer $($env:SUPABASE_SERVICE_ROLE_KEY)" -H "x-upsert: true" --data-binary @"migration-backup-$ts.sql.gz"

# 4) Verify checksum after download (example path)
# (use the Supabase download URL or download via API and compare Get-FileHash)
```

Bash (Linux / macOS)

```bash
# export env or load from .env
export MIGRATE_DATABASE_URL="postgresql://user:pass@host:5432/dbname"
ts=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump "$MIGRATE_DATABASE_URL" | gzip > migration-backup-$ts.sql.gz
sha256sum migration-backup-$ts.sql.gz > migration-backup-$ts.sql.gz.sha256

# Upload to Supabase (example)
curl -X PUT "$SUPABASE_URL/storage/v1/object/$SUPABASE_BUCKET/migration-backup-$ts.sql.gz" \
	-H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
	-H "x-upsert: true" \
	--data-binary @migration-backup-$ts.sql.gz

# To verify, download and compare sha256sum
```

Notes:
- For a full verification checklist (gzip integrity, header checks, restore smoke test), see `workflows/MIGRATIONS_RUNBOOK.md`.
- Never commit `.env.local` or secrets. Store `MIGRATE_DATABASE_URL` and any Supabase service keys in the protected `production` Environment for CI.
