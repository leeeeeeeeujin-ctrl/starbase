# Main Game Cycle & Feedback Loop Audit

## Scope
This note reviews the "main game" (`components/rank/StartClient` and its engine/services) for module import cycles and runtime feedback loops that could behave like circular references. The focus is the StartClient UI, its engine hook, and the shared match/session stores that they mutate.

## Findings

### 1. No static import cycles detected
I ran `madge` against the StartClient entry point as well as the engine hook directory. Both commands completed without reporting circular dependencies, so the module graph itself is acyclic.

```
npx madge components/rank/StartClient/index.js --circular
npx madge components/rank/StartClient/useStartClientEngine.js --circular
```

Madge processed 68 and 48 files respectively with the result `✔ No circular dependency found!`【362113†L1-L3】【6800e8†L1-L3】

### 2. StartClient ↔ matchDataStore runtime feedback loop
`StartClient/index.js` subscribes to `matchDataStore` updates via `subscribeGameMatchData` and rehydrates its local `matchState` every time the store broadcasts a change.【F:starbase/ai-roomchat/components/rank/StartClient/index.js†L82-L113】 The `useStartClientEngine` hook pushes timeline / turn-state updates into the same store through `setGameMatchSessionMeta` whenever it receives realtime events.【F:starbase/ai-roomchat/components/rank/StartClient/useStartClientEngine.js†L939-L1002】 This design couples the UI and engine through session storage and can amplify any noisy writes. It is not a static cycle, but it is a closed feedback loop that will emit redundant renders whenever external events spam the realtime channel.

**Recommendation.** Gate high-frequency writes (e.g., debounce timeline backfills) or add equality checks before invoking `setGameMatchSessionMeta` so the store only broadcasts when meaningful fields change.

### 3. Session meta resubmission loop risk
When the realtime engine applies a turn-state event it writes the payload into `matchDataStore`. The sanitizer there rewrites `sessionMeta.updatedAt` and `turnState.updatedAt` to `Date.now()` on every mutation.【F:starbase/ai-roomchat/modules/rank/matchDataStore.js†L428-L532】 The StartClient effect that posts to `/api/rank/session-meta` compares JSON signatures that include this timestamp, so each store mutation looks unique and triggers a new API call.【F:starbase/ai-roomchat/components/rank/StartClient/index.js†L225-L302】 Because the realtime backfill also writes through the same code path, a server-originated turn-state broadcast can cause the client to immediately echo the change back to the API, creating a self-perpetuating loop of writes and broadcasts.

**Recommendation.** Preserve the server-provided `updatedAt` in the store (instead of `Date.now()`) or skip the sync effect when `sessionMeta.source` indicates the change already came from Supabase (`'realtime/turn-state'`). Either change breaks the feedback loop.

### 4. Realtime turn events can retrigger StartClient postings
The realtime handler guards duplicate events using `lastRealtimeTurnEventRef`, but it still calls `setGameMatchSessionMeta` even for events whose `emittedAt` is unchanged (for example, when Supabase replays cached events after reconnect).【F:starbase/ai-roomchat/components/rank/StartClient/useStartClientEngine.js†L904-L947】 Because the store sanitizer rewrites timestamps, this results in a new `updatedAt` and therefore another `/api/rank/session-meta` request. If the API writes back with the same turn snapshot, the client will ingest it and emit yet another store update.

**Recommendation.** After detecting a duplicate `eventId`, bail out before mutating the store, or compare the sanitized turn state with the previous value before calling `setGameMatchSessionMeta`.

## Summary
The module graph for the main game is acyclic, but several runtime feedback loops exist between `StartClient`, `useStartClientEngine`, and `matchDataStore`. These loops are currently bounded only by timestamp churn, so they risk causing redundant API calls and excessive Supabase traffic. Tightening the guard conditions around store writes (especially for turn-state updates) would prevent circular behaviour without restructuring the module layout.
