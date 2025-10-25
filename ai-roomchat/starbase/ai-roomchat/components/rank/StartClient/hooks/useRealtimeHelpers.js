export function createFinalizeRealtimeTurn(deps) {
  const {
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
    participantsRef,
    deriveParticipantOwnerId,
    patchEngineState,
    statusMessageRef,
  } = deps;

  return reason => {
    if (!realtimeEnabled) return;
    const manager = realtimeManagerRef.current;
    if (!manager) return;
    const result = manager.completeTurn({
      turnNumber: turn,
      reason: reason || undefined,
      eligibleOwnerIds: deriveEligibleOwnerIds(participants),
    });
    if (!result) return;
    const numericTurn = Number.isFinite(Number(turn)) ? Math.floor(Number(turn)) : 0;
    recordTurnState({
      turnNumber: numericTurn,
      status: reason ? `completed:${reason}` : `completed`,
      deadline: 0,
      remainingSeconds: 0,
    });
    applyRealtimeSnapshot(result.snapshot);

    const warningReasonMap = new Map();
    const escalationReasonMap = new Map();

    if (Array.isArray(result.events) && result.events.length) {
      const warningLimitValue = Number.isFinite(Number(result.snapshot?.warningLimit))
        ? Number(result.snapshot.warningLimit)
        : undefined;
      const eventEntries = [];
      result.events.forEach(event => {
        if (!event) return;
        const ownerId = event.ownerId ? String(event.ownerId).trim() : '';
        if (!ownerId) return;
        const info = ownerDisplayMap.get(ownerId);
        const displayName = info?.displayName || `플레이어 ${ownerId.slice(0, 6)}`;
        const baseLimit = Number.isFinite(Number(event.limit)) ? Number(event.limit) : warningLimitValue;
        const reasonLabel = formatRealtimeReason(event.reason);
        const eventId = event.id || event.eventId || null;
        if (event.type === 'warning') {
          if (reasonLabel) {
            warningReasonMap.set(ownerId, reasonLabel);
          }
          const strikeText = Number.isFinite(Number(event.strike)) ? `${Number(event.strike)}회` : '1회';
          const remainingText =
            Number.isFinite(Number(event.remaining)) && Number(event.remaining) > 0
              ? ` (남은 기회 ${Number(event.remaining)}회)`
              : '';
          const reasonSuffix = reasonLabel ? ` – ${reasonLabel}` : '';
          eventEntries.push({
            role: 'system',
            content: `⚠️ ${displayName} 경고 ${strikeText}${remainingText}${reasonSuffix}`,
            public: true,
            visibility: 'public',
            extra: {
              eventType: 'warning',
              ownerId,
              strike: Number.isFinite(Number(event.strike)) ? Number(event.strike) : null,
              remaining:
                Number.isFinite(Number(event.remaining)) && Number(event.remaining) >= 0
                  ? Number(event.remaining)
                  : null,
              limit: Number.isFinite(baseLimit) ? Number(baseLimit) : null,
              reason: event.reason || null,
              turn: Number.isFinite(Number(event.turn)) ? Number(event.turn) : turn,
              timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now(),
              eventId,
              status: event.status || null,
            },
          });
        } else if (event.type === 'proxy_escalated') {
          if (reasonLabel) {
            escalationReasonMap.set(ownerId, reasonLabel);
          }
          const strikeText = Number.isFinite(Number(event.strike)) ? ` (경고 ${Number(event.strike)}회 누적)` : '';
          const reasonSuffix = reasonLabel ? ` – ${reasonLabel}` : '';
          eventEntries.push({
            role: 'system',
            content: `🚨 ${displayName} 대역 전환${strikeText}${reasonSuffix}`,
            public: true,
            visibility: 'public',
            extra: {
              eventType: 'proxy_escalated',
              ownerId,
              strike: Number.isFinite(Number(event.strike)) ? Number(event.strike) : null,
              limit: Number.isFinite(baseLimit) ? Number(baseLimit) : null,
              reason: event.reason || null,
              turn: Number.isFinite(Number(event.turn)) ? Number(event.turn) : turn,
              timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now(),
              status: 'proxy',
              eventId,
            },
          });
        }
      });
      if (eventEntries.length) {
        logTurnEntries({ entries: eventEntries, turnNumber: turn }).catch(error => {
          console.error('[StartClient] 경고/대역 이벤트 로그 실패:', error);
        });
      }
    }

    if (Array.isArray(result.warnings) && result.warnings.length) {
      const messages = result.warnings
        .map(({ ownerId, strike, remaining, reason }) => {
          if (!ownerId) return null;
          const normalized = String(ownerId).trim();
          if (!normalized) return null;
          const info = ownerDisplayMap.get(normalized);
          const displayName = info?.displayName || `플레이어 ${normalized.slice(0, 6)}`;
          const remainText = remaining > 0 ? ` (남은 기회 ${remaining}회)` : '';
          const reasonLabel = warningReasonMap.get(normalized) || formatRealtimeReason(reason);
          const reasonSuffix = reasonLabel ? ` – ${reasonLabel}` : '';
          return `${displayName} 경고 ${strike}회${remainText}${reasonSuffix}`;
        })
        .filter(Boolean);
      if (messages.length) {
        const notice = `경고: ${messages.join(', ')} - "다음" 버튼을 눌러 참여해 주세요.`;
        const prevMessage = statusMessageRef.current;
        const nextMessage = !prevMessage ? notice : prevMessage.includes(notice) ? prevMessage : `${prevMessage}\n${notice}`;
        patchEngineState({ statusMessage: nextMessage });
      }
    }

    if (Array.isArray(result.escalated) && result.escalated.length) {
      const escalatedSet = new Set(result.escalated.map(ownerId => (ownerId ? String(ownerId).trim() : '')).filter(Boolean));
      if (escalatedSet.size) {
        const updatedParticipants = participantsRef.current.map(participant => {
          const ownerId = deriveParticipantOwnerId(participant);
          if (!ownerId) return participant;
          const normalized = String(ownerId).trim();
          if (!escalatedSet.has(normalized)) return participant;
          const statusValue = String(participant?.status || '').toLowerCase();
          if (statusValue === 'proxy') return participant;
          return { ...participant, status: 'proxy' };
        });
        patchEngineState({ participants: updatedParticipants });
        const names = Array.from(escalatedSet).map(ownerId => {
          const info = ownerDisplayMap.get(ownerId);
          const displayName = info?.displayName || `플레이어 ${ownerId.slice(0, 6)}`;
          const reasonLabel = escalationReasonMap.get(ownerId);
          return reasonLabel ? `${displayName} (${reasonLabel})` : displayName;
        });
        const notice = `대역 전환: ${names.join(', ')} – 3회 이상 응답하지 않아 대역으로 교체되었습니다.`;
        const prevMessage = statusMessageRef.current;
        const nextMessage = !prevMessage ? notice : prevMessage.includes(notice) ? prevMessage : `${prevMessage}\n${notice}`;
        patchEngineState({ statusMessage: nextMessage });
      }
    }
  };
}

export function createRecordRealtimeParticipation(deps) {
  const { realtimeEnabled, realtimeManagerRef, applyRealtimeSnapshot, turn } = deps;
  return (ownerId, type) => {
    if (!realtimeEnabled) return;
    if (!ownerId) return;
    const manager = realtimeManagerRef.current;
    if (!manager) return;
    const snapshot = manager.recordParticipation(ownerId, turn, { type });
    applyRealtimeSnapshot(snapshot);
  };
}
