# Refactor plan — `useStartClientEngine.js`

Goal
- Reduce file complexity by extracting small, well-tested helpers and sub-hooks.
- Keep changes conservative and test-driven; every micro-change must run ESLint + Jest.

Constraints
- No user-visible behaviour changes.
- Keep API shapes for public hooks stable; prefer internal helper extraction first.
- Work on Windows — avoid shell-specific Husky changes without a Windows-safe alternative.

High-level approach (order of work)
1. Plan & map: identify logical groups inside `useStartClientEngine.js` (timers, realtime finalizers, run-turn, outcome processing, ledger logging, UI setters). Produce a small extraction map (this file).
2. Extract pure helpers (no closures): functions like `buildBattleLogDraft`, `normalizeTurnEntries`, `previewSummary`.
3. Extract small sub-hooks that depend on external state but have narrow deps: `useTurnTimer`, `useRealtimeHelpers`, `useRunTurnApi`, `useAdvanceTurn`, `useOutcomeProcessor` (some already extracted).
4. Replace inline functions with calls to new helpers/hooks and run tests.
5. Shrink dependency objects: once tested, progressively replace large deps with explicit imports or smaller objects.
6. Cleanup: add JSDoc for each factory/hook describing required deps and run ESLint autofixes.

First-pass extract candidates (low risk)
- `useTurnTimer` — isolates the interval/tick logic.
- `useRealtimeHelpers` — finalizeRealtimeTurn, record participation helpers.
- `useRunTurnApi` — network call + payload normalization (already extracted).
- Pure helpers: `stripOutcomeFooter`, `buildOutcomeSnapshot` (already present in utils) — prefer imports.

Medium-risk extracts (after first-pass tests)
- `advanceTurn` — narrow to just calling run-turn + merging results.
- `useOutcomeProcessor` — already extracted; next shrink its deps object.

Tests
- For each extracted file, add a unit test covering happy path + one edge case.
- Run the full Jest suite after each group of extractions.

Safety & rollback
- Commit each green step to the feature branch.
- If a change causes regressions, revert the commit and open a small follow-up PR with the fix.

Immediate next actions (this session)
1. Shrink deps for `useAdvanceTurn` by reading its file and the callers to see which deps are actually used. (Low-risk: only changes the factory signature; keep old signature as a shim if necessary.)
2. After shrinking, run ESLint and Jest. If green, commit.

Notes
- I've already extracted `useRunTurnApi` and `useOutcomeProcessor` in prior steps; this plan focuses on finishing the larger `useStartClientEngine.js` safely.
- I'll proceed to shrink `useAdvanceTurn` deps next unless you prefer a different target.
