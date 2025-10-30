# Seeding schema_migrations for existing databases

When introducing `schema_migrations` into an existing database that already had migrations applied manually or by another process, you should seed the `schema_migrations` table so the migration runner will skip already-applied SQL files.

Steps

1. Inspect which SQL files are present in the repository's `ai-roomchat/sql` directory and determine which ones have already been applied to the target DB.

2. For each applied file, compute the SHA256 checksum of the file contents (UTF-8) and insert a record into `public.schema_migrations`.

Example SQL to insert a single file (replace filename/checksum):

```sql
INSERT INTO public.schema_migrations(filename, checksum, applied_at)
VALUES ('001_create_prompt_runs.sql', 'YOUR_SHA256_CHECKSUM_HERE', now())
ON CONFLICT (filename) DO NOTHING;
```

3. Quick way to compute checksum locally (Linux/macOS):

```sh
sha256sum ai-roomchat/sql/001_create_prompt_runs.sql
```

Windows (PowerShell):

```powershell
Get-FileHash -Algorithm SHA256 .\ai-roomchat\sql\001_create_prompt_runs.sql | Select-Object -ExpandProperty Hash
```

4. After seeding, run the migration runner as usual. It will skip files that have records in `schema_migrations` and apply remaining files.

Notes
- If you do not seed `schema_migrations` and the SQL files include `CREATE TABLE` statements for objects that already exist, the migration run will fail. Seeding prevents accidental reapplication.
- Keep an audit of the seeding process (who ran it and why) — consider inserting a record into an admin table or leaving a note in repo/ticketing system.
