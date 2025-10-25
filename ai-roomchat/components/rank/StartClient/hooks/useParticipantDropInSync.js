import { useEffect } from 'react';

// Extracted participant / drop-in sync logic from useStartClientEngine.
// This hook performs the same behavior as the original in-file effect and
// intentionally mirrors side-effects (queue sync, drop-in bonus application,
// timeline event generation, and slot release updates).
export default function useParticipantDropInSync({
  participants,
  preflight,
  participantIdSetRef,
  dropInQueueRef,
  setDropInSnapshot,
  processedDropInReleasesRef,
  asyncSessionManagerRef,
  turnTimerServiceRef,
  turnDeadlineRef,
  turnDeadline,
  timeRemainingRef,
  setTurnDeadline,
  setTimeRemaining,
  turn,
  realtimeEnabled,
  recordTimelineEvents,
  recordTurnState,
  setLastDropInTurn,
  setGameMatchSessionMeta,
  withTable,
  supabase,
  buildDropInExtensionTimelineEvent,
  buildDropInMetaPayload,
  gameId,
}) {
  useEffect(() => {
    if (preflight) {
      participantIdSetRef.current = new Set(
        participants.map((participant, index) => String(participant?.id ?? participant?.hero_id ?? index))
      );
      const resetSnapshot = dropInQueueRef.current?.reset?.();
      if (resetSnapshot && typeof resetSnapshot === 'object') {
        setDropInSnapshot(resetSnapshot);
      } else {
        setDropInSnapshot(null);
      }
      processedDropInReleasesRef.current.clear();
      asyncSessionManagerRef.current?.reset();
      return;
    }

    participantIdSetRef.current = new Set(
      participants.map((participant, index) => String(participant?.id ?? participant?.hero_id ?? index))
    );

    const queueService = dropInQueueRef.current;
    if (!queueService) return;

    const queueResult = queueService.syncParticipants(participants, {
      turnNumber: turn,
      mode: realtimeEnabled ? 'realtime' : 'async',
    });
    if (queueResult && typeof queueResult === 'object') {
      setDropInSnapshot(queueResult.snapshot || null);
    }

    const arrivals = Array.isArray(queueResult?.arrivals) ? queueResult.arrivals : [];

    let dropInRoomId = '';

    let timelineEvents = [];

    if (arrivals.length > 0) {
      const dropInTarget = startMatchMetaRef?.current?.dropInTarget || null;
      const dropInRoomIdRaw =
        dropInTarget?.roomId ?? dropInTarget?.room_id ?? dropInTarget?.roomID ?? null;
      dropInRoomId = dropInRoomIdRaw ? String(dropInRoomIdRaw).trim() : '';

      const service = turnTimerServiceRef.current;
      if (service) {
        const now = Date.now();
        const deadlineRefValue =
          typeof turnDeadlineRef?.current === 'number' && turnDeadlineRef.current > 0
            ? turnDeadlineRef.current
            : typeof turnDeadline === 'number'
            ? turnDeadline
            : 0;
        const hasActiveDeadline = deadlineRefValue && deadlineRefValue > now;
        const numericTurn = Number.isFinite(Number(turn)) ? Math.floor(Number(turn)) : 0;
        const extraSeconds = service.registerDropInBonus({
          immediate: hasActiveDeadline,
          turnNumber: turn,
        });

        const dropInMeta = buildDropInMetaPayload({
          arrivals,
          status: hasActiveDeadline ? 'bonus-applied' : 'bonus-queued',
          bonusSeconds: extraSeconds,
          appliedAt: now,
          turnNumber: numericTurn,
          mode: realtimeEnabled ? 'realtime' : 'async',
          queueResult,
          roomId: dropInRoomId,
        });

        if (extraSeconds > 0) {
          if (hasActiveDeadline) {
            const baseDeadline = deadlineRefValue || now;
            const newDeadline = baseDeadline + extraSeconds * 1000;
            const previousRemaining =
              typeof timeRemainingRef.current === 'number' && timeRemainingRef.current > 0
                ? timeRemainingRef.current
                : 0;
            const updatedRemaining = previousRemaining + extraSeconds;

            setTurnDeadline(prev => (prev ? prev + extraSeconds * 1000 : newDeadline));
            setTimeRemaining(prev => (typeof prev === 'number' ? prev + extraSeconds : updatedRemaining));
            recordTurnState(
              {
                turnNumber: numericTurn,
                deadline: newDeadline,
                remainingSeconds: updatedRemaining,
                dropInBonusSeconds: extraSeconds,
                dropInBonusAppliedAt: now,
                dropInBonusTurn: numericTurn,
                status: 'bonus-applied',
              },
              {
                metaPatch: dropInMeta ? { dropIn: dropInMeta } : null,
              }
            );
          } else {
            recordTurnState(
              {
                turnNumber: numericTurn,
                dropInBonusSeconds: extraSeconds,
                dropInBonusAppliedAt: now,
                dropInBonusTurn: numericTurn,
                status: 'bonus-queued',
                deadline: 0,
                remainingSeconds: 0,
              },
              {
                metaPatch: dropInMeta ? { dropIn: dropInMeta } : null,
              }
            );
          }

          const extensionEvent = buildDropInExtensionTimelineEvent({
            extraSeconds,
            appliedAt: now,
            hasActiveDeadline,
            dropInMeta,
            arrivals,
            mode: realtimeEnabled ? 'realtime' : 'async',
            turnNumber: numericTurn,
          });
          if (extensionEvent) {
            timelineEvents.push(extensionEvent);
          }
        } else if (dropInMeta) {
          setGameMatchSessionMeta(gameId, { dropIn: dropInMeta });
        }
      }

      setLastDropInTurn(Number.isFinite(Number(turn)) ? Number(turn) : 0);
    }

    if (realtimeEnabled) {
      if (arrivals.length) {
        timelineEvents = timelineEvents.concat(
          arrivals.map(arrival => {
            const status = normalizeTimelineStatus(arrival.status) || 'active';
            const cause = arrival.replaced ? 'realtime_drop_in' : 'realtime_joined';
            return {
              type: 'drop_in_joined',
              ownerId: arrival.ownerId ? String(arrival.ownerId).trim() : null,
              status,
              turn: Number.isFinite(Number(arrival.turn))
                ? Number(arrival.turn)
                : Number.isFinite(Number(turn))
                ? Number(turn)
                : null,
              timestamp: arrival.timestamp,
              reason: cause,
              context: {
                role: arrival.role || null,
                heroName: arrival.heroName || null,
                participantId: arrival.participantId ?? null,
                slotIndex: arrival.slotIndex ?? null,
                mode: 'realtime',
                substitution: {
                  cause,
                  replacedOwnerId: arrival.replaced?.ownerId || null,
                  replacedHeroName: arrival.replaced?.heroName || null,
                  replacedParticipantId: arrival.replaced?.participantId || null,
                  queueDepth: arrival.stats?.queueDepth ?? arrival.stats?.replacements ?? 0,
                  arrivalOrder: arrival.stats?.arrivalOrder ?? null,
                  totalReplacements: arrival.stats?.replacements ?? 0,
                  lastDepartureCause: arrival.stats?.lastDepartureCause || null,
                },
              },
              metadata: queueResult?.matching ? { matching: queueResult.matching } : null,
            };
          })
        );
      }
    } else if (asyncSessionManagerRef.current) {
      const { events } = asyncSessionManagerRef.current.processQueueResult(queueResult, {
        mode: 'async',
      });
      if (Array.isArray(events) && events.length) {
        timelineEvents = timelineEvents.concat(
          events.map(event => ({
            ...event,
            metadata: event.metadata || (queueResult?.matching ? { matching: queueResult.matching } : null),
          }))
        );
      }
    }

    if (arrivals.length && dropInRoomId) {
      const releaseTargets = [];
      arrivals.forEach(arrival => {
        const replaced = arrival?.replaced || null;
        if (!replaced) return;
        const ownerCandidate =
          replaced?.ownerId ?? replaced?.ownerID ?? replaced?.owner_id ?? (typeof replaced?.owner === 'object' ? replaced.owner?.id : null);
        if (!ownerCandidate) return;
        const ownerId = String(ownerCandidate).trim();
        if (!ownerId) return;
        const key = `${dropInRoomId}::${ownerId}`;
        if (processedDropInReleasesRef.current.has(key)) return;
        releaseTargets.push({ roomId: dropInRoomId, ownerId, key });
      });

      if (releaseTargets.length) {
        const tasks = releaseTargets.map(({ roomId, ownerId, key }) =>
          withTable(supabase, 'rank_room_slots', table =>
            supabase
              .from(table)
              .update({
                occupant_owner_id: null,
                occupant_hero_id: null,
                occupant_ready: false,
                joined_at: null,
              })
              .eq('room_id', roomId)
              .eq('occupant_owner_id', ownerId)
          ).then(result => {
            if (result?.error && result.error.code !== 'PGRST116') {
              throw result.error;
            }
            processedDropInReleasesRef.current.add(key);
          })
        );

        Promise.all(tasks).catch(error => {
          console.warn('[StartClient] Failed to release drop-in slot:', error);
          releaseTargets.forEach(({ key }) => processedDropInReleasesRef.current.delete(key));
        });
      }
    }

    if (timelineEvents.length) {
      recordTimelineEvents(timelineEvents, { turnNumber: turn });
    }
  }, [
    participants,
    preflight,
    gameId,
    turnDeadline,
    turn,
    recordTimelineEvents,
    realtimeEnabled,
    recordTurnState,
    setLastDropInTurn,
    setTimeRemaining,
    setTurnDeadline,
  ]);
}
