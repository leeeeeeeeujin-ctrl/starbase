# Match Ready Snapshot Review — 2025-11-08

## Overview
- Introduced `fetch_rank_match_ready_snapshot` RPC to centralise roster, room, session, and readiness metadata.
- Catch `WITHIN GROUP` ordered-set aggregate errors and surface actionable hints in the Match Ready diagnostics panel.
- Match Ready client now resets refresh hints and renders RPC-derived troubleshooting details.

## Flow after refactor
1. **Client load**
   - `loadMatchFlowSnapshot` first calls the new RPC. The RPC returns a compact JSON payload containing:
     - Latest roster rows constrained to the newest slot template version.
     - Resolved room row (current or most recent for the game).
     - Latest active/preparing session row and its meta snapshot.
     - Ready-signal history for the session.
   - Ordered-set aggregate misconfigurations throw a dedicated `ordered_set_aggregate` error with a descriptive hint.
2. **Fallback**
   - When the RPC is missing or returns null, the loader falls back to the legacy multi-table queries so older deployments remain functional.
3. **Diagnostics**
   - `MatchReadyClient` records `lastRefreshHint` for snapshot failures, rendering the SQL guidance directly in the diagnostics panel.

## Why WITHIN GROUP matters
- Postgres treats percentile, mode, and other ordered-set aggregates as requiring `WITHIN GROUP (ORDER BY ...)` clauses.
- A missing clause produces the database error: `WITHIN GROUP is required for ordered-set aggregate mode`.
- The new loader intercepts this signal to prevent silent fallback and instead raises a targeted hint so operators can fix the offending SQL function.

## Next steps for backend
- Deploy the new RPC via `docs/sql/fetch-rank-match-ready-snapshot.sql`.
- Audit existing Supabase functions using ordered-set aggregates (percentile, mode, ranked arrays) and ensure they specify `WITHIN GROUP`.
- Consider wiring the ready-signal payload into `MatchReadyClient`’s extras to unlock richer readiness analytics in a follow-up iteration.
