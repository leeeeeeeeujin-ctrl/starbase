# AI Roomchat Repository Survey

## Project Overview
- **Framework**: Next.js 14 Pages Router with JavaScript, focused on Supabase-backed auth and features.
- **Core Features**: Google OAuth login, hero creation/storage, roster listing, and optional public chat functionality.

## Setup Checklist
1. Populate `.env.local` with the Supabase URL and anon key that the ops team shares out-of-band (see `docs/admin-portal.md` for the full environment variable list).
2. Install dependencies with `npm install` and run the development server via `npm run dev`.
3. Configure Supabase:
   - Enable Google OAuth with proper redirect URLs.
   - Execute `supabase.sql` (heroes tables, storage policies) and `supabase_chat.sql` (messages table) in the SQL editor when chat is needed.
   - Create the `heroes` storage bucket, then enable Realtime on the `messages` table for chat.

## Route Map
- `/`: Landing page with login entry point.
- `/auth-callback`: Handles Supabase OAuth redirects.
- `/create`: Hero builder that uploads assets to the `heroes` bucket.
- `/roster`: Displays the authenticated user's hero roster.
- `/chat`: Optional shared chat experience backed by Supabase Realtime.

## Architectural Highlights
- **Supabase table resolution**: `withTable` in `lib/supabaseTables.js` dynamically matches logical table names to environment-specific physical tables and memoizes the result.
- **Ranked battle client**: `components/rank/StartClient` orchestrates UI layout, while `useStartClientEngine` loads game bundles, assembles prompts, tracks turns, and supervises OpenAI usage.
- **Shared chat dock**: `useSharedChatDock` centralizes user/profile parsing, message subscription, and moderation state; `SharedChatDock` renders a unified panel.
- **Maker editor**: `MakerEditor` and `useMakerEditor` coordinate React Flow-based node/edge editing with tabbed panels and persistence helpers.
- **Supabase schema**: `supabase.sql` provisions heroes/prompt/rank tables, RLS policies, storage rules, and the `rank_heroes` view for environment resets.

## Next Questions
- Clarify current Supabase project IDs and storage bucket configuration per environment.
- Identify which components are considered MVP versus optional (e.g., chat dock) for prioritization.
- Confirm OpenAI API quota expectations to size rate limiting within `useStartClientEngine`.

