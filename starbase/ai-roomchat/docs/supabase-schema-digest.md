# Supabase Schema Digest

Updated reference for every Supabase entity that powers chat, social, content authoring, monitoring, and game flow across the project. Each section lists the backing table plus notable constraints, policies, and helper routines so engineers can confirm available columns without re-opening the SQL exports.

## Social & Friend Graph
- `public.friend_requests`: Tracks invitations between `requester_id` and `addressee_id`, keeps `status` in the pending/accepted workflow, and refreshes `updated_at` via trigger; access is limited to the involved users through row-level security (RLS).【F:starbase/ai-roomchat/supabase_social.sql†L4-L37】【F:starbase/ai-roomchat/supabase_social.sql†L71-L85】
- `public.friendships`: Stores canonical friend pairs with a `user_id_a < user_id_b` constraint, uniqueness enforcement, and participant-scoped RLS for reads and deletes.【F:starbase/ai-roomchat/supabase_social.sql†L39-L69】

## Heroes & Shared Assets
- `public.heroes`: Core hero registry with four ability texts, optional media URLs, and timestamps; owners control CRUD through RLS, while the `rank_heroes` view exposes read-only access to clients. Storage policies grant authenticated uploads to the associated bucket.【F:starbase/ai-roomchat/supabase.sql†L7-L58】

## Prompt Authoring & Library
- `public.prompt_sets`: Owner-scoped prompt set metadata with `is_public` visibility and standard RLS ownership guards.【F:starbase/ai-roomchat/supabase.sql†L63-L86】
- `public.prompt_slots`: Slot-level templates tied to a prompt set, capturing placement, visibility lists, and variable rules; selection policies mirror the parent set’s ownership/public visibility.【F:starbase/ai-roomchat/supabase.sql†L87-L134】
- `public.prompt_bridges`: Connect slots across sets with trigger words, condition JSON, priority/probability settings, and fallback actions, all locked to the originating set owner.【F:starbase/ai-roomchat/supabase.sql†L135-L178】
- `public.prompt_library_entries`: Shareable library metadata referencing a source set, tracking downloads, and updating `updated_at` through a trigger and helper function for marketplace-style browsing.【F:starbase/ai-roomchat/supabase.sql†L180-L263】

## Operational Monitoring & Audio Telemetry
- `public.rank_user_error_reports`: Central store for client error captures, indexing `created_at` and `severity` to drive admin dashboards while keeping RLS in place for secured querying.【F:starbase/ai-roomchat/supabase.sql†L206-L225】
- `public.rank_audio_preferences`: Per-owner preset selections with EQ/reverb/compressor JSON settings, protected by owner-specific RLS and `updated_at` touch trigger; unique `(owner_id, profile_key)` keeps one row per profile.【F:starbase/ai-roomchat/supabase.sql†L268-L324】
- `public.rank_audio_events`: Logs profile activity (preset toggles, hero assignments, etc.) and exposes weekly trend/breakdown SQL functions alongside owner-only RLS for analytics feeds.【F:starbase/ai-roomchat/supabase.sql†L326-L455】
- `public.rank_audio_monitor_rules`: Stores CMS-style monitoring rules (favorites/subscriptions) with sortable ordering and update triggers, enabling admin automation to share a single source of truth.【F:starbase/ai-roomchat/supabase.sql†L455-L483】

## Game Catalog & Seasonal Metadata
- `public.rank_games`: Game definitions covering owner, descriptive metadata, prompt linkage, rule payloads, and engagement counters with owner-restricted write access.【F:starbase/ai-roomchat/supabase.sql†L495-L525】
- `public.rank_game_roles`: Role roster per game including slot budgets and scoring bounds, guarded by owner policies.【F:starbase/ai-roomchat/supabase.sql†L526-L552】
- `public.rank_game_tags`: `(game_id, tag)` unique associations so creators can maintain discoverability vocabularies.【F:starbase/ai-roomchat/supabase.sql†L553-L575】
- `public.rank_game_seasons`: Season lifecycle state tracking start/end windows and leaderboard JSON snapshots, with owner-scoped RLS on mutations.【F:starbase/ai-roomchat/supabase.sql†L577-L604】
- `public.rank_game_slots`: Physical slot grid marking role assignments, default heroes, and timestamps under a `(game_id, slot_index)` uniqueness rule and owner-managed RLS.【F:starbase/ai-roomchat/supabase.sql†L605-L632】

## Participation & Battle History
- `public.rank_participants`: Player enrollment records capturing hero selections, rating/score metrics, battle counts, and status fields, enforced unique per `(game_id, owner_id)` with owner-level CRUD policies.【F:starbase/ai-roomchat/supabase.sql†L634-L666】
- `public.rank_battles`: Match outcomes storing attacker/defender hero arrays, result, and score delta with open read access and authenticated inserts for battle logging.【F:starbase/ai-roomchat/supabase.sql†L668-L688】
- `public.rank_battle_logs`: Turn-by-turn transcripts tied to both games and battles, keeping prompt/response bodies and metadata for replay surfaces.【F:starbase/ai-roomchat/supabase.sql†L689-L840】

## Rooms & Matchmaking
- `public.rank_rooms`: Live room shells with slot counts, readiness tallies, and host activity timestamps; policies allow owners or seated participants to update their room state.【F:starbase/ai-roomchat/supabase.sql†L700-L774】
- `public.rank_room_slots`: Slot occupancy rows that track entrant owners, heroes, readiness, and join timestamps under per-room uniqueness and mixed owner/occupant update permissions.【F:starbase/ai-roomchat/supabase.sql†L715-L810】
- `public.rank_match_queue`: Matchmaking queue entries referencing games, roles, and scores, optimized by queue and owner lookup indexes and limited to waiting entries or self access via RLS.【F:starbase/ai-roomchat/supabase.sql†L728-L833】

## Session Runtime
- `public.rank_sessions`: Server-side record of active matches including owner, status, and current turn pointer, with policies that permit null-owner sessions for shared lobbies.【F:starbase/ai-roomchat/supabase.sql†L842-L862】
- `public.rank_turns`: Ordered session content capturing role, visibility, and text for playback, accessible for reads and authenticated writes when recording turns.【F:starbase/ai-roomchat/supabase.sql†L863-L880】

## Shared Chat & Messaging
- `public.messages`: Global chat feed storing sender identity, hero targeting, scope, and optional metadata; Supabase exports ensure strict foreign keys, scope defaults, indexes, and authenticated insert policies so channel views stay responsive.【F:starbase/ai-roomchat/supabase.sql†L884-L899】【F:starbase/ai-roomchat/supabase_chat.sql†L2-L182】

These notes now match the latest DDL in `supabase.sql`, `supabase_chat.sql`, and `supabase_social.sql`, giving a single place to confirm schema coverage before wiring APIs, analytics, or admin tools.
