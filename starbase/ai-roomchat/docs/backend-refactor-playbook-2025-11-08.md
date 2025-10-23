# Backend Refactor Playbook — 2025-11-08

## Objectives

- Collapse all read/write paths behind Supabase RPCs so that RLS and audit policies stay authoritative while keeping API latency predictable.
- Push state authority into the database via locks, TTL views, and Realtime broadcasts to minimise client-only race conditions.
- Keep uploads and realtime fan-out on direct Supabase channels so Edge Functions remain thin, deterministic shims.
- Lock migrations, privileges, and region selection into repeatable automation so environments cannot drift silently.

## Scope Overview

| Area                  | Current Gap                                  | Refactor Goal                                         | Owner Signals                                                 |
| --------------------- | -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Social/chat API       | REST table calls from API routes bypass auth | RPC-only service with bearer auth and channel scoping | `fetch_social_messages` RPC deployed, API routes call wrapper |
| Rank overlay TTL      | Browser `localStorage` holds session forever | DB TTL source of truth + Realtime invalidations       | Overlay collapses when TTL view expires row                   |
| Stage-room validation | Missing RPCs silently bypass validation      | Fail closed and gate deploys on RPC availability      | CI migration check fails when RPC absent                      |
| Observability         | Manual log chasing                           | Structured traces around RPC adapters                 | Graph of RPC latency/error budget captured                    |

## Social & Chat RPC Alignment

1. **Deploy shared fetch RPC.**
   ```sql
   create or replace function public.fetch_social_messages(
     p_channel_id uuid,
     p_limit integer default 50,
     p_since timestamptz default null
   )
   returns setof public.social_messages
   language sql
   security definer
   set search_path = public
   as $$
     select *
     from public.social_messages
     where channel_id = p_channel_id
       and (p_since is null or inserted_at > p_since)
     order by inserted_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
   $$;
   ```
2. **Introduce RPC client wrapper.** In `services/socialMessages.js`, export `listMessages(channelId, options)` and `sendMessage(channelId, payload)` that call `supabaseClient.rpc('fetch_social_messages', ...)` and `supabaseClient.rpc('insert_social_message', ...)`. Ensure both wrappers require a resolved user session and inject `access_token` headers for server-to-server usage.
3. **Harden API routes.** Update `pages/api/messages/list.js` and `pages/api/messages/send.js` to:
   - Reject when `req.headers.authorization` is absent or invalid.
   - Resolve the Supabase user via `supabaseServerClient.auth.getUser()`.
   - Delegate to the service wrappers above.
   - Normalise errors so clients get 401/403 on auth issues and 422 when payload validation fails.
4. **Testing hooks.** Extend `__tests__/api/messages.test.js` to cover happy path, missing bearer token, and channel scoping using mocked RPC responses.

## Rank Overlay Expiry & Realtime

1. **Persist TTL in DB.** Add a `rank_session_overlays` table (or a view joining `rank_sessions`) with `expires_at` derived from server events. A Postgres `generated always as` column can compute `inserted_at + interval '5 minutes'` or use explicit updates from session lifecycle RPCs.
2. **Realtime channel for invalidations.**
   - Publish `overlay_expired` events from a `notify_overlay_ttl()` trigger when `expires_at < now()`.
   - Subscribe in the browser via `supabaseClient.channel('rank_overlay_ttl')` and collapse local overlay state on receipt.
3. **Client storage cleanup.**
   - Store overlays with `{ sessionId, expiresAt, version }`.
   - On focus or message receipt, compare `expiresAt` against `Date.now()` and remove stale records before rendering.
   - Guard `setActiveSession` so it refuses to hydrate sessions older than the TTL or with mismatched versions.
4. **Operational sweeps.** Schedule a Postgres cron (via pg_cron or Supabase scheduled task) to run `delete from rank_session_overlays where expires_at < now()` as a safety net.

## Stage-room Validation Hardening

1. **Fail when RPCs absent.** Replace the current `function does not exist` swallow in `pages/api/rank/stage-room-match.js` with explicit error propagation so deploys break when migrations lag.
2. **Bootstrap migration check.** Add a `scripts/check-required-rpcs.mjs` script that queries `pg_proc` for `verify_rank_roles_and_slots` and `sync_rank_match_roster`. Wire it into `npm run lint && node scripts/check-required-rpcs.mjs` before builds.
3. **Versioned RPC contracts.** Encode expected RPC signatures in `supabase/rank_required_rpcs.json`, load them in the check script, and compare argument names/types. Fail CI if any mismatch appears.
4. **Edge function guardrails.** When a stage-room request arrives, log the matched RPC version and include it in structured telemetry so incidents surface quickly.

## Observability & Automation

- **RPC adapter tracing.** Wrap `lib/rank/db.js` exports with small interceptors that capture `functionName`, latency, row counts, and errors to `debugCollector`.
- **Schema lockstep.** Extend `supabase-rank-backend-upgrades.sql` with idempotent grants for the new overlay table/view and triggers. Ensure migrations set `search_path` and `role` explicitly so production/dev stay aligned.
- **Rollout playbook.** Document the deploy order: run migrations → deploy Edge Functions → ship Next.js routes. Include rollback steps when RPC activation fails.

## QA & Verification Matrix

| Scenario         | What to verify                                      | Tooling                                     |
| ---------------- | --------------------------------------------------- | ------------------------------------------- |
| Social list/read | Auth required, channel limited, pagination obeyed   | API integration tests + Supabase SQL mocks  |
| Social write     | Rejects missing auth, enforces channel membership   | Jest + staging environment smoke            |
| Overlay expiry   | Overlay disappears after TTL and upon server signal | Playwright scenario observing Realtime ping |
| Stage-room drift | Deploy fails when RPC missing                       | CI job tied to migration script             |

## Rollout Checklist

- [ ] Apply SQL migrations in staging, confirm RPC metadata.
- [ ] Ship service wrappers + API route updates.
- [ ] Enable TTL view + trigger, monitor logs.
- [ ] Run integration suite and smoke tests.
- [ ] Promote to production behind feature flags.
