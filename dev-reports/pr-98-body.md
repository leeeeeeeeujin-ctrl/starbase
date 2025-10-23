Draft PR: Refactor + formatting + lint triage

What I changed

- Extracted helpers and small refactors in `components/rank/StartClient` (helpers moved to `utils.js`).
- Integrated Prettier across the repo and applied a safe formatting pass.
- Installed Husky (repo root) with a `pre-commit` hook that runs `lint-staged`.
- Added CI workflow `.github/workflows/pr-checks.yml` to run format-check, lint, and tests for the nested app.
- Ran targeted ESLint auto-fixes on high-priority source files and committed the fixes.

Tests & validation

- Ran `npm test` in `ai-roomchat/starbase/ai-roomchat` — all tests passed (55 suites, 321 tests).
- Performed targeted `npx eslint --fix` on several top source files (see below).

ESLint summary (generated at 2025-10-23T20:42:54.502Z)

Top rules:
- `no-unused-vars` — 696 occurrences
- `react-hooks/exhaustive-deps` — 91 occurrences
- `@typescript-eslint/no-unused-vars` — 4 occurrences

Top files (actionable; excluding build artifacts like `.next`)
1. `components/rank/GameRoomView.js` (44) — source: high priority; many unused vars and some missing hook deps.
2. `components/social/ChatOverlay.js` (35) — source: high priority; large file, many unused vars.
3. `components/rank/StartClient/useStartClientEngine.js` (27) — medium-high; we already refactored helpers and fixed a parsing error.
4. `components/character/CharacterDashboard/index.js` (16)
5. `components/admin/CooldownDashboard.js` (15)
6. `components/rank/MatchQueueClient.js` (10)
7. `pages/admin/portal.js` (10)
8. `components/character/CharacterBasicView.js` (8)
9. `components/rank/MatchReadyClient.js` (8)
10. `components/rank/RankNewClient.js` (8)

Recommended plan (what I'll do next)

- Exclude build artifacts from linting in CI (`.eslintignore` / workflow change) so we don't focus on `.next`.
- Run `eslint --fix` on the top N source files (we ran on 6 already). Commit safe auto-fixes in small batches.
- Manually triage `react-hooks/exhaustive-deps` warnings (these require code review for each instance).
- Update PR description (this file) and push incremental commits to this branch for review.

Checklist

- [x] Extract helpers & add unit tests
- [x] Prettier integration + repo formatting
- [x] Husky + lint-staged install (repo root)
- [x] CI workflow added
- [x] Targeted eslint --fix run on initial batch (this PR)
- [ ] Continue automated fixes (next batch)
- [ ] Manual triage for `react-hooks/exhaustive-deps`
- [ ] Finalize PR and merge

Notes

- I excluded problematic files from Prettier (YAML and large JSON reports) to avoid parse errors during formatting.
- I ran the eslint summary generator under `ai-roomchat/starbase/ai-roomchat/scripts/eslint-summary.js` and used the generated `reports/eslint-summary.json` as input for prioritization.

---

(If you'd like, I can now continue: run eslint --fix on the next batch (N=10), commit, run tests, and push. Say "continue" or "stop".)
