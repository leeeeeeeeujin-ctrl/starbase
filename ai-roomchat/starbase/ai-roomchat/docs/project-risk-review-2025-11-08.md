# Project Risk Review — 2025-11-08

## Summary

- Surfaced high-impact backend risks where current implementations bypass the standard RPC + RLS guardrails.
- Flagged client-led session overlays that lack TTL/expiry controls and can drift from server truth.
- Noted stage-room staging flows that silently skip validation when RPCs are absent, risking schema drift.

## Key Risks

### 1. Social/chat API routes bypass RPCs and authentication

- `pages/api/messages/list` and `send` call `supabase.from('messages')` directly with whatever key is configured, returning or inserting arbitrary records without channel scoping or auth checks.【F:pages/api/messages/list.js†L1-L25】【F:pages/api/messages/send.js†L1-L39】
- The shared client will happily use the service-role secret when available, meaning these routes can expose all chat history and accept forged payloads from unauthenticated callers.【F:lib/rank/db.js†L1-L33】
- Impact: Multi-tenant data leaks, spoofed chat events, and RLS bypasses that are hard to detect once shipped.
- Recommendation: Ship the `fetch_social_messages` RPC (SQL below) and convert both routes to require bearer tokens before delegating to RPC wrappers that enforce channel filters and server-side auth context.

### 2. Rank overlay state never expires outside of user focus changes

- Active session state is stored solely in `localStorage` with manual setters/getters and no TTL or cleanup beyond focus/visibility hooks.【F:lib/rank/activeSessionStorage.js†L1-L125】【F:components/rank/ActiveMatchOverlay.js†L1-L200】
- When a browser tab remains idle (e.g., spectator display), the overlay persists indefinitely until the user revisits, with no server-driven invalidation.
- Impact: Stale overlays that mislead hosts, potential conflicts when users join different sessions from another device, and no guarantee that forced retirements propagate.
- Recommendation: Introduce an expiry timestamp in storage plus a Supabase Realtime channel (or RPC-backed TTL view) to broadcast invalidations so overlays collapse when sessions close elsewhere.

### 3. Stage-room roster validation quietly skips when RPCs drift

- The stage-room API uses `verify_rank_roles_and_slots` and `sync_rank_match_roster` RPCs, but it treats "function does not exist" errors as benign and proceeds with writes based on client-supplied slot templates.【F:pages/api/rank/stage-room-match.js†L298-L370】
- If migrations fail or environments lag behind, roster payloads will bypass validation and still stage entries via the service-role client, inviting schema drift or invalid slot layouts.
- Impact: Silent data divergence between environments and harder incident response when staging fails only in production.
- Recommendation: Fail closed when validation RPCs are absent, and add automated migration checks so API deploys block if required RPCs aren't present.

## Next Steps

- Prioritise RPC coverage for social/chat, aligning reads/writes with Supabase row-level policies.
- Layer TTLs or server-driven invalidations for client overlays using Realtime or database-driven expirations.
- Harden stage-room staging by enforcing RPC availability and surfacing migration drift early in CI.

## Supabase SQL Appendix

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
