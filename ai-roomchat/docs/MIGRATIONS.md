# Migrations — how to run and troubleshoot

This document describes how to apply the SQL migrations under `ai-roomchat/sql/` for local development and in CI. It also documents the helper scripts that use local SPPP files and an IPv4 workaround used when remote Postgres is flaky.

Summary of helpers

- `scripts/apply-migrations.js` — project migration runner (existing). Use `npm run migrate:db` to run with `DATABASE_URL` set.
- `scripts/apply-migrations-with-sppp.js` — reads local SPPP files (if present) and sets env vars (DATABASE_URL or Supabase service role) then invokes `apply-migrations.js`.
- `scripts/run-migrations-ipv4.js` — resolves the DB host to IPv4 A records and runs `apply-migrations.js` with an IPv4-forced `DATABASE_URL` (helpful when DNS returns IPv6-only or when IPv6 connectivity is a problem).

Files to look at

- SQL migrations: `ai-roomchat/sql/*.sql` (e.g. `004_create_prompt_templates.sql`).
- Migration helpers: `ai-roomchat/scripts/apply-migrations-with-sppp.js`, `ai-roomchat/scripts/run-migrations-ipv4.js`, `ai-roomchat/scripts/apply-migrations.js`.

Quick local apply (PowerShell)

If you have a local Postgres instance and want to apply migrations locally (recommended to avoid network/DNS issues):

1. Set `DATABASE_URL` environment variable for this PowerShell session (example uses default Postgres URI format):

```powershell
# adjust user, password, host, port, dbname as appropriate
$env:DATABASE_URL = 'postgresql://postgres:your_local_password@localhost:5432/postgres'
npm run migrate:db
```

2. If you keep local SPPP files in `ai-roomchat/SPPP*` that contain connection info, use the SPPP helper script (it will attempt to read those files and create the required env vars):

```powershell
cd .\ai-roomchat
npm run migrate:apply-sppp
```

This will attempt to use local SPPP content. If your SPPP contains a `postgresql://...` line it will set `DATABASE_URL` accordingly.

IPv4 workaround

If connecting to a remote DB fails with socket timeouts or IPv6-related DNS issues (examples: ETIMEDOUT, ENODATA for A records), you can try the IPv4 helper which resolves the host to an IPv4 address and runs the migration with that IP:

```powershell
cd .\ai-roomchat
npm run migrate:ipv4
```

Note: forcing an IP in the `DATABASE_URL` may cause TLS/hostname verification warnings if the certificate is bound to the host name; this is a pragmatic local workaround but avoid in production.

Troubleshooting notes (from earlier attempts)

- ETIMEDOUT connecting to remote Postgres: often indicates network routing or firewall issues. Check local network, VPN, or corporate proxies. Try from another network or CI runner.
- ENODATA resolving A records for `db.<project>.supabase.co`: Supabase hosts are often served behind Cloudflare and may return IPv6-only records or use load balancers; ensure your environment can resolve and connect to the returned addresses.
- If remote DNS is unreliable, prefer applying migrations from a CI runner (GitHub Actions) with correct secrets or from a bastion host that has stable network access to Supabase.

Applying migrations in CI (recommended for remote DB)

- Store secrets in GitHub Actions secrets (Repository or Organization level):
  - `SUPABASE_SERVICE_ROLE_KEY` — the service role key (server side) or `DATABASE_URL` (preferred: use a CI-managed DB user with limited privileges).
  - `DATABASE_URL` — if you prefer to run migrations via direct Postgres connection.

- Example job step (PowerShell-like; adapt to runner shell):

```yaml
- name: Apply DB migrations
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: |
    cd ai-roomchat
    npm ci
    npm run migrate:db
```

Security note: avoid committing SPPP or secrets to the repo. The `ai-roomchat/SPPP*` files are local artifacts and must remain out of source control. Use CI secrets for automation.

Next steps

- If you want, I can attempt to run `npm run migrate:apply-sppp` here now and report the output. If it fails for remote DNS/connectivity reasons, the recommended path is to run migrations locally against a local Postgres or run them from a CI runner with proper secrets.

If you want me to proceed and try to apply the migration now, say so and I will run the npm script and post the logs.
