// Thin client for Rank main-game API endpoints used by StartClient.
// This module centralizes token retrieval and fetch calls so that
// useStartClientEngine can stay focused on orchestration/state.

export async function getViewerAccessToken(supabase, options = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  const token = sessionData?.session?.access_token;
  if (!token) {
    const defaultMessage =
      typeof options.missingTokenMessage === 'string' && options.missingTokenMessage.trim()
        ? options.missingTokenMessage.trim()
        : '세션 토큰을 확인할 수 없습니다.';
    throw new Error(defaultMessage);
  }

  return token;
}

export async function startRankSession({
  supabase,
  gameId,
  mode,
  role,
  sessionPolicy,
}) {
  if (!gameId) {
    throw new Error('게임 정보를 찾을 수 없습니다.');
  }

  const token = await getViewerAccessToken(supabase, {
    missingTokenMessage: '세션 정보가 만료되었습니다. 다시 로그인해 주세요.',
  });

  const response = await fetch('/api/rank/start-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      game_id: gameId,
      mode: mode || 'manual',
      role: role || null,
      match_code: null,
      session_policy: sessionPolicy,
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.detail ||
      '전투 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    throw new Error(message);
  }

  if (!payload?.ok) {
    const message =
      payload?.error || '전투 세션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    throw new Error(message);
  }

  const sessionPayload = payload?.session || null;
  if (!sessionPayload?.id) {
    throw new Error('세션 정보를 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  return { session: sessionPayload, raw: payload };
}

export async function logRankTurnEntries({
  supabase,
  sessionId,
  gameId,
  entries,
  turnNumber,
}) {
  if (!sessionId || !gameId) return;
  if (!Array.isArray(entries) || entries.length === 0) return;

  const token = await getViewerAccessToken(supabase, {
    missingTokenMessage: '세션 토큰을 확인할 수 없습니다.',
  });

  const payload = {
    session_id: sessionId,
    game_id: gameId,
    entries,
  };
  const numericTurn = Number(turnNumber);
  if (Number.isFinite(numericTurn) && numericTurn > 0) {
    payload.turn_number = numericTurn;
  }

  const response = await fetch('/api/rank/log-turn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = null;
    try {
      detail = await response.json();
    } catch {
      detail = null;
    }
    const message = detail?.error || '턴 기록에 실패했습니다.';
    throw new Error(message);
  }
}

export async function completeRankSession({
  supabase,
  sessionId,
  gameId,
  turnNumber,
  reason,
  outcome,
  finalResponse,
}) {
  if (!sessionId || !gameId) return;

  const token = await getViewerAccessToken(supabase, {
    missingTokenMessage: '세션 토큰을 확인하지 못했습니다.',
  });

  const payload = {
    sessionId,
    gameId,
    turnNumber,
    reason: reason || 'roles_resolved',
    outcome: outcome || {},
    finalResponse: finalResponse || '',
  };

  const response = await fetch('/api/rank/complete-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || '세션 결과 정산 요청에 실패했습니다.');
  }
}

export async function runRankTurn({ supabase, body }) {
  const token = await getViewerAccessToken(supabase, {
    missingTokenMessage: '세션 토큰을 확인할 수 없습니다.',
  });

  const response = await fetch('/api/rank/run-turn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || payload?.error) {
    const message =
      payload?.error ||
      payload?.detail ||
      'AI 호출에 실패했습니다.';
    const error = new Error(message);
    if (payload?.error) {
      error.code = payload.error;
    }
    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      error.detail = payload.detail.trim();
    }
    throw error;
  }

  return payload;
}
