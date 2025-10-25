import { useCallback } from 'react';

// Extracted session start logic. Returns a stable `handleStart` callback that
// mirrors the original implementation inside useStartClientEngine.
export default function useSessionStarter({
  graphNodes,
  startingSession,
  gameId,
  effectiveApiKey,
  ensureApiKeyReady,
  persistApiKeyOnServer,
  apiVersion,
  normalizedGeminiMode,
  normalizedGeminiModel,
  setStartingSession,
  setStatusMessage,
  supabase,
  viewerParticipantRole,
  realtimeEnabled,
  participants,
  slotLayout,
  matchingMetadata,
  setPromptMetaWarning,
  bootLocalSession,
  reconcileParticipantsForGame,
  formatPreflightSummary,
  setSessionInfo,
}) {
  return useCallback(async () => {
    if (!Array.isArray(graphNodes) || graphNodes.length === 0) {
      setStatusMessage('시작할 프롬프트 세트를 찾을 수 없습니다.');
      return;
    }

    if (startingSession) {
      return;
    }

    if (!gameId) {
      setStatusMessage('게임 정보를 찾을 수 없습니다.');
      return;
    }

    if (effectiveApiKey) {
      if (!ensureApiKeyReady(effectiveApiKey)) {
        return;
      }

      await persistApiKeyOnServer(effectiveApiKey, apiVersion, {
        geminiMode: normalizedGeminiMode,
        geminiModel: normalizedGeminiModel,
      });
    }

    setStartingSession(true);
    setStartingSession(true);
    setStatusMessage('세션을 준비하는 중입니다…');

    let sessionReady = false;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error('세션 정보가 만료되었습니다. 다시 로그인해 주세요.');
      }

      const response = await fetch('/api/rank/start-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          game_id: gameId,
          mode: realtimeEnabled ? 'realtime' : 'manual',
          role: viewerParticipantRole || null,
          match_code: null,
        }),
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        const message = payload?.error || payload?.detail || '전투 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        throw new Error(message);
      }

      if (!payload?.ok) {
        const message = payload?.error || '전투 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        throw new Error(message);
      }

      const sessionPayload = payload?.session || null;
      if (!sessionPayload?.id) {
        throw new Error('세션 정보를 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }

      setSessionInfo({
        id: sessionPayload.id,
        status: sessionPayload.status || 'active',
        createdAt: sessionPayload.created_at || null,
        reused: Boolean(sessionPayload.reused),
      });

      sessionReady = true;
    } catch (error) {
      console.error('세션 준비 실패:', error);
      const message = error?.message || '전투 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      setStatusMessage(message);
    } finally {
      setStartingSession(false);
    }

    if (!sessionReady) return;

    setStatusMessage('매칭 데이터를 검증하는 중입니다…');
    await new Promise(resolve => setTimeout(resolve, 200));

    let sessionParticipants = participants;
    try {
      const { participants: sanitized, removed } = reconcileParticipantsForGame({
        participants,
        slotLayout,
        matchingMetadata,
      });

      if (!sanitized || sanitized.length === 0) {
        setStatusMessage('적절한 참가자를 찾을 수 없어 게임을 시작할 수 없습니다.');
        return;
      }

      sessionParticipants = sanitized;

      if (removed.length) {
        const summary = formatPreflightSummary(removed);
        if (summary) {
          console.warn('[StartClient] 원격 후보정 제외 참가자:\n' + summary);
          setPromptMetaWarning(prev => {
            const trimmed = prev ? String(prev).trim() : '';
            const notice = `[후보정] 제외된 참가자:\n${summary}`;
            return trimmed ? `${trimmed}\n\n${notice}` : notice;
          });
        }
        setStatusMessage('일부 참가자가 제외되어 게임 준비를 계속합니다.');
      } else {
        setStatusMessage('게임 준비가 완료되었습니다.');
      }
    } catch (error) {
      console.error('매칭 데이터 검증 실패:', error);
      setStatusMessage('매칭 데이터를 검증하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    bootLocalSession(sessionParticipants);
  }, [
    graphNodes,
    startingSession,
    gameId,
    effectiveApiKey,
    ensureApiKeyReady,
    persistApiKeyOnServer,
    apiVersion,
    normalizedGeminiMode,
    normalizedGeminiModel,
    setStartingSession,
    setStatusMessage,
    supabase,
    viewerParticipantRole,
    realtimeEnabled,
    participants,
    slotLayout,
    matchingMetadata,
    setPromptMetaWarning,
    bootLocalSession,
    reconcileParticipantsForGame,
    formatPreflightSummary,
    setSessionInfo,
  ]);
}
