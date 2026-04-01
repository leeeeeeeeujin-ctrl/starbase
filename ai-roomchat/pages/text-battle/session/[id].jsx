"use client";

import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getCurrentTurn,
  buildTurnPromptContext,
  resolveTurnActorId,
  rehydrateBattleSession,
} from '@/lib/battle/session';
import { buildRuntimePromptFromTurn } from '@/lib/battle/agentRuntime';
import {
  readStoredTextBattleSession,
  writeStoredTextBattleSession,
} from '@/lib/battle/clientSessionStorage';
import {
  clearActiveSessionRecord,
  readActiveSession,
  updateActiveSessionRecord,
} from '@/lib/rank/activeSessionStorage';

function buildStatusTone(status = '') {
  if (status === 'completed') {
    return {
      bg: 'rgba(20, 83, 45, 0.78)',
      border: 'rgba(74, 222, 128, 0.35)',
      text: '#dcfce7',
    };
  }
  return {
    bg: 'rgba(15, 23, 42, 0.78)',
    border: 'rgba(59, 130, 246, 0.3)',
    text: '#dbeafe',
  };
}

function shortText(value, limit = 90) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

function getBattleRunErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (
    message.includes('invalid api key') ||
    message.includes('api key') ||
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return 'API 키를 확인해주세요. 캐릭터 AI 페이지에서 교체할 수 있습니다.';
  }
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('connection')
  ) {
    return '연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
  }
  if (
    message.includes('json') ||
    message.includes('format') ||
    message.includes('schema') ||
    message.includes('parse')
  ) {
    return '응답 형식이 맞지 않습니다. 다시 시도해주세요.';
  }
  return String(error?.message || '턴을 진행하지 못했습니다.');
}

function hydrateRuntimeSession(value) {
  if (!value || typeof value !== 'object') return null;
  return rehydrateBattleSession(value);
}

export default function TextBattleSessionPage() {
  const router = useRouter();
  const { id } = router.query || {};
  const logRef = useRef(null);
  const [state, setState] = useState({
    loading: true,
    error: null,
    payload: null,
  });
  const [runtimeState, setRuntimeState] = useState({
    session: null,
    input: '',
    running: false,
    status: '',
    error: '',
    showDebug: false,
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));
    fetch(`/api/text-battle/session?id=${encodeURIComponent(id)}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (!json?.ok) {
          setState({
            loading: false,
            error: json?.error || 'failed_to_load',
            payload: null,
          });
          return;
        }
        const storedSession = hydrateRuntimeSession(readStoredTextBattleSession(id));
        const remoteSession = hydrateRuntimeSession(json?.runtimeSession);
        setState({
          loading: false,
          error: null,
          payload: json,
        });
        setRuntimeState(prev => ({
          ...prev,
          session: remoteSession || prev.session,
        }));
      })
      .catch(err => {
        if (cancelled) return;
        const storedSession = hydrateRuntimeSession(readStoredTextBattleSession(id));
        setState({
          loading: false,
          error: err?.message || String(err),
          payload: null,
        });
        if (storedSession) {
          setRuntimeState(prev => ({
            ...prev,
            session: prev.session || storedSession,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.payload?.turns?.length, runtimeState.status]);

  const payload = state.payload || {};
  const dbSession = payload.session || null;
  const runtimeSession = runtimeState.session || null;
  const currentTurn = runtimeSession ? getCurrentTurn(runtimeSession) : null;
  const resolvedActorId =
    runtimeSession && currentTurn
      ? resolveTurnActorId(runtimeSession, currentTurn, runtimeSession.actorId)
      : '';
  const livePromptContext =
    runtimeSession && currentTurn
      ? buildTurnPromptContext(runtimeSession, currentTurn, resolvedActorId)
      : null;
  const liveRuntime =
    runtimeSession && currentTurn
      ? buildRuntimePromptFromTurn(runtimeSession, currentTurn, resolvedActorId)
      : { agentContexts: [], runtimePrompt: '' };
  const turns = Array.isArray(payload.turns) ? payload.turns : [];
  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  const agentContexts = Array.isArray(payload.agentContexts) ? payload.agentContexts : [];
  const currentActor = useMemo(
    () => participants.find(participant => participant.id === resolvedActorId) || null,
    [participants, resolvedActorId]
  );
  const statusTone = buildStatusTone(runtimeSession?.status || dbSession?.status || '');
  const lastTurn = turns.length ? turns[turns.length - 1] : null;
  const sessionStatus = runtimeSession?.status || dbSession?.status || '';
  const isEnded = ['completed', 'abandoned', 'defeated', 'closed', 'ended', 'cancelled', 'canceled'].includes(
    String(sessionStatus || '').toLowerCase()
  );

  useEffect(() => {
    if (!id) return;
    const active = readActiveSession();
    if (!active) return;
    if (active.sessionId && String(active.sessionId) !== String(id)) return;
    if (isEnded) {
      clearActiveSessionRecord(active.gameId || undefined);
      return;
    }
    if (active.gameId) {
      updateActiveSessionRecord(active.gameId, {
        href: `/text-battle/session/${encodeURIComponent(String(id))}`,
        status: 'active',
        turn: Number.isFinite(Number(runtimeSession?.turnIndex)) ? Number(runtimeSession.turnIndex) + 1 : active.turn || 1,
        actorNames: Array.isArray(participants) ? participants.map(participant => participant?.name).filter(Boolean) : active.actorNames || [],
      });
    }
  }, [id, isEnded, participants, runtimeSession?.turnIndex]);

  async function refreshPayload() {
    const response = await fetch(`/api/text-battle/session?id=${encodeURIComponent(id)}`);
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      throw new Error(json?.detail || json?.error || 'failed_to_refresh');
    }
    setState({
      loading: false,
      error: null,
      payload: json,
    });
  }

  async function handleRunTurn() {
    if (!id || !runtimeSession || !currentTurn || runtimeState.running) return;
    setRuntimeState(prev => ({
      ...prev,
      running: true,
      status:
        (currentTurn?.input?.mode || 'none') === 'none'
          ? 'AI가 행동을 생성하는 중입니다…'
          : '행동을 처리하는 중입니다…',
      error: '',
    }));

    try {
      const {
        data: { session: authSession },
        error: authError,
      } = await supabase.auth.getSession();
      if (authError || !authSession?.access_token) {
        throw new Error('로그인 세션을 확인하지 못했습니다.');
      }

      const inputValue = runtimeState.input.trim();
      let resultText = '';

      if ((currentTurn?.input?.mode || 'none') === 'none') {
        const aiResponse = await fetch('/api/chat/ai-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({
            prompt: liveRuntime.runtimePrompt,
          }),
        });
        const aiJson = await aiResponse.json().catch(() => null);
        if (!aiResponse.ok || !aiJson?.ok) {
          throw new Error(aiJson?.detail || aiJson?.error || 'ai_proxy_failed');
        }
        resultText = typeof aiJson?.text === 'string' ? aiJson.text : '';
      } else {
        resultText = inputValue;
      }

      const response = await fetch('/api/text-battle/run-turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          textSessionId: id,
          actorId: resolvedActorId,
          session: runtimeSession,
          input: inputValue || null,
          result: resultText,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.detail || json?.error || 'run_turn_failed');
      }

      writeStoredTextBattleSession(id, json.session);
      setRuntimeState(prev => ({
        ...prev,
        session: hydrateRuntimeSession(json.session),
        input: '',
        running: false,
        status:
          json.session?.status === 'completed'
            ? '전투가 종료되었습니다.'
            : '다음 장면으로 진행했습니다.',
        error: '',
      }));
      if (json.session?.status === 'completed') {
        clearActiveSessionRecord();
        router.replace(`/battle-log/${encodeURIComponent(String(id))}?source=text-battle`);
        return;
      }
      await refreshPayload();
    } catch (error) {
      setRuntimeState(prev => ({
        ...prev,
        running: false,
        error: getBattleRunErrorMessage(error),
        status: '',
      }));
    }
  }

  async function handleSurrender() {
    if (!id || runtimeState.running || isEnded) return;
    setRuntimeState(prev => ({
      ...prev,
      running: true,
      status: '항복 처리 중입니다…',
      error: '',
    }));
    try {
      const {
        data: { session: authSession },
        error: authError,
      } = await supabase.auth.getSession();
      if (authError || !authSession?.access_token) {
        throw new Error('로그인 세션을 확인하지 못했습니다.');
      }
      const response = await fetch('/api/text-battle/finish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          textSessionId: id,
          action: 'surrender',
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.detail || json?.error || 'finish_failed');
      }
      writeStoredTextBattleSession(id, json.session);
      clearActiveSessionRecord();
      setRuntimeState(prev => ({
        ...prev,
        session: hydrateRuntimeSession(json.session),
        running: false,
        status: '항복으로 전투가 종료되었습니다.',
        error: '',
      }));
      router.replace(`/battle-log/${encodeURIComponent(String(id))}?source=text-battle`);
    } catch (error) {
      setRuntimeState(prev => ({
        ...prev,
        running: false,
        error: getBattleRunErrorMessage(error),
        status: '',
      }));
    }
  }

  if (!id) {
    return <div style={{ padding: 20 }}>세션 ID가 지정되지 않았습니다.</div>;
  }

  if (state.loading) {
    return <div style={{ padding: 20 }}>텍스트 배틀을 불러오는 중입니다…</div>;
  }

  if (state.error) {
    return (
      <div style={{ padding: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>텍스트 배틀</h1>
        <p style={{ color: '#ef4444', fontSize: 14 }}>에러가 발생했습니다: {state.error}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(30,64,175,0.18), transparent 30%), linear-gradient(180deg, #020617 0%, #0f172a 100%)',
        color: '#e2e8f0',
        padding: '16px 14px 40px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        <header
          style={{
            borderRadius: 24,
            padding: '18px 18px 16px',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,41,59,0.9) 100%)',
            border: '1px solid rgba(59,130,246,0.35)',
            boxShadow: '0 24px 60px -40px rgba(15,23,42,0.95)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>텍스트 배틀</h1>
              <p style={{ margin: 0, fontSize: 12, color: '#93c5fd' }}>세션 ID: {id}</p>
            </div>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: statusTone.bg,
                border: `1px solid ${statusTone.border}`,
                color: statusTone.text,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {runtimeSession?.status || dbSession?.status || 'active'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#cbd5e1' }}>
              현재 턴: <strong style={{ color: '#f8fafc' }}>{currentTurn?.title || currentTurn?.id || '없음'}</strong>
            </span>
            {currentActor ? (
              <span style={{ fontSize: 12, color: '#cbd5e1' }}>
                행동 주체: <strong style={{ color: '#fbbf24' }}>{currentActor.name}</strong>
              </span>
            ) : null}
            <span style={{ fontSize: 12, color: '#cbd5e1' }}>
              턴 수: <strong style={{ color: '#f8fafc' }}>{turns.length}</strong>
            </span>
          </div>
        </header>

        <section
          style={{
            borderRadius: 24,
            padding: 18,
            background: 'rgba(2,6,23,0.86)',
            border: '1px solid rgba(59,130,246,0.18)',
            display: 'grid',
            gap: 14,
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7dd3fc', textTransform: 'uppercase' }}>
              Current Turn
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f8fafc' }}>
              {currentTurn?.title || '턴이 없습니다'}
            </h2>
          </div>

          <div
            style={{
              borderRadius: 18,
              padding: '14px 16px',
              background: 'rgba(15,23,42,0.88)',
              border: '1px solid rgba(71,85,105,0.45)',
              whiteSpace: 'pre-wrap',
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            {currentTurn?.display || '현재 표시할 장면이 없습니다.'}
          </div>

          {(currentTurn?.input?.mode || 'none') !== 'none' ? (
            <div
              style={{
                display: 'grid',
                gap: 10,
                borderRadius: 18,
                padding: 14,
                background: 'rgba(15,23,42,0.7)',
                border: '1px solid rgba(56,189,248,0.22)',
              }}
            >
              <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                {currentTurn?.input?.label || '행동 입력'}
              </div>
              <textarea
                value={runtimeState.input}
                onChange={event => setRuntimeState(prev => ({ ...prev, input: event.target.value }))}
                rows={3}
                placeholder={currentTurn?.input?.placeholder || '무엇을 할지 입력하세요'}
                style={{
                  width: '100%',
                  borderRadius: 14,
                  border: '1px solid rgba(71,85,105,0.9)',
                  background: '#020617',
                  color: '#e2e8f0',
                  padding: '12px 14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                borderRadius: 18,
                padding: '12px 14px',
                background: 'rgba(15,23,42,0.62)',
                border: '1px solid rgba(71,85,105,0.35)',
                fontSize: 13,
                lineHeight: 1.6,
                color: '#cbd5e1',
              }}
            >
              이 턴은 자동 실행됩니다. 현재 턴 프롬프트와 캐릭터 AI 문맥을 합쳐 행동을 생성합니다.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleRunTurn}
              disabled={runtimeState.running || !currentTurn}
              style={{
                padding: '12px 16px',
                borderRadius: 14,
                border: 'none',
                background: runtimeState.running ? '#334155' : '#38bdf8',
                color: runtimeState.running ? '#cbd5e1' : '#020617',
                fontWeight: 800,
                cursor: runtimeState.running ? 'wait' : 'pointer',
                minWidth: 140,
              }}
            >
              {runtimeState.running
                ? '실행 중…'
                : (currentTurn?.input?.mode || 'none') === 'none'
                  ? 'AI 턴 실행'
                  : '행동 제출'}
            </button>
            {!isEnded ? (
              <button
                type="button"
                onClick={handleSurrender}
                disabled={runtimeState.running}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(248,113,113,0.45)',
                  background: 'rgba(127,29,29,0.42)',
                  color: '#fecaca',
                  fontWeight: 800,
                  cursor: runtimeState.running ? 'wait' : 'pointer',
                }}
              >
                항복
              </button>
            ) : null}
            {runtimeState.status ? (
              <span style={{ fontSize: 12, color: '#93c5fd' }}>{runtimeState.status}</span>
            ) : null}
            {runtimeState.error ? (
              <span style={{ fontSize: 12, color: '#fca5a5' }}>{runtimeState.error}</span>
            ) : null}
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          {participants.map(participant => {
            const isActive = participant.id === resolvedActorId;
            return (
              <article
                key={participant.id}
                style={{
                  borderRadius: 18,
                  padding: 14,
                  background: isActive ? 'rgba(30,64,175,0.24)' : 'rgba(15,23,42,0.7)',
                  border: isActive
                    ? '1px solid rgba(96,165,250,0.55)'
                    : '1px solid rgba(71,85,105,0.3)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'grid', gap: 2 }}>
                    <strong style={{ color: '#f8fafc', fontSize: 14 }}>{participant.name}</strong>
                    <span style={{ color: '#93c5fd', fontSize: 11 }}>
                      {participant.slot_label || participant.role || 'slot'}
                    </span>
                  </div>
                  {participant.role ? (
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>
                      {participant.role}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {participant.team ? `팀 ${participant.team}` : '팀 미지정'}
                </div>
                {participant.description ? (
                  <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                    {shortText(participant.description, 60)}
                  </div>
                ) : null}
                {participant.abilities?.length ? (
                  <div style={{ fontSize: 11, color: '#7dd3fc', lineHeight: 1.5 }}>
                    {participant.abilities.slice(0, 3).join(' / ')}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <section
          style={{
            borderRadius: 20,
            padding: 16,
            background: 'rgba(2,6,23,0.84)',
            border: '1px solid rgba(71,85,105,0.35)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>턴 로그</h2>
            {dbSession?.winner ? (
              <span style={{ fontSize: 12, color: '#fbbf24' }}>승자: {dbSession.winner}</span>
            ) : null}
          </div>
          <div
            ref={logRef}
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              display: 'grid',
              gap: 10,
            }}
          >
            {turns.length ? (
              turns.map(turn => (
                <article
                  key={turn.id || `${turn.session_id}:${turn.turn_index}`}
                  style={{
                    borderRadius: 16,
                    padding: '12px 14px',
                    background: 'rgba(15,23,42,0.82)',
                    border: '1px solid rgba(51,65,85,0.7)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 12, color: '#93c5fd' }}>턴 {turn.turn_index}</span>
                    <span style={{ fontSize: 12, color: '#f8fafc' }}>{turn.result || '-'}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {turn.ai_response || turn.prompt || '로그가 없습니다.'}
                  </div>
                </article>
              ))
            ) : (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>아직 기록된 턴이 없습니다.</div>
            )}
          </div>
        </section>

        <section
          style={{
            borderRadius: 20,
            padding: 16,
            background: 'rgba(2,6,23,0.78)',
            border: '1px solid rgba(71,85,105,0.32)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>전투 요약</h2>
            <button
              type="button"
              onClick={() => setRuntimeState(prev => ({ ...prev, showDebug: !prev.showDebug }))}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid rgba(71,85,105,0.7)',
                background: 'rgba(15,23,42,0.82)',
                color: '#cbd5e1',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {runtimeState.showDebug ? '세부 숨기기' : '세부 보기'}
            </button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
            {lastTurn?.ai_response || lastTurn?.prompt || '마지막 장면 요약이 아직 없습니다.'}
          </div>
          {isEnded ? (
            <div
              style={{
                borderRadius: 16,
                padding: '12px 14px',
                background: 'rgba(20,83,45,0.2)',
                border: '1px solid rgba(74,222,128,0.24)',
                display: 'grid',
                gap: 6,
              }}
            >
              <strong style={{ color: '#dcfce7', fontSize: 14 }}>
                전투 종료
              </strong>
              <div style={{ fontSize: 12, color: '#bbf7d0' }}>
                상태: {sessionStatus || 'completed'}
              </div>
              {dbSession?.winner ? (
                <div style={{ fontSize: 12, color: '#bbf7d0' }}>승자: {String(dbSession.winner)}</div>
              ) : null}
              {dbSession?.final_score ? (
                <pre
                  style={{
                    margin: 0,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: '#d1fae5',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {JSON.stringify(dbSession.final_score, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
          {runtimeState.showDebug ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <details
                open
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(71,85,105,0.52)',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.7)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#bfdbfe', fontWeight: 700 }}>
                  현재 턴 실행 프롬프트
                </summary>
                <pre
                  style={{
                    margin: '10px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: '#cbd5e1',
                  }}
                >
                  {liveRuntime.runtimePrompt || '없음'}
                </pre>
              </details>
              <details
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(71,85,105,0.52)',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.7)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#bfdbfe', fontWeight: 700 }}>
                  현재 턴 문맥
                </summary>
                <pre
                  style={{
                    margin: '10px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: '#cbd5e1',
                  }}
                >
                  {JSON.stringify(livePromptContext || {}, null, 2)}
                </pre>
              </details>
              <details
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(71,85,105,0.52)',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.7)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#bfdbfe', fontWeight: 700 }}>
                  캐릭터 AI 게임 문맥
                </summary>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {(liveRuntime.agentContexts?.length ? liveRuntime.agentContexts : agentContexts).map(entry => (
                    <details
                      key={entry.heroId || entry.id}
                      style={{
                        borderRadius: 12,
                        border: '1px solid rgba(51,65,85,0.8)',
                        padding: '8px 10px',
                        background: 'rgba(2,6,23,0.78)',
                      }}
                    >
                      <summary style={{ cursor: 'pointer', fontSize: 12, color: '#f8fafc', fontWeight: 700 }}>
                        {entry.name}
                      </summary>
                      <pre
                        style={{
                          margin: '8px 0 0',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontSize: 11,
                          lineHeight: 1.6,
                          color: '#cbd5e1',
                        }}
                      >
                        {entry.context}
                      </pre>
                    </details>
                  ))}
                </div>
              </details>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
