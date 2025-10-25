Additional edits performed after initial triage (2025-10-24):

- Continued manual triage on `components/rank/GameRoomView.js`:
  - Removed unused hero-audio UI handlers and labels.
  - Simplified several try/catch blocks to avoid unused `error` bindings.
  - Stabilized hero audio arrays with `useMemo` to reduce hook dependency noise.
  - Removed a few unused local variables and an unused leave handler.
- Added `.eslintignore` to exclude `.next/`, `public/`, `reports/`, and `logs/` in the nested app to reduce lint noise from generated files.

Validation:

- Ran `npm test` (nested app) — all tests passed (55 suites, 321 tests).
- Ran `npx eslint components/rank/GameRoomView.js` — warnings were reduced; a few remain for manual review.

Next actions planned:

- Finish remaining `react-hooks/exhaustive-deps` manual fixes in `GameRoomView.js`.
- Run the next automated `eslint --fix` batch (N=10) and push incremental commits.
- Monitor PR CI runs and address any failures.
