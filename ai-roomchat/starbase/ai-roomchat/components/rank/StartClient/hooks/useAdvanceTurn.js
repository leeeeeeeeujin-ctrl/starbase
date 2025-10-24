import { useCallback } from 'react';

// Import a few stable helpers directly to reduce the dependency object
// surface required from the call site.
const { makeNodePrompt } = require('@/lib/promptEngine');
const { prepareHistoryPayload } = require('@/lib/rank/chatHistory');
const { buildUserActionPersona } = require('../engine/actorContext');
const { pickNextEdge } = require('../engine/graph');
const { resolveActorContext } = require('../engine/actorContext');
const { resolveSlotBinding } = require('../engine/slotBindingResolver');
const { deriveEligibleOwnerIds } = require('../services/turnVoteController');

export default function useAdvanceTurn(deps) {
  const {
    preflight,
    currentNodeId,
    graph,
    slots,
    history,
    aiMemory,
    activeGlobal,
    activeLocal,
    manualResponse,
    effectiveApiKey,
    apiVersion,
    systemPrompt,
    turn,
    participants,
    participantsStatus,
    ownerDisplayMap,
    realtimeEnabled,
    brawlEnabled,
    endConditionVariable,
    winCount,
    lastDropInTurn,
    viewerId,
    updateHeroAssets,
    logTurnEntries,
    voidSession,
    gameVoided,
    ensureApiKeyReady,
    persistApiKeyOnServer,
    normalizedGeminiMode,
    normalizedGeminiModel,
    applyRealtimeSnapshot,
    recordTurnState,
    bumpHistoryVersion,
    captureBattleLog,
    clearManualResponse,
    clearSessionRecord,
    finalizeSessionRemotely,
    gameId,
    markSessionDefeated,
    patchEngineState,
    sessionInfo,
    setActiveGlobal,
    setActiveLocal,
    setCurrentNodeId,
    setIsAdvancing,
    setLogs,
    setStatusMessage,
    setTimeRemaining,
    setTurn,
    setTurnDeadline,
    setWinCount,
    // refs / helpers used in body
    realtimeManagerRef,
    deriveEligibleOwnerIds,
    resolveActorContext,
    resolveSlotBinding,
    makeNodePrompt,
    prepareHistoryPayload,
    buildUserActionPersona,
    pickNextEdge,
    recordOutcomeLedger,
  outcomeLedgerRef,
  buildOutcomeSnapshot,
    
    isApiKeyError,
  } = deps;

    // add missing deps used by the inlined helpers
  const { deriveParticipantOwnerId, formatRealtimeReason, statusMessageRef } = deps;

  return useCallback(
    async (overrideResponse = null, options = {}) => {
      // The implementation is copied verbatim from the original engine to keep the
      // initial refactor low-risk. It still references the names destructured above.
      if (preflight) {
        setStatusMessage('먼저 "게임 시작"을 눌러 주세요.');
        return;
      }
      if (!currentNodeId) {
        setStatusMessage('진행 가능한 노드가 없습니다.');
        return;
      }

      const node = graph.nodes.find(entry => entry.id === currentNodeId);
      if (!node) {
        setStatusMessage('현재 노드 정보를 찾을 수 없습니다.');
        return;
      }

      if (gameVoided) {
        setStatusMessage('게임이 무효 처리되어 더 이상 진행할 수 없습니다.');
        return;
      }

      const advanceReason =
        typeof options?.reason === 'string' && options.reason.trim()
          ? options.reason.trim()
          : 'unspecified';

      const actorContext = resolveActorContext({ node, slots, participants });
      const slotBinding = resolveSlotBinding({ node, actorContext });
      const slotTypeValue = node.slot_type || 'ai';
      const isUserAction = slotTypeValue === 'user_action' || slotTypeValue === 'manual';
      const historyRole = isUserAction ? 'user' : 'assistant';
      const actingOwnerId = actorContext?.participant?.owner_id || null;

      // extract realtime helpers to separate module for clarity
      const { createFinalizeRealtimeTurn, createRecordRealtimeParticipation } = require('./useRealtimeHelpers');

      // create small local refs/adapters so the call site doesn't need to pass
      // `participantsRef` and `logsRef` objects (reduces advanceTurnDeps surface)
      const participantsRefLocal = { current: participants };
      const logsRefLocal = { current: [] };
      const setLogsAdapter = fn => {
        try {
          const prev = logsRefLocal.current || [];
          const next = typeof fn === 'function' ? fn(prev) : fn;
          logsRefLocal.current = next;
          return setLogs(fn);
        } catch (e) {
          // fallback to calling the original setter; keep behavior tolerant
          return setLogs(fn);
        }
      };

      const finalizeRealtimeTurn = createFinalizeRealtimeTurn({
        realtimeEnabled,
        realtimeManagerRef,
        deriveEligibleOwnerIds,
        participants,
        turn,
        recordTurnState,
        applyRealtimeSnapshot,
        ownerDisplayMap,
        formatRealtimeReason,
        logTurnEntries,
        participantsRef: participantsRefLocal,
        deriveParticipantOwnerId,
        patchEngineState,
        statusMessageRef,
      });
      const recordRealtimeParticipation = createRecordRealtimeParticipation({
        realtimeEnabled,
        realtimeManagerRef,
        applyRealtimeSnapshot,
        turn,
      });

      if (isUserAction && (!viewerId || actingOwnerId !== viewerId)) {
        setStatusMessage('현재 차례의 플레이어만 행동을 제출할 수 있습니다.');
        return;
      }

      if (isUserAction && actingOwnerId) {
        recordRealtimeParticipation(actingOwnerId, 'action');
      }

      setIsAdvancing(true);
      setStatusMessage('');
      setTurnDeadline(null);
      setTimeRemaining(null);

      try {
        const compiled = makeNodePrompt({
          node,
          slots,
          historyText: history.joinedText({ onlyPublic: false, last: 12 }),
          activeGlobalNames: activeGlobal,
          activeLocalNames: activeLocal,
          currentSlot: slotBinding.templateSlotRef,
        });

  const { processCompiledPrompt } = require('./useAdvanceTurnUtils');
  // local visitedSlotIds ref (call site no longer needs to provide this)
  const visitedSlotIdsLocal = { current: new Set() };
  const visitedSlotIdsRefLocal = visitedSlotIdsLocal;
  const { promptText } = processCompiledPrompt({ compiled, visitedSlotIds: visitedSlotIdsLocal });
        const historyPayload = prepareHistoryPayload(aiMemory, { limit: 32 });

        let responseText =
          typeof overrideResponse === 'string' ? overrideResponse.trim() : manualResponse.trim();

        let loggedByServer = false;
        let loggedTurnNumber = null;
        let serverSummary = null;

        let effectiveSystemPrompt = systemPrompt;
        let effectivePrompt = promptText;

        if (!realtimeEnabled && isUserAction) {
          const { buildEffectivePrompts } = require('./useAdvanceTurnUtils');
          const prompts = buildEffectivePrompts({
            realtimeEnabled,
            isUserAction,
            systemPrompt,
            buildUserActionPersona,
            actorContext,
            promptText,
          });
          effectiveSystemPrompt = prompts.effectiveSystemPrompt;
          effectivePrompt = prompts.effectivePrompt;
        }

  if (!responseText) {
          if (!effectiveApiKey) {
            setStatusMessage(
              'AI API 키가 입력되지 않았습니다. 왼쪽 패널에서 키를 입력한 뒤 다시 시도해 주세요.'
            );
            return;
          }

          if (realtimeEnabled) {
            if (apiVersionLock.current && apiVersionLock.current !== apiVersion) {
              throw new Error('실시간 매칭에서는 처음 선택한 API 버전을 변경할 수 없습니다.');
            }
          }

              if (!sessionInfo?.id) {
                throw new Error('세션 정보를 확인할 수 없습니다. 페이지를 새로고침해 주세요.');
              }

          if (!ensureApiKeyReady(effectiveApiKey)) {
            return;
          }

          await persistApiKeyOnServer(effectiveApiKey, apiVersion, {
            geminiMode: normalizedGeminiMode,
            geminiModel: normalizedGeminiModel,
          });

          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            throw sessionError;
          }

          const token = sessionData?.session?.access_token;
          if (!token) {
            throw new Error('세션 토큰을 확인할 수 없습니다.');
          }

          // Use centralized run-turn API helper to avoid duplicate fetch/error parsing logic
          const { default: createRunTurnApi } = require('./useRunTurnApi');
          const { runTurn } = createRunTurnApi({ basePath: '' });

          const { ok, data, error: runError } = await runTurn(
            {
              apiKey: effectiveApiKey,
              system: effectiveSystemPrompt,
              prompt: effectivePrompt,
              apiVersion,
              geminiMode: apiVersion === 'gemini' ? normalizedGeminiMode : undefined,
              geminiModel: apiVersion === 'gemini' ? normalizedGeminiModel : undefined,
              session_id: sessionInfo.id,
              game_id: gameId,
              prompt_role: 'system',
              response_role: historyRole,
              response_public: true,
              history: historyPayload,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          const payload = data || {};

          if (!ok) {
            const message = payload?.error || payload?.detail || runError?.message || 'AI 호출에 실패했습니다.';
            const err = new Error(message);
            if (payload?.error) err.code = payload.error;
            if (typeof payload?.detail === 'string' && payload.detail.trim()) err.detail = payload.detail.trim();
            throw err;
          }

          if (payload?.error) {
            const error = new Error(payload.error);
            error.code = payload.error;
            throw error;
          }

          responseText =
            (typeof payload?.text === 'string' && payload.text.trim()) ||
            payload?.choices?.[0]?.message?.content ||
            payload?.content ||
            '';

          if (payload?.logged) {
            loggedByServer = true;
            const numericTurn = Number(payload?.turn_number);
            if (Number.isFinite(numericTurn)) {
              loggedTurnNumber = numericTurn;
            }
            if (Array.isArray(payload?.entries)) {
              const responseEntry = payload.entries.find(entry => entry?.role === historyRole);
              if (responseEntry?.summary_payload) {
                try {
                  serverSummary = JSON.parse(JSON.stringify(responseEntry.summary_payload));
                } catch {
                  serverSummary = responseEntry.summary_payload;
                }
              }
            }
          }

          if (realtimeEnabled && !apiVersionLock.current) {
            apiVersionLock.current = apiVersion;
          }
        }

        if (!responseText) {
          responseText = ['(샘플 응답)', '', '', '', '', '무승부'].join('\n');
        }

        const { computeAudiencePayloads, createHistoryEntries } = require('./useAdvanceTurnUtils');
        const { slotIndex, promptAudiencePayload, responseAudiencePayload, responseIsPublic, promptVisibility, responseVisibility } =
          computeAudiencePayloads(slotBinding);

        const { computeFallbackActorNames } = require('./useAdvanceTurnUtils');
        const fallbackActorNames = computeFallbackActorNames(actorContext);

        const { promptEntry, responseEntry } = createHistoryEntries({
          history,
          effectivePrompt,
          promptAudiencePayload,
          responseAudiencePayload,
          historyRole,
          responseText,
          slotIndex,
        });

        // Delegate outcome parsing and post-response handling to the outcome processor
        const { default: createOutcomeProcessor } = require('./useOutcomeProcessor');
        const processOutcome = createOutcomeProcessor({
          parseOutcome,
          stripOutcomeFooter,
          updateHeroAssets,
          logTurnEntries,
          setActiveLocal,
          setActiveGlobal,
          createBridgeContext,
          pickNextEdge,
          setLogs: setLogsAdapter,
          logsRef: logsRefLocal,
          visitedSlotIds: visitedSlotIdsLocal,
          aiMemory,
          prepareHistoryPayload,
          buildUserActionPersona,
          outcomeLedgerRef,
          recordOutcomeLedger,
          buildOutcomeSnapshot,
          setSessionOutcome,
          sessionFinalizedRef,
          setStatusMessage,
          finalizeRealtimeTurn,
          setCurrentNodeId,
          setTurnDeadline,
          setTimeRemaining,
          captureBattleLog,
          clearSessionRecord,
          finalizeSessionRemotely,
          setTurn,
          setWinCount,
          brawlEnabled,
          winCount,
          viewerId,
          markSessionDefeated,
          participantsRef: participantsRefLocal,
          participantsStatus,
          visitedSlotIdsRef: visitedSlotIdsRefLocal,
        });

        const outcomeResult = await processOutcome({ responseText, promptText, promptEntry, responseEntry, node, slotBinding, actorContext, turn, manualResponse, effectiveApiKey, apiVersion, apiVersionLock, normalizedGeminiMode, normalizedGeminiModel, sessionInfo, gameId, history, serverPayload: null });
        if (outcomeResult?.finalized) {
          return; // exit early if session finalized by outcome processor
        }
      } catch (err) {
        console.error(err);
        if (isApiKeyError(err)) {
          const reason = err?.code || 'api_key_error';
          const fallback =
            reason === 'quota_exhausted'
              ? '사용 중인 API 키 한도가 모두 소진되어 세션이 무효 처리되었습니다. 새 키를 등록해 주세요.'
              : reason === 'missing_user_api_key'
                ? 'AI API 키가 입력되지 않아 세션이 중단되었습니다. 왼쪽 패널에서 키를 입력한 뒤 다시 시도해 주세요.'
                : err?.message || 'API 키 오류로 세션이 무효 처리되었습니다.';
          voidSession(fallback, {
            apiKey: effectiveApiKey,
            reason,
            provider: apiVersion,
            viewerId,
            gameId,
            sessionId: sessionInfo?.id || null,
            note: err?.message || null,
          });
        } else {
          setStatusMessage(err?.message || '턴 진행 중 오류가 발생했습니다.');
        }
      } finally {
        setIsAdvancing(false);
      }
    },
    [
      preflight,
      currentNodeId,
      graph,
      slots,
      history,
      aiMemory,
      activeGlobal,
      activeLocal,
      manualResponse,
      effectiveApiKey,
      apiVersion,
      systemPrompt,
      turn,
      participants,
      participantsStatus,
      ownerDisplayMap,
      realtimeEnabled,
      brawlEnabled,
      endConditionVariable,
      winCount,
      lastDropInTurn,
      viewerId,
      updateHeroAssets,
      logTurnEntries,
      voidSession,
      gameVoided,
      ensureApiKeyReady,
      persistApiKeyOnServer,
      normalizedGeminiMode,
      normalizedGeminiModel,
      applyRealtimeSnapshot,
      recordTurnState,
      bumpHistoryVersion,
      captureBattleLog,
      clearManualResponse,
      clearSessionRecord,
      finalizeSessionRemotely,
      gameId,
      markSessionDefeated,
      patchEngineState,
      sessionInfo,
      setActiveGlobal,
      setActiveLocal,
      setCurrentNodeId,
      setIsAdvancing,
      setLogs,
      setStatusMessage,
      setTimeRemaining,
      setTurn,
      setTurnDeadline,
      setWinCount,
    ]
  );
}
