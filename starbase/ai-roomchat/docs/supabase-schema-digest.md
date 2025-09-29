# Supabase Schema Digest

Reference notes for the Supabase entities that power rank game registration, lobby browsing, and in-room play. Tables are grouped by feature area with pointers to the SQL sources bundled in the repo.

## Social / Friends
- `friend_requests`: Maintains friend invitations with requester/addressee IDs, status workflow, and an `updated_at` trigger for state changes.【F:starbase/ai-roomchat/supabase_social.sql†L4-L37】【F:starbase/ai-roomchat/supabase_social.sql†L71-L85】
- `friendships`: Stores canonical friend pairs (`user_id_a` < `user_id_b`) and restricts row access to either participant.【F:starbase/ai-roomchat/supabase_social.sql†L39-L69】

## Heroes & Shared Assets
- `heroes`: Primary hero registry containing four ability texts, optional background/BGM metadata, and timestamps; exposed via the `rank_heroes` view for public reads.【F:starbase/ai-roomchat/supabase.sql†L7-L45】
- Storage policies (same file) grant upload/update access to the `heroes` bucket for authenticated owners.【F:starbase/ai-roomchat/supabase.sql†L46-L58】

## Prompt Maker System
- `prompt_sets`: Owner-scoped prompt graph bundles with public toggle and timestamp columns.【F:starbase/ai-roomchat/supabase.sql†L63-L86】
- `prompt_slots`: Slot-level templates with pick strategy, visibility arrays, coordinates, and JSON variable rule columns, all linked back to a prompt set.【F:starbase/ai-roomchat/supabase.sql†L87-L119】
- `prompt_library_entries`: Shared library metadata plus helper functions/triggers to increment downloads and refresh `updated_at`.【F:starbase/ai-roomchat/supabase.sql†L121-L239】

## Rank Game Core Tables
- `rank_games`: Stores owner, metadata, prompt linkage, rules JSON, realtime flag, and engagement counters (`likes_count`, `play_count`).【F:starbase/ai-roomchat/supabase.sql†L243-L272】
- `rank_game_roles`: Canonical role roster per game, including slot quotas and score delta bounds with owner-scoped policies.【F:starbase/ai-roomchat/supabase.sql†L274-L299】
- `rank_game_tags`: User-managed tag list constrained unique per game, with owner-guarded mutations.【F:starbase/ai-roomchat/supabase.sql†L301-L322】
- `rank_game_seasons`: Season lifecycle record holding status, start/end timestamps, and stored leaderboard snapshots.【F:starbase/ai-roomchat/supabase.sql†L324-L355】
- `rank_game_slots`: Physical slot grid marking `slot_index`, `role`, `active`, and optional hero occupancy fields to be updated on join/leave.【F:starbase/ai-roomchat/supabase.sql†L353-L380】
- `rank_match_queue`: Per-mode matchmaking queue capturing hero, role, score, and status with indexes on `(game_id, mode, role, status)` for solo/duo/casual lookups.【F:starbase/ai-roomchat/supabase.sql†L476-L580】
- `rank_participants`: Tracks enrolled players with hero references, rating/score, battle counts, and status flags under `(game_id, owner_id)` uniqueness.【F:starbase/ai-roomchat/supabase.sql†L382-L415】
- `rank_battles`: Persisted battle outcomes including attacker/defender hero lists, `result`, and `score_delta`.【F:starbase/ai-roomchat/supabase.sql†L416-L435】
- `rank_battle_logs`: Turn-level transcripts tied to both `battle_id` and `game_id` for history displays.【F:starbase/ai-roomchat/supabase.sql†L437-L588】
- `rank_sessions` & `rank_turns`: Runtime match session envelope plus ordered turn log referencing sessions and storing role/content for AI playback.【F:starbase/ai-roomchat/supabase.sql†L590-L628】

## Shared Chat
- `messages`: Public chat feed capturing `user_id`, `username`, avatar URL, text payload, and `created_at`, with row level security ensuring only the posting user can insert.【F:starbase/ai-roomchat/supabase.sql†L632-L638】

These references should streamline verifying column availability when wiring registration payloads, lobby queries, and in-room battle flows without needing to reopen the entire SQL exports each time.
