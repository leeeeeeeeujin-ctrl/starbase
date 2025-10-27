run-rpc-supabase runner

Purpose
- Local helper to call the `finalize_rank_session_outcome` RPC using your Supabase project's service role key.
- Keeps secrets local: a `.env` file is used (copy from `.env.example`) and must NOT be committed.

Setup
1) From the `ai-roomchat/scripts` directory, install deps:

```powershell
cd C:\Users\yujin\Documents\234423\starbase\ai-roomchat\scripts
npm install @supabase/supabase-js dotenv
```

2) Create a local `.env` file (copy the example):

```powershell
copy .env.example .env
# then edit .env with your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
notepad .env
```

Important: add `.env` to your `.gitignore` if it is not already ignored.

Run
- Once `.env` contains your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run:

```powershell
node run-rpc-supabase.js
```

- The script prints the RPC result or any error. If you want to test a particular session id, set `SESSION_ID` in `.env` or export it in the shell before running.

Security notes
- The service role key grants broad privileges. Keep it local and never commit or paste it publicly.
- This script runs locally and does not transmit your key anywhere except to Supabase when calling the RPC.

If you want, I can also:
- add a small PowerShell wrapper that temporarily sets environment variables for a single run and then clears them.
- extend the script to create a temporary session then call the RPC (useful if you don't have a session id).
