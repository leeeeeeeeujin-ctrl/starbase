# Migrations runbook — Backup & Restore verification

This document describes the verification steps for backups produced by the `run-migrations.yml` workflow and how to manually restore an artifact.

## Backup verification (automated)
The CI workflow `run-migrations.yml` performs the following automated checks in the `backup` job and again in the `apply` job before applying migrations:

- Installs `postgresql-client-17` (prefer v17).
- Creates a gzip'ed SQL dump via a version-matching `pg_dump` binary.
- Verifies gzip integrity using `gzip -t`.
- Enforces a minimum file size (10KB) to avoid tiny partial files.
- Performs a heuristic header check by decompressing the first ~20 lines and looking for SQL markers like `--`, `SET`, `CREATE`, `COPY`.

If any of these steps fail the workflow will remove the partial artifact and exit with a non-zero code.

## Manual verification (how-to)
If you need to download and check the artifact locally:

1. Download the artifact from the Actions run page (or use `gh`):

```bash
# example using GitHub CLI
gh run download <RUN_ID> --name migration-backup -D ./migration-backup
```

2. Inspect gzip integrity and size:

```bash
gzip -t ./migration-backup/migration-backup-*.sql.gz
stat -c%s ./migration-backup/migration-backup-*.sql.gz
```

3. Quick header check:

```bash
zcat ./migration-backup/migration-backup-*.sql.gz | head -n 20
```

Look for SQL markers: `--`, `SET`, `CREATE`, `COPY`, etc.

## Restore (manual)
The dump produced by the workflow is a plain SQL dump (not `pg_dump -Fc` custom format), so restore with `psql` into a suitable target DB.

Warning: do NOT restore into production DB without validation and approval.

1. Create a temporary database for verification (example):

```bash
createdb staging_restore_test
psql staging_restore_test < <(zcat migration-backup-YYYYMMDDTHHMMSSZ.sql.gz)
```

2. Or restore directly to a Postgres instance:

```bash
zcat migration-backup-YYYYMMDDTHHMMSSZ.sql.gz | psql "postgresql://user:pass@host:5432/dbname"
```

3. After restore, run smoke queries or run the same migration `apply` dry-run logic against the recovered DB to ensure schema and data are valid.

## Troubleshooting
- If `gzip -t` fails: the artifact is corrupt. Check the workflow logs for `pg_dump` errors and the runner's `pg_dump --version` output.
- If file is unexpectedly small (<10KB): likely a failed dump; inspect logs and consider re-running the backup/job.
- If header doesn't look like SQL: verify `pg_dump` binary being used (should be v17 matching server) and confirm the DB connection used by `pg_dump`.

## Operational notes
- Always keep `MIGRATE_DATABASE_URL` and production secrets in a protected GitHub Environment with required reviewers for the `apply` job.
- Prefer manual approval for `apply` to production; require at least one operator to verify the backup artifact before approving.
- Consider adding an automated restore-to-ephemeral step in CI if you want end-to-end verification (requires temporary DB provisioning).

## Supabase (local + CI fallback) — quick guide

If your team uses Supabase and you already logged in locally (VS Code Supabase extension or `supabase login`), you can use Supabase Storage as an external fallback for storing dumps when GitHub Actions artifact upload is blocked by quota.

When to use: runner's artifact upload fails (artifact quota hit) or you want a durable external backup that is independent of GitHub Actions storage.

What you'll need (CI secrets or local env):
- `SUPABASE_URL` (e.g. https://<project_ref>.supabase.co)
- `SUPABASE_SERVICE_ROLE_KEY` (service_role key — keep this secret; only store in GitHub Environment secrets)
- `SUPABASE_PROJECT_REF` (the short project ref used in URLs)
- a `bucket` in Supabase Storage (create via Supabase UI or `supabase` CLI)

Local quick steps (create dump, verify, upload to Supabase Storage):

```powershell
# 1. set DB url (already exported by your dev environment or Supabase extension)
$env:MIGRATE_DATABASE_URL = "postgresql://user:pass@host:5432/dbname"

# 2. make a timestamped dump and compress
$ts = (Get-Date).ToString("yyyyMMddTHHmmss")
pg_dump $env:MIGRATE_DATABASE_URL | gzip > "migration-backup-$ts.sql.gz"

# 3. verify gzip integrity
gzip -t "migration-backup-$ts.sql.gz"

# 4. upload to Supabase Storage with curl (service role key required)
$env:SUPABASE_URL = "https://$env:SUPABASE_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "REPLACE_WITH_YOUR_SERVICE_ROLE_KEY"

curl -X PUT "$($env:SUPABASE_URL)/storage/v1/object/migration-backups/migration-backup-$ts.sql.gz" \
	-H "Authorization: Bearer $env:SUPABASE_SERVICE_ROLE_KEY" \
	-H "x-upsert: true" \
	--data-binary @"migration-backup-$ts.sql.gz"
```

Notes:
- The example uses the storage path `migration-backups` as the bucket/object path — create a bucket named `migration-backups` in your Supabase project first.
- The service role key is powerful — store it in a protected GitHub Environment secret (do NOT commit it).

CI workflow fallback (concept)

If you want the `run-migrations.yml` workflow to attempt Supabase Storage upload when the GitHub artifact upload fails, implement a fallback step that:

1. Detects artifact upload failure (the action step exits non-zero or sets an output).  
2. Runs a step guarded by `if: secrets.SUPABASE_SERVICE_ROLE_KEY != ''` to upload the generated dump to Supabase Storage using curl (or the `supabase` CLI if you prefer).  
3. Publishes the external URL (or artifact metadata) as a workflow output or writes it to the run logs so operators can verify before approving apply.

Example (pseudo-step) for a workflow:

```yaml
# after creating migration-backup-<ts>.sql.gz
- name: Upload fallback to Supabase Storage
	if: failure() && secrets.SUPABASE_SERVICE_ROLE_KEY
	run: |
		curl -X PUT "https://${{ secrets.SUPABASE_PROJECT_REF }}.supabase.co/storage/v1/object/migration-backups/${{ env.ARTIFACT_NAME }}" \
			-H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
			-H "x-upsert: true" \
			--data-binary @"${{ env.ARTIFACT_PATH }}"
```

Security & operational recommendations for the fallback:
- Store the service role key only in a protected GitHub Environment and require approvals for `apply`.  
- Make the workflow publish a checksum (sha256) of the uploaded file and require reviewers to verify the checksum matches the one produced by the runner before approving the apply step.  
- Log the external URL in the workflow run and optionally write a small JSON metadata file (artifact name, ts, size, sha256) into the repo's reports folder or to an internal dashboard.

If you'd like, I can add the optional Supabase fallback step directly to `.github/workflows/run-migrations.yml` and wire the workflow to produce a checksum output. To do that I'll need to update the workflow file in this branch — tell me to proceed and I'll make the change and run a quick validation (syntax) locally.

Quick notes from our recent run (what worked in local diagnostics):

- Listing objects: use POST /storage/v1/object/list/{bucket} with a JSON body that includes at least {"prefix":"","limit":50}. A GET call or missing prefix returns 400 or 404 depending on inputs.
- Upload that reliably worked for our project: PUT to /storage/v1/object/{bucket}/{objectKey} with headers `Authorization: Bearer <service_role_key>` and `apikey: <service_role_key>`. The older POST /object/put/{bucket}/{object} form may return 404 in some setups — prefer the PUT form.
- For CI we recommend uploading both the gzipped dump and the .sha256 checksum file and recording the HTTP status. Reviewers should compare the checksum produced by the runner with the stored `.sha256` in Supabase before approving the `apply` job.

Local quick checklist (what I automated during diagnostics):

1. Create dump and gzip using `pg_dump` (prefer v17) -> `migration-backup-<ts>.sql.gz`
2. Create `<file>.sha256` using `sha256sum` or PowerShell `Get-FileHash` on Windows.
3. Upload to Supabase using PUT to `/storage/v1/object/{bucket}/{file}` with headers `Authorization` and `apikey` = service role key.
4. To list or pick the latest file programmatically, POST to `/storage/v1/object/list/{bucket}` with body `{"prefix":"","limit":50}` and sort by `metadata.lastModified`.
5. Download back and compare SHA256 to verify integrity.

Status: implemented in this branch
---------------------------------
I added a Supabase upload step and checksum generation to the `backup` job in `.github/workflows/run-migrations.yml` on the current branch. The backup job now:

- Produces a gzipped plain SQL dump: `migration-backup-<ts>.sql.gz`
- Computes a SHA256 checksum file next to the dump: `migration-backup-<ts>.sql.gz.sha256`
- Still attempts to upload an Actions artifact (`migration-backup`) so workflows that rely on artifacts keep working when quota allows
- Additionally uploads the dump and checksum to Supabase Storage when `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, and `SUPABASE_BUCKET` are provided as secrets in CI. The step emits the expected public object path (if the bucket is public) and prints HTTP status codes for debugging.

What you need to set in GitHub Environments / repo secrets for CI to use Supabase fallback:

- `SUPABASE_URL` (e.g. `https://<project-ref>.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` (service_role key; store only in protected environment secrets)
- `SUPABASE_BUCKET` (the bucket name where backups will be stored, e.g. `migration-backups`)

Verification flow for reviewers:

1. After the `backup` job completes, the run logs will show the SHA256 produced by the runner and the Supabase upload HTTP status. Copy the checksum from the run logs (or download the `.sha256` file from Supabase) and compare it with the local checksum from the runner.
2. If checksums match, approve the `apply` job in the protected environment.
3. If Supabase upload failed and Actions artifact upload also failed, retry after freeing artifact quota or re-run workflow with the `dry_run=true` to re-generate a fresh dump.

If you'd like, I can next:

- Add a short verification action in the `apply` job that fetches the Supabase object (using the service role key) and verifies the checksum automatically before running `apply` (requires service role secret in the environment). This automates the manual checksum compare step.
- Or mark the `backup` job to always upload to Supabase (even when Actions artifacts succeed) to keep an external durable copy.

Tell me which of the two you'd prefer and I'll implement it next.
