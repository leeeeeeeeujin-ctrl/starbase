# Supabase Schema Digest

Latest reference for every Supabase entity that backs Starbase AI Roomchat. Each entry lists column highlights, security and indexing rules, plus helper routines so feature teams can evolve the schema without reopening the raw SQL exports. 매칭과 관련된 테이블만 보고 싶다면 새로 정리한 `matchmaking-supabase-handbook.md`를 참고하세요.【F:docs/matchmaking-supabase-handbook.md†L1-L40】

> 💾 **빠른 복구용 DDL**: 새 인스턴스를 부트스트랩해야 하면 `docs/supabase-rank-schema.sql` 파일을 Supabase SQL Editor에 그대로 붙여 넣으면 모든 필수 테이블·정책·스토리지 정책을 한 번에 재생성할 수 있습니다.

## Global Setup

- The project enables the `pgcrypto` extension so `gen_random_uuid()` is available for UUID primary keys throughout the schema.【F:starbase/ai-roomchat/supabase.sql†L1-L2】

## Core Hero Assets

### `public.heroes`

- Columns capture ownership, four ability blurbs, optional media (image/background/BGM) metadata, and timestamp auditing for each hero profile.【F:starbase/ai-roomchat/supabase.sql†L7-L22】
- RLS restricts CRUD to the owning user while exposing a `public.rank_heroes` view with anon/auth read grants; storage policies allow authenticated uploads scoped to the `heroes` bucket.【F:starbase/ai-roomchat/supabase.sql†L25-L58】

## Prompt Authoring & Library

### `public.prompt_sets`

- Stores maker-owned prompt set metadata including name, description, public visibility flag, and timestamps.【F:starbase/ai-roomchat/supabase.sql†L63-L71】
- RLS lets owners mutate their sets while reads are permitted when the set is public or owned.【F:starbase/ai-roomchat/supabase.sql†L73-L85】

### `public.prompt_slots`

- Slot definitions keep placement, template text, visibility arrays, and variable rule JSON for each prompt set slot.【F:starbase/ai-roomchat/supabase.sql†L87-L103】
- Policies mirror parent ownership/public access for select plus owner-only insert/update/delete.【F:starbase/ai-roomchat/supabase.sql†L105-L133】

### `public.prompt_bridges`

- Bridges connect slots with trigger word arrays, conditional JSON, weighting, and fallback actions to drive branching flows.【F:starbase/ai-roomchat/supabase.sql†L135-L148】
- The same owner/public checks gate selects, while owners alone can create or modify bridge rows.【F:starbase/ai-roomchat/supabase.sql†L150-L178】

### `public.prompt_library_entries`

- Publishes prompt sets to a library with unique `set_id`, payload JSON, download counters, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L180-L190】
- Any user can read entries, but owners control inserts/updates; a definer function increments downloads and a trigger touches `updated_at` whenever rows change.【F:starbase/ai-roomchat/supabase.sql†L192-L263】

## Operational Monitoring

### `public.rank_user_error_reports`

- Captures client error reports with optional user/session info, path, stack, JSON context, severity, and timestamps for admin dashboards.【F:starbase/ai-roomchat/supabase.sql†L206-L217】
- Indexed by `created_at` and `severity`, with RLS enabled to protect access patterns.【F:starbase/ai-roomchat/supabase.sql†L219-L225】

### `public.rank_audio_preferences`

- One row per `(owner_id, profile_key)` containing hero references, EQ/reverb/compressor JSON payloads, override flags, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L268-L283】
- Unique and recency indexes accelerate lookups; owner-scoped RLS plus an `updated_at` trigger enforce safe personalization edits.【F:starbase/ai-roomchat/supabase.sql†L285-L324】

### `public.rank_audio_events`

- Logs audio interactions with owner/profile/hero references, event types, detail JSON, and creation timestamp while supporting owner-filtered analytics.【F:starbase/ai-roomchat/supabase.sql†L339-L349】
- Weekly trend and breakdown SQL helper functions power admin charts, and RLS restricts reads/inserts to the owning user.【F:starbase/ai-roomchat/supabase.sql†L351-L467】

### `public.rank_audio_monitor_rules`

- Stores monitoring rule definitions (type, label, notes, JSON config, sort order, timestamps) that automation consumes.【F:starbase/ai-roomchat/supabase.sql†L468-L477】
- A trigger refreshes `updated_at`, indexes optimize rule lists, and only the service role may interact with the table via RLS.【F:starbase/ai-roomchat/supabase.sql†L479-L503】

### `public.rank_title_settings`

- Holds a single row per slug (default `main`) with `background_url`, optional operator `update_note`, and audit timestamps to drive the landing hero background that the admin portal edits.【F:starbase/ai-roomchat/supabase.sql†L508-L549】
- Expose read access to any viewer while restricting mutations to service integrations; the `slug` primary key keeps `upsert` operations idempotent.【F:starbase/ai-roomchat/supabase.sql†L532-L548】
- Store uploaded artwork in a public storage bucket such as `title-backgrounds/` so the admin portal can upload binaries via the service role and the landing hero can render the resulting public URL.【F:starbase/ai-roomchat/supabase.sql†L37-L58】【F:starbase/ai-roomchat/supabase.sql†L508-L549】

### `public.rank_announcements`

- Backs the admin notice composer with UUID ids, title/body copy, published timestamp, and audit triggers so roster and landing surfaces can show the freshest announcement.【F:starbase/ai-roomchat/supabase.sql†L551-L596】
- The published-at index and service-role-only write policies keep feeds fast while exposing read-only access to everyone.【F:starbase/ai-roomchat/supabase.sql†L560-L596】

### `public.rank_api_key_cooldowns`

- Captures hashed key samples, providers, reasons, timeline metadata, and JSON payloads that power cooldown analytics dashboards.【F:starbase/ai-roomchat/supabase.sql†L601-L619】
- Unique and timeline indexes plus service-role-only RLS policies keep inserts and queries constrained to automation flows.【F:starbase/ai-roomchat/supabase.sql†L621-L663】

### `public.rank_api_key_audit`

- Tracks each cooldown alert attempt with status, retry counts, timing metadata, automation/digest payloads, and notes for historical review.【F:starbase/ai-roomchat/supabase.sql†L665-L687】
- Service-role RLS simplifies write/read access for automation while keeping the history private to the backend.【F:starbase/ai-roomchat/supabase.sql†L682-L687】

### `public.rank_cooldown_timeline_uploads`

- Stores telemetry about automated CSV/timeline exports including section/mode identifiers, status, uploaded timestamp, metadata, and optional error notes.【F:starbase/ai-roomchat/supabase.sql†L689-L708】
- Section/status indexes and service-role-only policies ensure dashboards load quickly while preventing user access to operational logs.【F:starbase/ai-roomchat/supabase.sql†L703-L714】

## Game Catalog & Seasonal Metadata

### `public.rank_games`

- Game shells hold owner linkage, descriptive metadata, prompt/rule JSON payloads, engagement counters, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L720-L734】
- Owner-controlled RLS handles mutations while everyone can browse definitions.【F:starbase/ai-roomchat/supabase.sql†L736-L748】

### `public.rank_game_roles`

- Defines role slots per game including slot counts, activation flag, and score delta bounds with timestamps.【F:starbase/ai-roomchat/supabase.sql†L750-L759】
- Global read access with owner-linked policies for modifications.【F:starbase/ai-roomchat/supabase.sql†L761-L775】

### `public.rank_game_tags`

- Maintains `(game_id, tag)` associations plus created timestamp to power discovery filters.【F:starbase/ai-roomchat/supabase.sql†L777-L783】
- All users may read, but mutations require matching game ownership via RLS.【F:starbase/ai-roomchat/supabase.sql†L785-L799】

### `public.rank_game_seasons`

- Seasons track game linkage, name, status, start/end times, leaderboard JSON, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L801-L810】
- Open for reads with owner-governed updates enforced by policies.【F:starbase/ai-roomchat/supabase.sql†L812-L827】

### `public.rank_game_slots`

- Slot grid rows map slot indices to roles, hero defaults, ownership, and timestamps with a uniqueness constraint per game.【F:starbase/ai-roomchat/supabase.sql†L829-L839】
- Readable by all, while updates require control of the parent game.【F:starbase/ai-roomchat/supabase.sql†L842-L856】

## Participation & Battle History

### `public.rank_participants`

- Player enrollment keeps hero arrays, mirrored `slot_no`, role, rating/score stats, battle counts, likes, win rate, status, and timestamps with unique `(game_id, owner_id)` constraint plus a partial `(game_id, slot_no)` guard for seated slots.【F:starbase/ai-roomchat/supabase.sql†L898-L923】
- RLS allows universal reads but only the participant may insert/update/delete their row; the `(game_id, role, status, updated_at desc)` index accelerates drop-in/비실시간 후보 스캔 시 최신 상태를 찾는 데 사용합니다.【F:starbase/ai-roomchat/supabase.sql†L925-L940】

### `public.rank_battles`

- Records matches with attacker/defender ownership, hero arrays, outcome, score delta, hidden flag, and creation time.【F:starbase/ai-roomchat/supabase.sql†L892-L902】
- Publicly readable and open to authenticated inserts for result logging.【F:starbase/ai-roomchat/supabase.sql†L905-L911】

### `public.rank_battle_logs`

- Stores per-turn transcripts including prompts, AI responses, metadata JSON, and timestamps linked to games and battles.【F:starbase/ai-roomchat/supabase.sql†L913-L921】
- Selectable by everyone with authenticated users permitted to insert.【F:starbase/ai-roomchat/supabase.sql†L1058-L1064】

## Rooms & Matchmaking

### `public.rank_rooms`

- Represents live rooms with game/owner references, join code, mode/realtime mode/status, slot/ready counters, host role caps, brawl rule snapshot, host heartbeat, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L924-L941】
- RLS lets anyone read, owners create, and owners or seated occupants update rooms.【F:starbase/ai-roomchat/supabase.sql†L973-L998】

### `public.rank_room_slots`

- Tracks each room slot’s role, occupant ownership/hero, readiness state, join time, and timestamp audit with unique `(room_id, slot_index)` constraint.【F:starbase/ai-roomchat/supabase.sql†L939-L949】
- Accessible for reads, while inserts require room ownership and updates allow either occupants or the host to change their slot.【F:starbase/ai-roomchat/supabase.sql†L1000-L1034】
- Indexed by `(room_id, role, occupant_owner_id)` so vacancy scans for drop-in matching can quickly locate open seats without table scans.【F:starbase/ai-roomchat/supabase.sql†L949-L951】

### `public.rank_match_roster`

- Ephemeral roster snapshot keyed by `match_instance_id`, storing the seated owner/hero pair per slot alongside readiness flags and cached stats (`score`, `rating`, `battles`, `win_rate`) that the main game consumes right after room fill.【F:starbase/ai-roomchat/supabase.sql†L1129-L1156】
- Universal read access keeps the start client lightweight, while service-role policies gate inserts/updates/deletes so only the staging API can refresh the lineup.【F:starbase/ai-roomchat/supabase.sql†L1158-L1164】

### `public.rank_match_queue`

- Queue entries capture game/mode/role, owning player, hero choice, score, simulated stand-in marker, party key, status, joined/updated timestamps, and optional match code.【F:ai-roomchat/supabase.sql†L1272-L1287】
- Indexed for queue scanning and owner lookups; RLS exposes waiting entries to everyone and allows owners to manage their own rows.【F:ai-roomchat/supabase.sql†L1289-L1378】

### `public.rank_matchmaking_logs`

- Append-only audit of each matchmaking pipeline stage with status, reason, score window, match code, and JSON metadata so diagnostics dashboards can explain why a match succeeded or stalled.【F:starbase/ai-roomchat/supabase.sql†L1014-L1039】
- Service-role-only insert/select policies protect the stream while still allowing the admin API to render summaries without exposing raw rows to clients.【F:starbase/ai-roomchat/supabase.sql†L1031-L1039】

## Session Runtime

### `public.rank_sessions`

- Session rows record the active game, optional owner, status, current turn pointer, optional `rating_hint` score snapshot, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L1066-L1077】
- Policies allow reads/writes for the owning user or shared null-owner sessions.【F:starbase/ai-roomchat/supabase.sql†L1079-L1088】
- The `(status, game_id, updated_at desc)` index accelerates the realtime drop-in probe when scanning for in-progress sessions.【F:starbase/ai-roomchat/supabase.sql†L1078-L1079】

### `public.rank_turns`

- Holds ordered turn content with session linkage, index, role, visibility flag, text, and timestamp audit for replays.【F:starbase/ai-roomchat/supabase.sql†L1087-L1094】
- Global read plus authenticated insert permissions support collaborative recording.【F:starbase/ai-roomchat/supabase.sql†L1097-L1103】

## Chat & Social Graph

### `public.messages`

- Chat feed rows include identity (user/owner IDs, username, avatar), optional hero targeting, scope, message text, metadata JSON, and timestamps, with constraints keeping text length within bounds.【F:starbase/ai-roomchat/supabase_chat.sql†L2-L44】【F:starbase/ai-roomchat/supabase_chat.sql†L54-L80】
- Foreign keys are enforced for user/owner/hero references, RLS permits global reads and authenticated inserts from the sender, and indexes power timeline queries by created time and scope/hero targeting.【F:starbase/ai-roomchat/supabase_chat.sql†L82-L182】

### `public.friend_requests`

- Columns track requester/addressee, status enum, optional message, and audit timestamps; supporting indexes cover recipient and sender status filters plus a unique pending constraint.【F:starbase/ai-roomchat/supabase_social.sql†L4-L18】
- Participant-scoped RLS governs selects/mutations, with a trigger using `public.set_updated_at()` to refresh `updated_at` automatically.【F:starbase/ai-roomchat/supabase_social.sql†L20-L85】

### `public.friendships`

- Stores canonical friend pairs with ordered user IDs, `since` timestamp, uniqueness constraint, and helper indexes for each participant.【F:starbase/ai-roomchat/supabase_social.sql†L39-L55】
- RLS restricts access to involved users for reads/inserts/deletes.【F:starbase/ai-roomchat/supabase_social.sql†L57-L69】

### Helper Routine

- `public.set_updated_at()` trigger function standardizes `updated_at` refreshes for social tables, currently wired to friend request updates.【F:starbase/ai-roomchat/supabase_social.sql†L71-L85】

This digest now mirrors every table, index, policy, and function defined across `supabase.sql`, `supabase_chat.sql`, and `supabase_social.sql`, keeping the blueprint unblocked when new monitoring, matchmaking, or social features land.
