# Shrink deps for `useAdvanceTurn`

Goal
- Reduce the dependency object passed into `useAdvanceTurn` to the minimal set required for its logic.
- Keep changes conservative and test-driven: make one small, reversible change, run full Jest, then iterate.

Why
- Large deps objects increase coupling and make the hook hard to test and refactor.
- Passing only required functions/refs clarifies the hook's contract and enables easier unit testing.

Strategy (conservative, reversible)
1. Audit `useAdvanceTurn` to enumerate every symbol it references.
2. Build a minimal `deps` shape that contains only the referenced names.
3. Replace the large object at the call site in `useStartClientEngine.js` with the minimal object.
   - Keep the full object available as a shim (e.g., keep original call but pass a `.legacy` object) if tests fail; revert quickly.
4. Run `npm test -- --runInBand --verbose`.
5. If tests pass, commit the change. If not, revert and inspect failing tests to see which missing dep must be reintroduced.

Initial audit (symbols referenced inside `useAdvanceTurn`)
- control/state values: preflight, currentNodeId, graph, slots, history, aiMemory, activeGlobal, activeLocal, manualResponse, effectiveApiKey, apiVersion, systemPrompt, turn, participants, participantsStatus, ownerDisplayMap, realtimeEnabled, brawlEnabled, endConditionVariable, winCount, lastDropInTurn, viewerId, gameVoided, gameId, sessionInfo
- setter/update functions: updateHeroAssets, logTurnEntries, voidSession, ensureApiKeyReady, persistApiKeyOnServer, applyRealtimeSnapshot, recordTurnState, bumpHistoryVersion, captureBattleLog, clearManualResponse, clearSessionRecord, finalizeSessionRemotely, markSessionDefeated, patchEngineState, setActiveGlobal, setActiveLocal, setCurrentNodeId, setIsAdvancing, setLogs, setStatusMessage, setTimeRemaining, setTurn, setTurnDeadline, setWinCount
- refs & helpers: realtimeManagerRef, deriveEligibleOwnerIds, resolveActorContext, resolveSlotBinding, makeNodePrompt, prepareHistoryPayload, buildUserActionPersona, pickNextEdge, recordOutcomeLedger, outcomeLedgerRef, buildOutcomeSnapshot, historyRef, participantsRef, visitedSlotIds, logsRef, ownerDisplayMapRef
- misc: isApiKeyError, deriveParticipantOwnerId, formatRealtimeReason, statusMessageRef, parseOutcome, stripOutcomeFooter

Proposal: minimal conservative set to pass first test iteration
- values: preflight, currentNodeId, graph, slots, history, aiMemory, activeGlobal, activeLocal, manualResponse, effectiveApiKey, apiVersion, systemPrompt, turn, participants, realtimeEnabled, brawlEnabled, winCount, viewerId, gameId, sessionInfo
- setters: updateHeroAssets, logTurnEntries, ensureApiKeyReady, persistApiKeyOnServer, applyRealtimeSnapshot, recordTurnState, captureBattleLog, clearManualResponse, clearSessionRecord, finalizeSessionRemotely, patchEngineState, setActiveGlobal, setActiveLocal, setCurrentNodeId, setIsAdvancing, setLogs, setStatusMessage, setTimeRemaining, setTurn, setTurnDeadline, setWinCount
- helpers/refs: realtimeManagerRef, deriveEligibleOwnerIds, resolveActorContext, resolveSlotBinding, makeNodePrompt, prepareHistoryPayload, buildUserActionPersona, pickNextEdge, outcomeLedgerRef, recordOutcomeLedger, buildOutcomeSnapshot, participantsRef, visitedSlotIds, logsRef
- utils: isApiKeyError

This set removes a few rarely-used items (ownerDisplayMapRef, ownerDisplayMap, participantsStatus, lastDropInTurn, endConditionVariable, bumpHistoryVersion, markSessionDefeated, historyRef, deriveParticipantOwnerId, formatRealtimeReason, statusMessageRef, parseOutcome, stripOutcomeFooter). We'll reintroduce any missing name as required.

Safe roll-forward plan
- Step A: Modify call site to pass the `minimalDeps` object (create the object in-place so it's obvious in the diff). Keep original large object commented out for quick revert.
- Step B: Run tests. If green, remove the commented original and commit.
- Step C: If failures reference missing names, add them back one-by-one and re-run tests until green.

Next action (I'll perform now)
- Create the `minimalDeps` object at the `useAdvanceTurn` call site in `useStartClientEngine.js` and call `useAdvanceTurn(minimalDeps)`.
- Run the full Jest suite.

If you'd rather I make the change behind a feature flag or create a branch/PR first, tell me; otherwise I'll apply the change and run tests.
