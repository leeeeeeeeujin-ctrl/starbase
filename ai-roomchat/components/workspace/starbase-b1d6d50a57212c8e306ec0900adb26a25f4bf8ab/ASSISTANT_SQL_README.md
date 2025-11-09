ASSISTANT-SQL: local SQL runner for assistant
---------------------------------------------

Purpose
  - Allow running SQL locally against your Supabase (Postgres) instance using local-only secrets (e.g., `ai-roomchat/SPPP`).

Quick start
  1. Ensure your `ai-roomchat/SPPP` file exists and contains the Supabase URL and a password line (the repo already contains this file locally).
  2. Install Python deps:
     ```powershell
     cd C:\Users\yujin\Documents\234423\starbase
     python -m pip install -r tools/requirements.txt
     ```
  3. Run the example query:
     ```powershell
     python tools/run_sql.py --file assistant-sql/examples/select_version.sql
     ```
  4. Results are written to `assistant-sql/results.json`.

HTTP alternative (works when Postgres port is blocked)
  - If your environment blocks outbound Postgres (port 5432), use the HTTP helper which talks to Supabase over HTTPS (port 443):
    ```powershell
    python tools/run_sql_http.py --table your_table_name --select "*"
    ```
  - This uses the service key found in `ai-roomchat/SPPP` and performs table-level SELECTs via the Supabase REST API. It cannot execute arbitrary SQL strings.

Notes & Security
  - The SPPP file is never sent to remote systems by this tool. Keep it local and git-ignored.
  - Prefer read-only DB accounts for safety. Use key rotation if the key is ever exposed.
