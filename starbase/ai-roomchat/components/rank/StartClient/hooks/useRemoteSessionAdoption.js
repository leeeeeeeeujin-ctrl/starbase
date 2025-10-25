import { useCallback, useEffect } from 'react';
import { subscribeToBroadcastTopic } from '@/lib/realtime/broadcast';
import { fetchLatestSessionRow } from '@/modules/rank/matchRealtimeSync';
import { reconcileParticipantsForGame, formatPreflightSummary } from '../engine/preflight';

export function useRemoteSessionAdoption({
  gameId,
  normalizedHostOwnerId,
  preflight,
  startingSession,
  participants,
  slotLayout,
  matchingMetadata,
  setPromptMetaWarning,
  setStatusMessage,
  bootLocalSessionRef,
  setSessionInfo,
  remoteSessionFetchRef,
  remoteSessionAdoptedRef,
  supabase,
}) {
  const adoptRemoteSession = useCallback(
    async sessionRow => {
      if (!sessionRow || typeof sessionRow !== 'object') {
        return false;
      }

      const sessionId = sessionRow.id || sessionRow.session_id || sessionRow.sessionId;
      if (!sessionId) return false;

      if (remoteSessionAdoptedRef.current && setSessionInfo && setSessionInfo()?.id === sessionId) {
        // best-effort check; parent manages actual sessionInfo state
        return false;
      }

      const statusToken = sessionRow.status ? String(sessionRow.status).trim().toLowerCase() : 'active';
      if (statusToken && statusToken !== 'active') return false;

      const ownerSource =
        sessionRow.owner_id ?? sessionRow.ownerId ?? sessionRow.ownerID ?? (sessionRow.owner && typeof sessionRow.owner === 'object' ? sessionRow.owner.id : null);
      const ownerToken = ownerSource !== null && ownerSource !== undefined ? String(ownerSource).trim() : '';
      if (normalizedHostOwnerId && ownerToken && ownerToken !== normalizedHostOwnerId) return false;

      if (!preflight) {
        if (setSessionInfo) {
          setSessionInfo({
            id: sessionId,
            status: sessionRow.status || 'active',
            createdAt: sessionRow.created_at || sessionRow.createdAt || null,
            reused: true,
          });
        }
        return false;
      }

      if (!participants || participants.length === 0) return false;

      if (setSessionInfo) {
        setSessionInfo({
          id: sessionId,
          status: sessionRow.status || 'active',
          createdAt: sessionRow.created_at || sessionRow.createdAt || null,
          reused: true,
        });
      }

      remoteSessionAdoptedRef.current = true;

      let sessionParticipants = participants;
      try {
        const { participants: sanitized, removed } = reconcileParticipantsForGame({
          participants,
          slotLayout,
          matchingMetadata,
        });

        if (!sanitized || sanitized.length === 0) {
          remoteSessionAdoptedRef.current = false;
          setStatusMessage && setStatusMessage('참가자 구성이 유효하지 않아 게임에 참여할 수 없습니다.');
          return false;
        }

        sessionParticipants = sanitized;

        if (removed.length && setPromptMetaWarning) {
          const summary = formatPreflightSummary(removed);
          if (summary) {
            console.warn('[StartClient] 원격 후보정 제외 참가자:\n' + summary);
            setPromptMetaWarning(prev => {
              const trimmed = prev ? String(prev).trim() : '';
              const notice = `[후보정] 제외된 참가자:\n${summary}`;
              return trimmed ? `${trimmed}\n\n${notice}` : notice;
            });
          }
        }
      } catch (error) {
        remoteSessionAdoptedRef.current = false;
        console.error('[StartClient] 원격 세션 검증 실패:', error);
        setStatusMessage && setStatusMessage('매칭 데이터를 검증하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return false;
      }

      setStatusMessage && setStatusMessage('호스트가 게임을 시작했습니다. 전투에 합류합니다.');
      const bootSession = typeof bootLocalSessionRef?.current === 'function' ? bootLocalSessionRef.current : null;
      if (!bootSession) {
        remoteSessionAdoptedRef.current = false;
        console.warn('[StartClient] 로컬 세션 부팅 콜백이 초기화되지 않았습니다.');
        setStatusMessage && setStatusMessage('게임 화면을 초기화하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        return false;
      }

      bootSession(sessionParticipants);
      return true;
    },
    [
      preflight,
      participants,
      slotLayout,
      matchingMetadata,
      setPromptMetaWarning,
      setStatusMessage,
      setSessionInfo,
      normalizedHostOwnerId,
      bootLocalSessionRef,
      remoteSessionAdoptedRef,
    ]
  );

  useEffect(() => {
    if (!gameId) return undefined;
    if (sessionInfo?.id) return undefined;
    if (!preflight) return undefined;
    if (startingSession) return undefined;
    if (remoteSessionAdoptedRef.current) return undefined;
    if (!participants || participants.length === 0) return undefined;

    const now = Date.now();
    if (remoteSessionFetchRef.current.running) return undefined;
    if (now - remoteSessionFetchRef.current.lastFetchedAt < 2000) return undefined;

    let cancelled = false;
    remoteSessionFetchRef.current.running = true;
    (async () => {
      try {
        let sessionRow = await fetchLatestSessionRow(supabase, gameId, {
          ownerId: normalizedHostOwnerId || null,
        });

        if (cancelled) return;

        if (!sessionRow && normalizedHostOwnerId) {
          sessionRow = await fetchLatestSessionRow(supabase, gameId);
        }

        if (cancelled) return;

        if (sessionRow) {
          adoptRemoteSession(sessionRow);
        }
      } catch (error) {
        if (!cancelled) console.warn('[StartClient] 원격 세션 조회 중 오류:', error);
      } finally {
        remoteSessionFetchRef.current.running = false;
        remoteSessionFetchRef.current.lastFetchedAt = Date.now();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    gameId,
    sessionInfo?.id,
    preflight,
    startingSession,
    participants,
    adoptRemoteSession,
    normalizedHostOwnerId,
    remoteSessionFetchRef,
    remoteSessionAdoptedRef,
    supabase,
  ]);

  useEffect(() => {
    if (!gameId) return undefined;

    const unsubscribe = subscribeToBroadcastTopic(
      `rank_sessions:game:${gameId}`,
      change => {
        const eventType = change?.eventType || change?.event || '';
        if (eventType === 'DELETE') return;

        const record = change?.new || null;
        if (!record || typeof record !== 'object') return;

        const recordGameId = record.game_id ?? record.gameId ?? null;
        if (recordGameId && String(recordGameId).trim() !== String(gameId).trim()) return;

        const statusToken = record.status ? String(record.status).trim().toLowerCase() : 'active';
        if (statusToken && statusToken !== 'active') return;

        const ownerSource =
          record.owner_id ?? record.ownerId ?? record.ownerID ?? (record.owner && typeof record.owner === 'object' ? record.owner.id : null);
        const ownerToken = ownerSource !== null && ownerSource !== undefined ? String(ownerSource).trim() : '';
        if (normalizedHostOwnerId && ownerToken && ownerToken !== normalizedHostOwnerId) return;

        adoptRemoteSession(record);
      },
      { events: ['INSERT', 'UPDATE', 'DELETE'] }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [gameId, adoptRemoteSession, normalizedHostOwnerId]);

  return { adoptRemoteSession };
}
