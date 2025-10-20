# Matchmaking Auto-Flow Notes

## Overview
- `AutoMatchProgress` drives the automatic queueing experience for solo, duo, and casual modes. It watches viewer, hero, and role readiness before attempting to enqueue and logs blocker messages for debugging.
- Once blockers are cleared, `AutoMatchProgress` calls the `join` action from `useMatchQueue`, tracks confirmation windows, and routes matched players into the active battle page while handling timeouts and penalty redirects.

## Key Components
1. **AutoMatchProgress (`components/rank/AutoMatchProgress.js`)**
   - Maintains local confirmation state, queue timeouts, and redirect logic.
   - Surfaces blockers such as missing hero selection, role readiness, or viewer authentication before allowing queue attempts.
   - Cleans up timers on unmount to avoid duplicate redirects or lingering queue entries.
2. **useMatchQueue (`components/rank/hooks/useMatchQueue.js`)**
   - Loads the viewer session, locked role, hero ID, and queue metadata required before auto-joining.
   - Exposes `actions.join` which issues `/api/rank/match` requests with the viewer token and handles queue retries.
3. **Mode Clients (`pages/rank/[id]/solo.js`, etc.)**
   - Each matchmaking page renders `AutoMatchProgress` directly so queueing begins as soon as the page loads with a valid game ID.

## Current Behaviour
- When a player navigates from the main room to a matchmaking page, `AutoMatchProgress` immediately evaluates blockers.
- If the player already selected a hero and role, the overlay hides manual buttons and transitions into the spinner-only loading view while `useMatchQueue` attempts to join.
- Missing prerequisites (no hero, viewer not loaded, role unset) keep the overlay in the blocker state and can surface manual UI in legacy clients.

## Troubleshooting Checklist
- Confirm the viewer session token is available; without it `useMatchQueue` will not enqueue and the overlay reverts to manual UI.
- Verify the hero selection persisted in `rank_participants`; otherwise the hero blocker keeps the queue idle.
- Ensure duo parties navigate through `/rank/[id]/duo/queue` so `DuoMatchClient` can supply the party key required by the queue service.
- Inspect browser console logs emitted by `AutoMatchProgress` for blocker and status-change diagnostics when auto-join does not trigger.

## Follow-Up Ideas
- Add a visible status badge for blocker states so testers can immediately see which prerequisite is missing without opening dev tools.
- Consider a server-side watchdog to clean up `rank_match_queue` rows that remain in queued status after clients disconnect mid-flow.
