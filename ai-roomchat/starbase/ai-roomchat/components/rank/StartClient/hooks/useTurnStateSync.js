import { useCallback } from 'react';

export function useTurnStateSync({
  sessionInfo,
  gameId,
  lastRealtimeTurnEventRef,
  turnEventBackfillAbortRef,
  lastBroadcastTurnStateRef,
  setGameMatchSessionMeta,
  setTurnCallbackRef,
  setTurnDeadlineCallbackRef,
  setTimeRemainingCallbackRef,
  setLastDropInTurnCallbackRef,
  fetchTurnStateEvents,
}) {
  const applyTurnStateChange = useCallback(
    (change, { commitTimestamp } = {}) => {
      if (!change || typeof change !== 'object') {
        return;
      }

      const sessionId = sessionInfo?.id;
      if (!sessionId) {
        return;
      }

      const targetSessionId = change.session_id || change.sessionId || sessionId;
      if (!targetSessionId || targetSessionId !== sessionId) {
        return;
      }

      const state = change.state || change.turn_state || null;
      if (!state || typeof state !== 'object') {
        return;
      }

      const eventId = (() => {
        if (change.id !== undefined && change.id !== null) {
          return String(change.id);
        }
        const turnValue = Number(state.turnNumber);
        const normalizedTurn =
          Number.isFinite(turnValue) && turnValue >= 0 ? Math.floor(turnValue) : 0;
        const emittedToken =
          change.emitted_at || change.emittedAt || commitTimestamp || state.updatedAt || Date.now();
        return `${sessionId}:${normalizedTurn}:${emittedToken}`;
      })();

      const emittedAtValue = (() => {
        const candidates = [change.emitted_at, change.emittedAt, commitTimestamp, state.updatedAt];
        for (const candidate of candidates) {
          if (candidate === null || candidate === undefined || candidate === '') continue;
          const numeric = Number(candidate);
          if (Number.isFinite(numeric) && numeric > 0) {
            return Math.floor(numeric);
          }
          const timestamp = new Date(candidate).getTime();
          if (!Number.isNaN(timestamp)) return timestamp;
        }
        return Date.now();
      })();

      const lastEvent = lastRealtimeTurnEventRef.current;
      if (lastEvent?.id === eventId) {
        return;
      }
      if (
        lastEvent &&
        lastEvent.emittedAt &&
        emittedAtValue &&
        emittedAtValue <= lastEvent.emittedAt &&
        Number.isFinite(Number(state.turnNumber)) &&
        lastEvent.turnNumber >= Math.floor(Number(state.turnNumber))
      ) {
        return;
      }

      lastRealtimeTurnEventRef.current = {
        id: eventId,
        emittedAt: emittedAtValue,
        turnNumber: Number.isFinite(Number(state.turnNumber))
          ? Math.floor(Number(state.turnNumber))
          : 0,
      };

      if (gameId) {
        setGameMatchSessionMeta(gameId, {
          turnState: {
            ...state,
            source: state.source || change.source || 'realtime',
            updatedAt: emittedAtValue,
          },
          extras: change.extras || undefined,
          source: 'realtime/turn-state',
        });
      }

      const numericTurn = Number.isFinite(Number(state.turnNumber))
        ? Math.max(0, Math.floor(Number(state.turnNumber)))
        : null;
      if (numericTurn !== null) {
        setTurnCallbackRef.current?.(numericTurn);
      }

      const resolvedDeadline = Number(state.deadline);
      const deadlineMillis =
        Number.isFinite(resolvedDeadline) && resolvedDeadline > 0
          ? Math.floor(resolvedDeadline)
          : 0;
      if (deadlineMillis) {
        setTurnDeadlineCallbackRef.current?.(deadlineMillis);
      } else {
        setTurnDeadlineCallbackRef.current?.(null);
      }

      const remainingFromState = Number(state.remainingSeconds);
      let resolvedRemaining =
        Number.isFinite(remainingFromState) && remainingFromState >= 0
          ? Math.floor(remainingFromState)
          : null;
      if (deadlineMillis) {
        const derived = Math.floor((deadlineMillis - Date.now()) / 1000);
        if (!Number.isFinite(resolvedRemaining) || resolvedRemaining < 0) {
          resolvedRemaining = derived;
        }
      }
      if (Number.isFinite(resolvedRemaining)) {
        setTimeRemainingCallbackRef.current?.(Math.max(0, resolvedRemaining));
      } else {
        setTimeRemainingCallbackRef.current?.(null);
      }

      const dropInTurn = Number(state.dropInBonusTurn);
      if (Number.isFinite(dropInTurn) && dropInTurn > 0) {
        setLastDropInTurnCallbackRef.current?.(Math.floor(dropInTurn));
      }

      lastBroadcastTurnStateRef.current = {
        turnNumber: numericTurn || 0,
        deadline: deadlineMillis,
      };
    },
    [
      sessionInfo?.id,
      gameId,
      setGameMatchSessionMeta,
      setTurnCallbackRef,
      setTurnDeadlineCallbackRef,
      setTimeRemainingCallbackRef,
      setLastDropInTurnCallbackRef,
      lastRealtimeTurnEventRef,
      lastBroadcastTurnStateRef,
    ]
  );

  const backfillTurnEvents = useCallback(async () => {
    if (!sessionInfo?.id) {
      return;
    }
    const controller = new AbortController();
    if (turnEventBackfillAbortRef.current) {
      turnEventBackfillAbortRef.current.abort();
    }
    turnEventBackfillAbortRef.current = controller;
    try {
      const lastEvent = lastRealtimeTurnEventRef.current;
      const since = lastEvent?.emittedAt ? Number(lastEvent.emittedAt) : null;
      const events = await fetchTurnStateEvents({
        sessionId: sessionInfo.id,
        since,
        limit: 50,
        signal: controller.signal,
      });
      events.forEach(event => {
        if (!event || typeof event !== 'object') return;
        applyTurnStateChange(event, {
          commitTimestamp: event.emitted_at || event.emittedAt || null,
        });
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('[StartClient] 턴 이벤트 백필 실패:', error);
      }
    } finally {
      if (turnEventBackfillAbortRef.current === controller) {
        turnEventBackfillAbortRef.current = null;
      }
    }
  }, [sessionInfo?.id, applyTurnStateChange, fetchTurnStateEvents, turnEventBackfillAbortRef, lastRealtimeTurnEventRef]);

  return { applyTurnStateChange, backfillTurnEvents };
}
