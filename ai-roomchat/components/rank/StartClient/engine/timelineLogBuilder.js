import { formatOwnerDisplayName } from './participants';

export function formatRealtimeReason(reason) {
  if (!reason) return '';
  const normalized = String(reason).trim().toLowerCase();
  switch (normalized) {
    case 'timeout':
      return '시간 초과';
    case 'consensus':
      return '합의 미응답';
    case 'manual':
      return '수동 진행 미완료';
    case 'ai':
      return '자동 진행';
    case 'inactivity':
      return '응답 없음';
    default:
      return '';
  }
}

export function formatApiKeyPoolSource(source) {
  const normalized = typeof source === 'string' ? source.trim().toLowerCase() : '';
  switch (normalized) {
    case 'user_input':
      return '사용자 입력';
    case 'auto_rotation':
      return '자동 교체';
    case 'pool_rotation':
      return '키 풀 교체';
    case 'cleared':
      return 'API 키 제거';
    case 'match_ready_client':
      return '매치 준비';
    case 'auto_match_progress':
      return '자동 매칭';
    default:
      return normalized ? normalized : 'API 키 교체';
  }
}

export function buildTimelineLogEntry(
  event,
  { ownerDisplayMap, defaultTurn = null, defaultMode = 'realtime' } = {}
) {
  if (!event || typeof event !== 'object') return null;
  const type = typeof event.type === 'string' ? event.type.trim() : '';
  if (!type) return null;

  const ownerId = event.ownerId ? String(event.ownerId).trim() : '';
  const turnNumber = Number.isFinite(Number(event.turn))
    ? Number(event.turn)
    : Number.isFinite(Number(defaultTurn))
      ? Number(defaultTurn)
      : null;
  const timestamp = Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now();
  const context = event.context && typeof event.context === 'object' ? event.context : {};
  const mode = typeof context.mode === 'string' ? context.mode : defaultMode;

  const ownerInfo = ownerId && ownerDisplayMap ? ownerDisplayMap.get(ownerId) : null;
  const actorLabel =
    typeof context.actorLabel === 'string' && context.actorLabel.trim()
      ? context.actorLabel.trim()
      : null;
  const ownerLabel =
    actorLabel ||
    ownerInfo?.displayName ||
    (ownerId ? `플레이어 ${ownerId.slice(0, 6)}` : '시스템');

  let content = '';
  if (type === 'drop_in_joined') {
    const roleName = typeof context.role === 'string' ? context.role.trim() : '';
    const heroName = typeof context.heroName === 'string' ? context.heroName.trim() : '';
    const detailParts = [roleName, heroName].filter(Boolean);
    const detail = detailParts.length ? ` (${detailParts.join(' · ')})` : '';
    content =
      mode === 'async'
        ? `🤖 대역 교체: ${ownerLabel}${detail}`
        : `✨ 난입 합류: ${ownerLabel}${detail}`;
  } else if (type === 'turn_timeout') {
    content =
      mode === 'async'
        ? '⏰ 제한시간 만료 – 대역이 턴을 마무리합니다.'
        : '⏰ 제한시간 만료 – 턴을 자동으로 종료합니다.';
  } else if (type === 'consensus_reached') {
    const count = Number(context.consensusCount);
    const threshold = Number(context.threshold);
    if (Number.isFinite(count) && Number.isFinite(threshold) && threshold > 0) {
      content = `✅ ${count}/${threshold} 동의로 턴을 종료합니다.`;
    } else {
      content = '✅ 동의가 충족되어 턴을 종료합니다.';
    }
  } else if (type === 'api_key_pool_replaced') {
    const poolMeta = event.metadata?.apiKeyPool || {};
    const sourceLabel = formatApiKeyPoolSource(poolMeta.source);
    const providerLabel = poolMeta.provider ? ` (${poolMeta.provider})` : '';
    const newLabel = poolMeta.newSample ? `새 키 ${poolMeta.newSample}` : 'API 키 업데이트';
    const replacedLabel = poolMeta.replacedSample ? ` → 교체: ${poolMeta.replacedSample}` : '';
    content = `🔑 ${sourceLabel}${providerLabel} ${newLabel}${replacedLabel}`;
  } else if (type === 'drop_in_matching_context') {
    const matching = event.metadata?.matching || {};
    const label = matching.matchType === 'drop_in' ? '난입 매칭' : '매칭';
    const details = [];
    if (matching.matchCode) {
      details.push(`코드 ${matching.matchCode}`);
    }
    if (matching.dropInTarget?.role) {
      details.push(`${matching.dropInTarget.role} 슬롯`);
    }
    if (matching.dropInTarget?.roomCode) {
      details.push(`룸 ${matching.dropInTarget.roomCode}`);
    }
    const scoreGap = Number(matching.dropInTarget?.scoreDifference);
    if (Number.isFinite(scoreGap) && scoreGap !== 0) {
      details.push(`점수차 ±${Math.abs(Math.round(scoreGap))}`);
    }
    const queueSize = Number(matching.dropInMeta?.queueSize);
    if (Number.isFinite(queueSize) && queueSize >= 0) {
      details.push(`큐 대기 ${queueSize}명`);
    }
    const roomsConsidered = Number(matching.dropInMeta?.roomsConsidered);
    if (Number.isFinite(roomsConsidered) && roomsConsidered > 0) {
      details.push(`검토 룸 ${roomsConsidered}개`);
    }
    content = `🎯 ${label} 정보: ${details.length ? details.join(', ') : '백엔드 매칭 요약이 동기화되었습니다.'}`;
  } else {
    content = `ℹ️ ${ownerLabel} 이벤트: ${type}`;
  }

  const strike = Number.isFinite(Number(event.strike)) ? Number(event.strike) : null;
  const remaining = Number.isFinite(Number(event.remaining)) ? Number(event.remaining) : null;
  const limit = Number.isFinite(Number(event.limit)) ? Number(event.limit) : null;

  const extra = {
    eventType: type,
    ownerId: ownerId || null,
    strike,
    remaining,
    limit,
    reason: event.reason || null,
    turn: turnNumber,
    timestamp,
    status: event.status || null,
    context: context && Object.keys(context).length ? context : null,
  };

  if (event.metadata && typeof event.metadata === 'object') {
    extra.metadata = event.metadata;
  }

  return {
    role: 'system',
    content,
    public: true,
    visibility: 'public',
    extra,
  };
}
