# Chat Overlay Implementation Prompt

The goal of this prompt is to brief a follow-up AI so it can reproduce the Starbase chat overlay, realtime flows, and media handling end-to-end without reviewing the full repository history. Treat this document as a contract: every feature below must be delivered and wired into Supabase so the dashboard chat works across web and native shells.

## 1. Platform & Environment
- **Framework**: Next.js / React running in `ai-roomchat` with ESLint + Jest configs already bootstrapped.
- **Design system**: Local components (e.g., `SurfaceOverlay`, `ChatOverlay`, `OverlayTabs`) and Tailwind-style utility classes defined in `styles/`.
- **State & realtime**: Supabase `postgres_changes` listeners for message feeds, Supabase Broadcast for lightweight fan-out, and local React state machines to manage UI transitions.
- **Storage**: Supabase Storage bucket `chat-attachments` (private) for compressed uploads.
- **Native bridge**: Optional RN/Capacitor bridge exposed through `lib/native/mediaLibrary.js` to list local media via PhotoKit (iOS) or MediaStore (Android). If the bridge is missing, fall back to the browser file picker.

## 2. Supabase Schema & Policies
1. **Core tables**
   - `messages` with columns for `chat_room_id`, `room_id`, `scope`, `thread_scope`, `attachments` JSON, `visible_owner_ids`, etc. Ensure indices exist on `(chat_room_id, created_at DESC)` and `(room_id, created_at DESC)`.
   - `chat_room_members` includes denormalized `room_owner_id`, `room_visibility`, `is_moderator`, and triggers (`populate_chat_room_member_room_metadata`, `refresh_chat_room_members_room_metadata`, `sync_chat_room_moderators`).
   - `chat_room_moderators` cache table maintained by trigger for moderator lookups without RLS recursion.
2. **Policies**
   - `messages_select_public`: allow viewers if they are the author, visible in `visible_owner_ids`, part of the linked room (via `chat_room_members` or `rank_room_slots`), match roster, or global scope.
   - `chat_room_members` policies: select/update/delete rely on cached `room_owner_id`, `room_visibility`, and `chat_room_moderators` to avoid cycles.
3. **RPCs**
   - `fetch_recent_messages(chat_room_id, limit)` returning `{ messages, cursor, roomMetadata }`.
   - `fetch_chat_dashboard()` returning room categories, unread counts, and membership metadata.
   - `fetch_chat_rooms()` to drive open chat search results.
   - `insert_message(...)` is proxied by `send_rank_chat_message` to permit attachment-only sends.
   - `fetch_rank_chat_threads(...)` gating global scope unless explicitly requested.
4. **Storage bucket**
   ```sql
   insert into storage.buckets (id, name, public)
   values ('chat-attachments', 'chat-attachments', false)
   on conflict (id) do nothing;

   drop policy if exists chat_attachments_select on storage.objects;
   drop policy if exists chat_attachments_insert on storage.objects;
   drop policy if exists chat_attachments_delete on storage.objects;

   create policy chat_attachments_select
     on storage.objects for select to authenticated
     using (bucket_id = 'chat-attachments');

   create policy chat_attachments_insert
     on storage.objects for insert to authenticated
     with check (bucket_id = 'chat-attachments');

   create policy chat_attachments_delete
     on storage.objects for delete to authenticated
     using (bucket_id = 'chat-attachments');
   ```

## 3. Realtime Bootstrap
- Use the SQL bootstrap in `supabase/chat_realtime_backend.sql` to register policies, triggers, and publications. Confirm `chat_room_moderators` is part of the `supabase_realtime` publication.
- Frontend subscribes to `postgres_changes` on `messages` filtered by `chat_room_id`, `room_id`, and `match_instance_id`, plus Broadcast channels for presence pings.
- Realtime updates hydrate the Redux-like store in `ChatOverlay` through `subscribeToMessages` (see `lib/chat/messages.js`).

## 4. Chat Overlay UX Spec
1. **Overlay shell**
   - Built on `SurfaceOverlay` with `hideHeader` enabled. Custom frame adds generous top/bottom padding, zero side gutters, and uses a vertical layout.
   - The overlay toggles via a floating launcher that is hidden on title and roster routes.
2. **Top command bar**
   - Icon buttons for: profile/info tab, open chat discovery, create room, global settings. Buttons expose tooltips and open respective panels.
3. **Bottom navigation**
   - Tabs pinned to the bottom: `정보`, `일반 채팅`, `오픈 채팅`.
   - Switching tabs updates the right-hand pane without remounting shared state.
4. **Room grid**
   - Cards show room avatar, name, last message preview, timestamp, and unread badge. The badge clears when the room is opened.
   - Cards animate on hover/tap and support skeleton placeholders during loading.
   - Real-time unread counts subscribe to `fetch_chat_dashboard` deltas or `postgres_changes` on membership rows.
5. **Info tab**
   - Displays current character identity (matching the roster selection) with tappable portrait that reveals stats, status message, and CTA to change character.
   - Includes friends list with online indicator, friend request/accept buttons, and block controls (hook into backend RPC stubs if not live yet).

## 5. Conversation View
- When a room is selected, the tab bar collapses and the conversation occupies the overlay.
- Layout components:
  - **Header**: room avatar + name, presence indicator, quick actions (leave, invite, mute).
  - **Transcript**: scrollable container with drag handle to adjust height. Infinite scroll fetches older messages via `fetchRecentMessages`.
  - **Composer**: fixed footer with message textarea, send button, attachment toggle, AI request banner, and selected attachment previews.
- **Message grouping**
  - Consecutive messages from the same speaker collapse into one stack; avatar/name only show on the first bubble of the stack.
  - Self-messages hide avatar but show the user’s display name on the leading bubble.
  - Timestamps appear on the left of self bubbles and right for others. Subsequent bubbles within the same minute omit the time.
  - Midnight boundaries insert a date divider.
- **Long messages**
  - Messages >240 chars show truncated text with a “전체보기” button opening a modal to read the full content.

## 6. Attachments & AI Assistance
1. **Attachment prep**
   - Supported types: images, videos, generic files.
   - Each selected file is compressed client-side (webp for images, gzip for others), preview thumbnails generated (<=360px), and metadata stored with layout hints (grid vs. single column).
   - Videos enforce `< 4 minutes` and `<= 50 MB` limits; show duration overlay.
   - Multiple images in the same message render as a tight square grid inside the bubble.
2. **Upload flow**
   - Upload to `chat-attachments` before calling `insertMessage`. Store `bucket`, `path`, `contentType`, `size`, `encoding`, `width/height` (for media), and `layout` in the `attachments` array.
   - On receipt, decompress blobs if needed before preview.
3. **Media picker**
   - Primary path: call `hasNativeMediaBridge()`; if true request permission via `requestNativeMediaPermission()`, then page through `fetchNativeMediaTimeline({ cursor, limit })`.
   - Secondary path: `input[type=file]` fallback per action (photo/video/file) when no bridge.
4. **AI prompt banner**
   - Tapping “AI 응답 요청” pins a blue prompt chip above the composer. The next send packages `aiRequest` metadata with the prompt text.
   - Pending assistant replies render as loading red bubbles; once fulfilled, update the message stack with the AI response.

## 7. Profile & Social Interactions
- Clicking an avatar in the transcript opens a profile sheet that shows the character portrait, bio, action buttons: `친구 신청`, `1:1 채팅`, `차단`.
- Actions dispatch to Supabase RPC endpoints (stub `sendFriendRequest`, `blockUser`, etc.). Responses should optimistically update the friends list and membership UI.

## 8. Open Chat Discovery
- Search panel filters rooms by keyword, tag, or population using `fetch_chat_rooms` RPC.
- Include a CTA to `createChatRoom` with form validation (name, description, visibility, invite code).
- Show recommended rooms based on membership overlap and trending metrics from the dashboard payload.

## 9. Testing & QA Checklist
- Unit test message formatting (grouping, timestamp trimming, date dividers).
- Cypress/Playwright coverage for sending text, photo, video, file, and AI messages.
- Manual QA for media uploads on:
  - Web (fallback file picker)
  - iOS PhotoKit bridge (permission denied → CTA)
  - Android MediaStore bridge (Read permission flows for API 29 & 33)
- Verify Supabase policies by querying as:
  - Room member
  - Moderator
  - Non-member (should be blocked)

## 10. Deployment Notes
- Supabase SQL changes belong in `supabase/chat_realtime_backend.sql` and mirrored in `supabase.sql`.
- Use `scripts/sync-supabase.js` (if available) to apply schema diffs.
- Environment variables required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_REALTIME_URL`.
- Register the `chat-attachments` bucket in Supabase Storage settings.
- Document any manual Supabase console actions in `docs/chat-realtime-backend.md`.

## 11. Delivery Expectations for the Follow-up AI
- Ship production-ready React components with accessibility (keyboard navigation, ARIA for tabs and modals).
- Maintain responsive layouts for desktop, tablet, and narrow overlays.
- Keep bundle size reasonable: lazy-load heavy pickers and media previews.
- Provide migration SQL + Supabase instructions for every schema/policy change.
- Produce a final summary with backend tasks (`백엔드에 해야 하는 일`), additional needs, and progress notes, matching house style.

Hand this prompt to any future collaborator—they should be able to rebuild the chat overlay and supporting backend features exactly as the current product expects.
