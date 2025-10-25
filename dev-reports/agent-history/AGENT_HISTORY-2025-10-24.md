2025-10-24 — Automated lint triage (assistant)

- Ran `eslint --fix` on a focused set of top source files identified in the ESLint summary.
- Files targeted: `components/rank/GameRoomView.js`, `components/social/ChatOverlay.js`, `components/rank/StartClient/useStartClientEngine.js`, `components/character/CharacterDashboard/index.js`, `components/admin/CooldownDashboard.js`, `components/rank/MatchQueueClient.js`.
- Fixed a parsing error in `useStartClientEngine.js` caused by a duplicated `toTrimmedString` definition (the helper is now imported from `./utils`).
- Re-ran `npx eslint --fix` and then `npm test` in the nested app; all tests passed (55 suites, 321 tests).
- Committed the changes and pushed branch `fix/lint-codemods-autosuppress-20251024` to origin (commit: 3595395).

Next steps:
- Update PR #98 description with the ESLint summary and per-file recommended actions.
- Continue automated fixes for the next batch of top source files, then begin manual triage for `react-hooks/exhaustive-deps` warnings.
