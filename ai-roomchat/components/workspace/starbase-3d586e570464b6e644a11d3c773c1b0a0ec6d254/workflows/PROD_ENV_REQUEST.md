# Request: Create protected `production` GitHub Environment

Use this template to ask repository administrators to create a protected `production` GitHub Environment and add required secrets for the migration workflow.

Copy this into a new GitHub Issue and @ the repository admins or the ops team.

---
Title: Request: Create protected `production` GitHub Environment and register secrets

Body:

Please create a GitHub Environment named `production` for repository `leeeeeeeeujin-ctrl/starbase` and register the following secrets. This environment will be used to gate and approve production DB schema migrations.

Required environment settings:

- Environment name: `production`
- Protection: Require approval from [team or user] (please set at least one reviewer)

Secrets to add (Environment-scoped secrets only):

- `MIGRATE_DATABASE_URL` — Production DB connection string used for `apply` (example: postgres://user:pass@host:5432/db)
- `SUPABASE_SERVICE_ROLE_KEY` — Optional: service_role key for Supabase backup fallback. Highly sensitive.
- `SUPABASE_URL` — Optional: e.g. `https://<project>.supabase.co`
- `SUPABASE_BUCKET` — Optional: e.g. `migration-backups`

Optional configuration:

- Add organization-level required reviewers or a specific admin team as the approver(s) for `production` environment runs.
- Consider enabling 'wait for approval' or 'required reviewers' to prevent accidental apply.

Acceptance checklist (please confirm once done):

- [ ] Environment `production` created
- [ ] Required reviewers configured
- [ ] `MIGRATE_DATABASE_URL` added
- [ ] (Optional) Supabase secrets added: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_BUCKET`

If you need help with values or verification steps, I can provide a small verification job that attempts a dry-run and backup upload to Supabase for confirmation.
