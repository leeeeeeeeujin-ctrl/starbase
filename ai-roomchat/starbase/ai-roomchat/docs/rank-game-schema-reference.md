# Rank Game Supabase Schema Reference

This document lists the tables, columns, and constraints required to run the rank-game blueprint end to end. Use it as a checklist when provisioning a fresh Supabase project or reviewing migrations.

## Heroes & Shared Assets
- **`public.heroes`** – Core hero registry with owner FK, ability texts, optional background/BGM metadata, and timestamp columns. 【F:supabase.sql†L7-L32】
  - Suggested audio preset columns to capture EQ/Reverb/Compressor settings for cross-player playback. 【F:docs/rank-audio-schema.md†L1-L22】
- **`public.rank_heroes`** – Read-only view mirroring `heroes` so clients can fetch hero metadata without elevated policies. 【F:supabase.sql†L33-L45】
- Storage policies on the `heroes` bucket allow authenticated owners to upload/update hero images and audio. 【F:supabase.sql†L46-L58】

## Prompt Builder
- **`public.prompt_sets`** – Prompt graph bundles with owner guard, public toggle, and timestamps. 【F:supabase.sql†L63-L86】
- **`public.prompt_slots`** – Individual nodes with slot number, type, pick strategy, template text, visibility arrays, canvas position, and JSON rule blocks. 【F:supabase.sql†L87-L119】
- **`public.prompt_library_entries`** – Shared library entries plus helper triggers to bump download counts and refresh `updated_at`. 【F:supabase.sql†L121-L239】

## Game Definition & Roles
- **`public.rank_games`** – Master game record linking owners to prompt sets, storing rules JSON, realtime mode (`off`, `standard`, or `pulse`), and engagement counters. 【F:supabase.sql†L243-L272】
- **`public.rank_game_roles`** – Per-role quota table with slot counts and score delta bounds. 【F:supabase.sql†L274-L299】
- **`public.rank_game_tags`** – Tag metadata with `(game_id, tag)` uniqueness. 【F:supabase.sql†L301-L307】
- **`public.rank_game_seasons`** – Optional season tracking with status and leaderboard snapshots. 【F:supabase.sql†L325-L335】
- **`public.rank_game_slots`** – Physical grid storing slot index, role, active flag, and current hero occupancy, constrained unique per game/slot. 【F:supabase.sql†L353-L364】

## Lobby & Room Management
- **`public.rank_rooms`** – Active room instances with status, mode, slot counters, and host heartbeat columns. 【F:supabase.sql†L448-L461】
- **`public.rank_room_slots`** – Room-specific slot occupancy and readiness flags with unique `(room_id, slot_index)` constraint. 【F:supabase.sql†L463-L474】

## Matchmaking
- **`public.rank_match_queue`** – Unified queue capturing mode, owner, hero, role, score, party key, status, and timestamps. Includes composite indexes for queue scans and owner lookups. 【F:supabase.sql†L476-L580】
- **`public.rank_participants`** – Persistent enrollment table with hero references, rating/score, battle counters, and status with `(game_id, owner_id)` uniqueness. 【F:supabase.sql†L382-L415】

## Battle Persistence
- **`public.rank_battles`** – Battle envelope storing attacker/defender hero arrays, result flag, and score delta. 【F:supabase.sql†L416-L427】
- **`public.rank_battle_logs`** – Turn-level transcript tied to both `battle_id` and `game_id` for history playback. 【F:supabase.sql†L437-L445】

## Session Runtime Logs
- **`public.rank_sessions`** – Active session envelope with per-owner rows, status, and current turn pointer. 【F:supabase.sql†L590-L609】
- **`public.rank_turns`** – Ordered turn entries referencing sessions, storing role labels, visibility flag, and content text. 【F:supabase.sql†L611-L628】

## Optional Supporting Tables
- **`public.messages`** – Shared lobby/chat feed used by the game UI. 【F:supabase.sql†L632-L638】
- **`public.rank_api_key_cooldowns`** – Client-reported key exhaustion events captured via `/api/rank/cooldown-report`. Suggested columns: `id uuid primary key`, `key_hash text unique`, `key_sample text`, `reason text`, `provider text`, `viewer_id uuid`, `game_id uuid`, `session_id uuid`, `recorded_at timestamptz`, `expires_at timestamptz`, `reported_at timestamptz`, `notified_at timestamptz`, `source text`, `note text`, `metadata jsonb`, plus indexes on `(notified_at, recorded_at)` to speed up manual digest checks. (Custom migration required; not present in current export.)
- **`public.rank_user_api_keyring`** – Per-user AI API key registry allowing up to five encrypted keys. Columns: `id uuid primary key`, `user_id uuid` FK to `auth.users`, `provider text` (`openai`, `gemini`, etc.), `model text`, optional `alias text`, `is_active boolean`, encrypted payload triplet (`key_ciphertext`, `key_iv`, `key_tag`), `key_version smallint`, `key_sample text`, and timestamps. Includes indexes on `(user_id, created_at)` and `updated_at` plus `touch_rank_user_api_keyring_updated_at` trigger to maintain `updated_at`. RLS policy `rank_user_api_keyring_service_all` grants service role full access. 【F:supabase.sql†L696-L778】

## Policies & Indexes
All tables defined above enable Row Level Security with policies tailored to owner or participant access. Ensure migrations include the bundled policy blocks from `supabase.sql`. Key indexes: `rank_match_queue_lookup` and `rank_match_queue_owner_lookup` for queue scans, plus uniqueness on slots, room slots, and participant ownership. 【F:supabase.sql†L491-L580】

## Provisioning Checklist
1. Run `supabase.sql` and any supplemental migrations (audio preset columns, API key cooldowns) on the target project.
2. Apply `supabase_chat.sql`/`supabase_social.sql` if social/chat features are needed alongside the rank blueprint.
3. Seed initial games, roles, and slot grids via `rank_games`, `rank_game_roles`, and `rank_game_slots` before enabling matchmaking flows.
4. Confirm service-role key has insert/update access for queue and battle tables; clients operate under the provided RLS policies.
