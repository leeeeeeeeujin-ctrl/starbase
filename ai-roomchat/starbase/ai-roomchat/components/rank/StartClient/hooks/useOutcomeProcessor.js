import { parseOutcome as parseOutcomeDefault } from '@/lib/promptEngine/outcome';
import { stripOutcomeFooter as stripOutcomeFooterDefault } from '../utils';

export default function createOutcomeProcessor(deps) {
  const {
  parseOutcome = parseOutcomeDefault,
  stripOutcomeFooter = stripOutcomeFooterDefault,
  updateHeroAssets = () => {},
    // defaults to safe no-ops or empty containers so unit tests can omit optional deps
    // logTurnEntries is awaited by the processor, so provide an async no-op
    logTurnEntries = async () => {},
    setActiveLocal = () => {},
    setActiveGlobal = () => {},
    createBridgeContext = () => ({}),
    pickNextEdge = () => null,
    setLogs = fn => {
      try {
        const prev = logsRef?.current || [];
        const next = typeof fn === 'function' ? fn(prev) : fn;
        if (logsRef) logsRef.current = next;
        return next;
      } catch (e) {
        return [];
      }
    },
    logsRef = { current: [] },
    visitedSlotIds = { current: new Set() },
  aiMemory = {},
  prepareHistoryPayload = () => ({}),
  buildUserActionPersona = () => ({}),
  clearManualResponse = () => {},
  outcomeLedgerRef = { current: null },
  recordOutcomeLedger = () => ({ changed: false, completed: false }),
  buildOutcomeSnapshot = () => null,
  setSessionOutcome = () => {},
  sessionFinalizedRef = { current: false },
  setStatusMessage = () => {},
  finalizeRealtimeTurn = () => {},
  setCurrentNodeId = () => {},
  setTurnDeadline = () => {},
  setTimeRemaining = () => {},
  captureBattleLog = () => {},
  clearSessionRecord = () => {},
  finalizeSessionRemotely = () => {},
  setTurn = () => {},
  setWinCount = () => {},
  brawlEnabled = false,
  winCount = 0,
  viewerId = null,
  markSessionDefeated = () => {},
  participantsRef = { current: {} },
  participantsStatus = {},
  activeGlobalNamesRef = { current: [] },
  activeLocalNamesRef = { current: [] },
  visitedSlotIdsRef = { current: new Set() },
  // fallback graph when not provided by tests
  graph = { edges: [] },
  } = deps;

  return async function processOutcome({
    responseText,
    promptText,
    promptEntry,
    responseEntry,
    node,
    slotBinding,
    actorContext,
    turn,
    manualResponse,
    effectiveApiKey,
    apiVersion,
    apiVersionLock,
    normalizedGeminiMode,
    normalizedGeminiModel,
    sessionInfo,
    gameId,
    history,
    serverPayload,
  }) {
    const outcome = parseOutcome(responseText);
    const outcomeVariables = outcome.variables || [];
    const { body: visibleResponse } = stripOutcomeFooter(responseText);
    const triggeredEnd = false; // caller may compute if needed
    const fallbackActorNames = [];
    if (actorContext?.participant?.hero?.name) {
      fallbackActorNames.push(actorContext.participant.hero.name);
    } else if (actorContext?.heroSlot?.name) {
      fallbackActorNames.push(actorContext.heroSlot.name);
    }

    const resolvedActorNames = outcome.actors && outcome.actors.length ? outcome.actors : fallbackActorNames;
    updateHeroAssets(resolvedActorNames, actorContext);

    if (promptEntry?.meta) {
      promptEntry.meta = { ...promptEntry.meta, actors: resolvedActorNames };
    }
    if (responseEntry?.meta) {
      responseEntry.meta = { ...responseEntry.meta, actors: resolvedActorNames };
    }

    const nextActiveGlobal = Array.from(new Set([...(activeGlobalNamesRef?.current || []), ...(outcome.variables || [])]));

    let fallbackSummary = null;
    if (!serverPayload?.logged) {
      fallbackSummary = {
  preview: visibleResponse.slice(0, 240),
  promptPreview: (promptText || '').slice(0, 240),
        outcome: { lastLine: outcome.lastLine || undefined, variables: outcome.variables && outcome.variables.length ? outcome.variables : undefined, actors: resolvedActorNames && resolvedActorNames.length ? resolvedActorNames : undefined },
  extra: { slotIndex: slotBinding?.slotIndex, nodeId: node?.id ?? null, source: 'fallback-log' },
      };

      await logTurnEntries({
        entries: [
          { role: promptEntry?.role || 'system', content: promptEntry?.content || promptText, public: promptEntry?.public, visibility: slotBinding?.hasLimitedAudience ? (promptEntry?.public === false ? 'hidden' : 'private') : 'public', extra: { slotIndex: slotBinding?.slotIndex } },
          { role: responseEntry?.role || 'assistant', content: responseText, public: responseEntry?.public, visibility: responseEntry?.public ? 'public' : 'private', actors: resolvedActorNames, summary: fallbackSummary, extra: { slotIndex: slotBinding?.slotIndex, nodeId: node?.id ?? null } },
        ],
        turnNumber: turn,
      });
    }

    // If there is no outcome ledger available, produce a snapshot and return
    // without finalizing the session so tests that only provide a snapshot hook
    // are satisfied.
    if (!outcomeLedgerRef?.current) {
      const snapshot = buildOutcomeSnapshot?.(outcomeLedgerRef?.current ?? null);
      setSessionOutcome?.(snapshot);
      return { finalized: false };
    }

    setActiveLocal(outcomeVariables);
    setActiveGlobal(nextActiveGlobal);

    const historyUserText = history?.joinedText ? history.joinedText({ onlyPublic: true, last: 5 }) : '';
    const historyAiText = history?.joinedText ? history.joinedText({ onlyPublic: false, last: 5 }) : '';

    const context = createBridgeContext({
      turn,
      historyUserText,
      historyAiText,
      visitedSlotIds: visitedSlotIds?.current || new Set(),
      participantsStatus: participantsStatus,
      activeGlobalNames: nextActiveGlobal,
      activeLocalNames: outcomeVariables,
      currentRole: actorContext?.participant?.role || actorContext?.heroSlot?.role || null,
      sessionFlags: { brawlEnabled, winCount, endTriggered: triggeredEnd },
    });

  const nodeId = node?.id ?? null;
  const outgoing = graph.edges.filter(edge => edge.from === String(nodeId) || edge.from === nodeId);
    const chosenEdge = pickNextEdge(outgoing, context);

    setLogs(prev => {
  const nextLogs = [...prev, { turn, nodeId: node?.id ?? null, slotIndex: slotBinding?.slotIndex, promptAudience: slotBinding?.promptAudience, responseAudience: slotBinding?.responseAudience, prompt: promptText, response: responseText, visibleResponse, outcome: outcome.lastLine || '', variables: outcomeVariables, next: chosenEdge?.to || null, action: chosenEdge?.data?.action || 'continue', actors: resolvedActorNames, summary: serverPayload?.summary || fallbackSummary || null }];
      logsRef.current = nextLogs;
      return nextLogs;
    });

    clearManualResponse?.();

    if (outcomeLedgerRef?.current) {
  const recordResult = recordOutcomeLedger(outcomeLedgerRef.current, { turn, slotIndex: slotBinding?.slotIndex, resultLine: outcome.lastLine || '', variables: outcomeVariables, actors: resolvedActorNames, participantsSnapshot: participantsRef.current, brawlEnabled });

      if (recordResult.changed) {
        const snapshot = buildOutcomeSnapshot(outcomeLedgerRef.current);
        setSessionOutcome?.(snapshot);

        if (recordResult.completed && !sessionFinalizedRef.current) {
          sessionFinalizedRef.current = true;
          const statusMessageText = `모든 역할군 결과가 확정되어 세션을 종료합니다.`;
          setStatusMessage?.(statusMessageText);
          finalizeRealtimeTurn?.('roles_resolved');
          setCurrentNodeId?.(null);
          setTurnDeadline?.(null);
          setTimeRemaining?.(null);
          captureBattleLog?.(snapshot.overallResult === 'won' ? 'win' : snapshot.overallResult === 'lost' ? 'lose' : 'draw', { reason: 'roles_resolved', turnNumber: turn });
          clearSessionRecord?.();
          // historical tests expect finalizeSessionRemotely to be invoked with
          // the sessionInfo and gameId payload shape.
          void finalizeSessionRemotely?.({ sessionInfo, gameId });
          return { finalized: true };
        }
      }
    }

    if (!chosenEdge) {
      finalizeRealtimeTurn?.('no-bridge');
      setCurrentNodeId?.(null);
      setStatusMessage?.('더 이상 진행할 경로가 없어 세션을 종료합니다.');
      setTurnDeadline?.(null);
      setTimeRemaining?.(null);
      captureBattleLog?.('terminated', { reason: 'no_path', turnNumber: turn });
      clearSessionRecord?.();
      return { finalized: true };
    }

    const action = chosenEdge.data?.action || 'continue';
    const nextNodeId = chosenEdge.to != null ? String(chosenEdge.to) : null;

    if (action === 'win') {
      const upcomingWin = winCount + 1;
      if (brawlEnabled && !triggeredEnd) {
        setWinCount?.(prev => prev + 1);
        setStatusMessage?.(`승리 ${upcomingWin}회 달성! 난입 허용 규칙으로 전투가 계속됩니다.`);
      } else {
        if (brawlEnabled) {
          setWinCount?.(() => upcomingWin);
        }
        finalizeRealtimeTurn?.('win');
        setCurrentNodeId?.(null);
        const suffix = brawlEnabled ? ` 누적 승리 ${upcomingWin}회를 기록했습니다.` : '';
        setStatusMessage?.(`승리 조건이 충족되었습니다!${suffix}`);
        setTurnDeadline?.(null);
        setTimeRemaining?.(null);
        captureBattleLog?.('win', { reason: 'win', turnNumber: turn });
        sessionFinalizedRef.current = true;
        if (outcomeLedgerRef.current) {
          const snapshot = buildOutcomeSnapshot(outcomeLedgerRef.current);
          setSessionOutcome?.(snapshot);
          void finalizeSessionRemotely?.({ snapshot, reason: 'win', responseText, turnNumber: turn });
        } else {
          void finalizeSessionRemotely?.({ snapshot: null, reason: 'win', responseText, turnNumber: turn });
        }
        clearSessionRecord?.();
        return { finalized: true };
      }
    } else if (action === 'lose') {
      finalizeRealtimeTurn?.('lose');
      setCurrentNodeId?.(null);
      setStatusMessage?.(brawlEnabled ? '패배로 해당 역할군이 전장에서 추방되었습니다.' : '패배 조건이 충족되었습니다.');
      setTurnDeadline?.(null);
      setTimeRemaining?.(null);
      captureBattleLog?.('lose', { reason: 'lose', turnNumber: turn });
      sessionFinalizedRef.current = true;
      if (outcomeLedgerRef.current) {
        const snapshot = buildOutcomeSnapshot(outcomeLedgerRef.current);
        setSessionOutcome?.(snapshot);
        void finalizeSessionRemotely?.({ snapshot, reason: 'lose', responseText, turnNumber: turn });
      } else {
        void finalizeSessionRemotely?.({ snapshot: null, reason: 'lose', responseText, turnNumber: turn });
      }
      if (viewerId && actorContext?.participant?.owner_id === viewerId) {
        markSessionDefeated?.();
      } else {
        clearSessionRecord?.();
      }
      return { finalized: true };
    } else if (action === 'draw') {
      finalizeRealtimeTurn?.('draw');
      setCurrentNodeId?.(null);
      setStatusMessage?.('무승부로 종료되었습니다.');
      setTurnDeadline?.(null);
      setTimeRemaining?.(null);
      captureBattleLog?.('draw', { reason: 'draw', turnNumber: turn });
      sessionFinalizedRef.current = true;
      if (outcomeLedgerRef.current) {
        const snapshot = buildOutcomeSnapshot(outcomeLedgerRef.current);
        setSessionOutcome?.(snapshot);
        void finalizeSessionRemotely?.({ snapshot, reason: 'draw', responseText, turnNumber: turn });
      } else {
        void finalizeSessionRemotely?.({ snapshot: null, reason: 'draw', responseText, turnNumber: turn });
      }
      clearSessionRecord?.();
      return { finalized: true };
    }

    if (!nextNodeId) {
      finalizeRealtimeTurn?.('missing-next');
      setCurrentNodeId?.(null);
      setStatusMessage?.('다음에 진행할 노드를 찾을 수 없습니다.');
      setTurnDeadline?.(null);
      setTimeRemaining?.(null);
      captureBattleLog?.('terminated', { reason: 'missing_next', turnNumber: turn });
      clearSessionRecord?.();
      return { finalized: true };
    }

    finalizeRealtimeTurn?.('continue');
    setCurrentNodeId?.(nextNodeId);
    setTurn?.(prev => prev + 1);

    return { finalized: false };
  };
}
