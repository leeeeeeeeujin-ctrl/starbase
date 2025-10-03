# Supabase Schema Digest

Latest reference for every Supabase entity that backs Starbase AI Roomchat. Each entry lists column highlights, security and indexing rules, plus helper routines so feature teams can evolve the schema without reopening the raw SQL exports.

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
- Logs audio interactions with owner/profile/hero references, event types, detail JSON, and creation timestamp while supporting owner-filtered analytics.【F:starbase/ai-roomchat/supabase.sql†L326-L339】
- Weekly trend and breakdown SQL helper functions power admin charts, and RLS restricts reads/inserts to the owning user.【F:starbase/ai-roomchat/supabase.sql†L341-L454】

### `public.rank_audio_monitor_rules`
- Stores monitoring rule definitions (type, label, notes, JSON config, sort order, timestamps) that automation consumes.【F:starbase/ai-roomchat/supabase.sql†L455-L464】
- A trigger refreshes `updated_at`, indexes optimize rule lists, and only the service role may interact with the table via RLS.【F:starbase/ai-roomchat/supabase.sql†L466-L490】

### `public.rank_title_settings`
- Holds a single row per slug (default `main`) with `background_url`, optional operator `update_note`, and `updated_at` to drive the landing hero background that the admin portal edits.
- Expose read access to the service role API while restricting mutations to service integrations; add a unique primary key on `slug` so `upsert` updates stay idempotent.
- Store uploaded artwork in a public storage bucket such as `title-backgrounds/` so the admin portal can upload binaries via the service role and the landing hero can render the resulting public URL.

### `public.rank_announcements`
- Backs the admin notice composer with `id uuid default gen_random_uuid()`, `title`, `body`, `published_at`, and audit timestamps so roster and landing surfaces can show the freshest announcement.
- Create an index on `published_at desc` for the feed, and restrict write access to the service role while permitting read-only endpoints for the public portal.

## Game Catalog & Seasonal Metadata
### `public.rank_games`
- Game shells hold owner linkage, descriptive metadata, prompt/rule JSON payloads, engagement counters, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L495-L509】
- Owner-controlled RLS handles mutations while everyone can browse definitions.【F:starbase/ai-roomchat/supabase.sql†L512-L524】

### `public.rank_game_roles`
- Defines role slots per game including slot counts, activation flag, and score delta bounds with timestamps.【F:starbase/ai-roomchat/supabase.sql†L526-L535】
- Global read access with owner-linked policies for modifications.【F:starbase/ai-roomchat/supabase.sql†L537-L551】

### `public.rank_game_tags`
- Maintains `(game_id, tag)` associations plus created timestamp to power discovery filters.【F:starbase/ai-roomchat/supabase.sql†L553-L559】
- All users may read, but mutations require matching game ownership via RLS.【F:starbase/ai-roomchat/supabase.sql†L561-L575】

### `public.rank_game_seasons`
- Seasons track game linkage, name, status, start/end times, leaderboard JSON, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L577-L587】
- Open for reads with owner-governed updates enforced by policies.【F:starbase/ai-roomchat/supabase.sql†L589-L603】

### `public.rank_game_slots`
- Slot grid rows map slot indices to roles, hero defaults, ownership, and timestamps with a uniqueness constraint per game.【F:starbase/ai-roomchat/supabase.sql†L605-L616】
- Readable by all, while updates require control of the parent game.【F:starbase/ai-roomchat/supabase.sql†L618-L632】

## Participation & Battle History
### `public.rank_participants`
- Player enrollment keeps hero arrays, role, rating/score stats, battle counts, likes, win rate, status, and timestamps with unique `(game_id, owner_id)` constraint.【F:starbase/ai-roomchat/supabase.sql†L634-L651】
- RLS allows universal reads but only the participant may insert/update/delete their row.【F:starbase/ai-roomchat/supabase.sql†L653-L666】

### `public.rank_battles`
- Records matches with attacker/defender ownership, hero arrays, outcome, score delta, hidden flag, and creation time.【F:starbase/ai-roomchat/supabase.sql†L668-L679】
- Publicly readable and open to authenticated inserts for result logging.【F:starbase/ai-roomchat/supabase.sql†L681-L687】

### `public.rank_battle_logs`
- Stores per-turn transcripts including prompts, AI responses, metadata JSON, and timestamps linked to games and battles.【F:starbase/ai-roomchat/supabase.sql†L689-L698】
- Selectable by everyone with authenticated users permitted to insert.【F:starbase/ai-roomchat/supabase.sql†L834-L840】

## Rooms & Matchmaking
### `public.rank_rooms`
- Represents live rooms with game/owner references, join code, mode/status, slot/ready counters, host heartbeat, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L700-L713】
- RLS lets anyone read, owners create, and owners or seated occupants update rooms.【F:starbase/ai-roomchat/supabase.sql†L749-L774】

### `public.rank_room_slots`
- Tracks each room slot’s role, occupant ownership/hero, readiness state, join time, and timestamp audit with unique `(room_id, slot_index)` constraint.【F:starbase/ai-roomchat/supabase.sql†L715-L726】
- Accessible for reads, while inserts require room ownership and updates allow either occupants or the host to change their slot.【F:starbase/ai-roomchat/supabase.sql†L776-L810】

### `public.rank_match_queue`
- Queue entries capture game/mode/role, owning player, hero choice, score, party key, status, joined/updated timestamps, and optional match code.【F:starbase/ai-roomchat/supabase.sql†L728-L741】
- Indexed for queue scanning and owner lookups; RLS exposes waiting entries to everyone and allows owners to manage their own rows.【F:starbase/ai-roomchat/supabase.sql†L743-L833】

## Session Runtime
### `public.rank_sessions`
- Session rows record the active game, optional owner, status, current turn pointer, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L842-L850】
- Policies allow reads/writes for the owning user or shared null-owner sessions.【F:starbase/ai-roomchat/supabase.sql†L852-L861】

### `public.rank_turns`
- Holds ordered turn content with session linkage, index, role, visibility flag, text, and timestamp audit for replays.【F:starbase/ai-roomchat/supabase.sql†L863-L870】
- Global read plus authenticated insert permissions support collaborative recording.【F:starbase/ai-roomchat/supabase.sql†L873-L879】

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
