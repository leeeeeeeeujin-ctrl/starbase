# Slot Sweeper Schedule

## Summary
- Runs `/api/rank/slot-sweeper` every five minutes via Vercel Cron so stale slots clear well before the 15 minute timeout window.
- Cron request supports optional bearer or query secrets by setting `RANK_SLOT_SWEEPER_SECRET` and appending `?secret=...` in environment-specific cron configs.
- Provides fallback guidance for triggering the sweeper manually when diagnosing slot issues.

## Deployment checklist
1. Deploy the updated `vercel.json` so Vercel provisions the cron job.
2. (Optional) Set `RANK_SLOT_SWEEPER_SECRET` in project environment variables. If set, update the cron path to `/api/rank/slot-sweeper?secret=YOUR_SECRET`.
3. Confirm the cron ran by reviewing the Vercel function logs for `slot-sweeper` (should complete within a few hundred ms with no stale slots most runs).

## Manual execution
- Run `curl https://<your-domain>/api/rank/slot-sweeper` to sweep everything.
- Use `?game_id=...` to limit a sweep to a single game.
- Use `?older_than_minutes=5` to lower the cutoff when testing aggressive cleanups.

## Operational notes
- The helper uses a 15 minute default timeout, so a five minute cron cadence guarantees no slot lingers more than ~20 minutes without manual intervention.
- If a burst of players causes repeated stale entries, consider temporarily tightening the cadence to `*/2 * * * *`.
- For local testing, run `npm run dev` and invoke the endpoint manually instead of relying on the cron.
