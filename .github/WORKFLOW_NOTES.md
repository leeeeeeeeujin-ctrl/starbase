# Workflow notes

This file documents which workflows to use for DB migrations and Supabase-related CI tasks.

Short guidance

- DB migrations (SQL files under `docs/sql/`): prefer the `apply-sql-migration.yml` workflow which
  runs `psql` against `SUPABASE_DB_URL`. This avoids storing a supabase *service role* key in a
  workflow. `apply-sql-migration.yml` can be triggered manually using `workflow_dispatch`.

- Supabase CLI / Edge Functions: use `edge-functions-deploy.yml` which relies on `SUPABASE_ACCESS_TOKEN`
  and `SUPABASE_PROJECT_REF`. This is the recommended CI path for deploying Edge Functions.

- Avoid ad-hoc workflows that embed `SUPABASE_SERVICE_ROLE_KEY` as a secret in Actions. If a
  service-role-level migration is absolutely required, prefer running it from a protected environment
  with manual approval and short-lived secrets.

Quick local commands

Run the SQL file locally via psql (example):

```powershell
cd ai-roomchat/starbase/ai-roomchat
#$env:SUPABASE_DB_URL = '<your supabase db connection string with password>'
psql $env:SUPABASE_DB_URL -f docs/sql/20251025_add_recompute_queue.sql
```

Or use Supabase CLI with an access token (safer than service role):

```powershell
supabase login # or set SUPABASE_ACCESS_TOKEN
supabase db query --file docs/sql/20251025_add_recompute_queue.sql --project-ref <project-ref>
```

If you want, I can centralize migration dispatching into a single safe workflow (with `sql_file` +
`confirm` inputs and environment protection for production).

Secrets & dev-defaults note

- This repo contains a few developer-default credentials (for example `ADMIN_PORTAL_PASSWORD=localdev`)
  which are convenient locally but dangerous if used in production workflows. See
  `.github/SECRETS_INVENTORY.md` for an inventory of files that reference `SUPABASE_SERVICE_ROLE*`
  and `ADMIN_PORTAL_PASSWORD` and recommended remediation steps.

 - Tip: avoid committing service-role keys to workflows or scripts. Prefer `SUPABASE_DB_URL` for
   direct psql runs and `SUPABASE_ACCESS_TOKEN` for supabase CLI operations in CI. Protect
   production-run workflows with GitHub Environment manual approvals.