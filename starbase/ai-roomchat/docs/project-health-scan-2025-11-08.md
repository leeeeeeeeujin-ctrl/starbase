# Project Health Scan — 2025-11-08

## Runtime & UI Shell
- Next.js Pages Router is kept lean, with the custom `_app` injecting shared overlays and diagnostics so that rank status and hero overlays persist across screens while allowing maker/roster areas to opt out for clarity.【F:pages/_app.js†L1-L32】
- The rank overlay pulls session context from Supabase and local storage, refreshing whenever focus or visibility changes to keep the floating state card in sync with ongoing matches.【F:components/rank/ActiveMatchOverlay.js†L1-L200】

## Supabase Integration
- The browser client guards against misconfigured URLs, wraps Supabase auth with PKCE, and reuses headers/fetch adapters so RPC and REST calls line up with Supabase Edge policies.【F:lib/supabase.js†L1-L34】
- Service-role usage is centralized in `supabaseAdmin`, which composes the same auth config helpers while preventing session persistence, helping API routes execute privileged RPC calls safely.【F:lib/supabaseAdmin.js†L1-L25】
- `withTable` abstracts logical table names to multiple physical candidates and caches the resolved match, letting shared code survive across schema variants during migrations.【F:lib/supabaseTables.js†L1-L99】
- The baseline SQL bundle provisions heroes, prompt builders, and storage policies with row-level security, meaning a fresh project can be stood up quickly once the script is executed in SQL Editor.【F:supabase.sql†L1-L160】

## Game & Match Flow
- Rank overlays subscribe to the browser session cache, revalidating with Supabase auth and fetching the latest session rows so stale entries are cleaned up automatically.【F:components/rank/ActiveMatchOverlay.js†L115-L200】
- The realtime sync module aggressively normalises roster rows, hero metadata, and role groupings, offering deterministic slot templates for downstream UI and RPC payloads.【F:modules/rank/matchRealtimeSync.js†L1-L168】
- Stage-room API endpoints authenticate via the anon client, fan out to service-role reads, verify role/slot templates, and ultimately synchronise rosters through dedicated RPCs (`verify_rank_roles_and_slots`, `sync_rank_match_roster`).【F:pages/api/rank/stage-room-match.js†L1-L370】
- Turn-event polling is already lifted into `fetch_rank_turn_state_events` RPC calls, aligning with the practice of keeping latency-sensitive reads in database functions.【F:pages/api/rank/turn-events.js†L1-L81】

## Domain Services & Tooling
- Hero services reuse the logical-table wrapper so list/detail/delete queries adapt whether the environment exposes `heroes` or a rank-prefixed view, reducing drift between dev and prod schemas.【F:services/heroes.js†L1-L127】
- Debug instrumentation captures up to 200 client-side events with lightweight subscriber hooks, giving insight into Supabase failures without crashing the UI.【F:lib/debugCollector.js†L1-L121】
- Tooling scripts cover blueprint refreshers, edge-function verification, and simulators on top of the usual Next build/test commands, suggesting ops automation is already embedded in the package scripts.【F:package.json†L1-L41】

## Observations & Potential Follow-ups
- Supabase RPC coverage is strong for rank features, but similar wrappers for social/chat endpoints were not reviewed in depth; auditing remaining API routes for consistent RPC adoption would reduce surface area variance.
- Realtime coordination is currently browser-led (session storage, focus handlers). Long-lived spectators might benefit from TTL tuning or server-side invalidation hooks to avoid stale overlays.
- Consider codifying table alias mappings in migrations (e.g., via views) once schema stabilises so `withTable` can default to a single canonical name per logical table.

