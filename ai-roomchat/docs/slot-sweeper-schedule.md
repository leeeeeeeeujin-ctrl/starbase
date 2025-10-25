# Slot Sweeper Schedule

## Summary

- Operate `/api/rank/slot-sweeper` on-demand (or through an external scheduler you control) so stale slots clear well before the 15 minute timeout window.
- When an external trigger is required, supply `RANK_SLOT_SWEEPER_SECRET` and append `?secret=...` so ad-hoc invocations remain authenticated.
- Provides step-by-step guidance for triggering the sweeper manually when diagnosing slot issues.

## Deployment checklist

1. Configure the `RANK_SLOT_SWEEPER_SECRET` environment variable if you plan to call the endpoint from any shared operations tooling.
2. Confirm the sweeper completes successfully by checking the Vercel function logs for `/api/rank/slot-sweeper` after each manual run.

## Manual execution

- Run `curl https://<your-domain>/api/rank/slot-sweeper` to sweep everything.
- Use `?game_id=...` to limit a sweep to a single game.
- Use `?older_than_minutes=5` to lower the cutoff when testing aggressive cleanups.

## Operational notes

- The helper uses a 15 minute default timeout, so triggering it every ~5 minutes during events keeps stale entries from lingering more than ~20 minutes.
- If a burst of players causes repeated stale entries, consider running the sweeper more frequently (for example every 2 minutes) until the queue stabilises.
- For local testing, run `npm run dev` and invoke the endpoint manually—no additional scheduler configuration is necessary.
