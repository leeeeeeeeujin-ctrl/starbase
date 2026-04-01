"use client";

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentTurn, buildTurnPromptContext } from '@/lib/battle/session';
import { buildRuntimePromptFromTurn } from '@/lib/battle/agentRuntime';
import {
  readStoredTextBattleSession,
  writeStoredTextBattleSession,
} from '@/lib/battle/clientSessionStorage';

export default function TextBattleSessionPage() {
  const router = useRouter();
  const { id } = router.query || {};
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
        const storedSession = readStoredTextBattleSession(id);
        setState({
          loading: false,
          error: null,
          payload: json,
        });
        setRuntimeState(prev => ({
          ...prev,
          session: storedSession && typeof storedSession === 'object' ? storedSession : prev.session,
        }));
      })
      .catch(err => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err?.message || String(err),
          payload: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div style={{ padding: 20 }}>
        세션 ID가 지정되지 않았습니다.
      </div>
    );
  }

  if (state.loading) {
    return (
      <div style={{ padding: 20 }}>
        텍스트 배틀 결과를 불러오는 중입니다…
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{ padding: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>텍스트 배틀 결과</h1>
        <p style={{ color: '#ef4444', fontSize: 14 }}>
          에러가 발생했습니다: {state.error}
        </p>
      </div>
    );
  }

  const { session, turns, participants, agentContexts } = state.payload || {};
  const runtimeSession = runtimeState.session || null;
  const currentTurn = runtimeSession ? getCurrentTurn(runtimeSession) : null;
  const livePromptContext =
    runtimeSession && currentTurn
      ? buildTurnPromptContext(runtimeSession, currentTurn, runtimeSession.actorId)
      : null;
  const liveRuntime =
    runtimeSession && currentTurn
      ? buildRuntimePromptFromTurn(runtimeSession, currentTurn, runtimeSession.actorId)
      : { agentContexts: [], runtimePrompt: '' };
  const finalScore = session?.final_score || null;
  const winner = session?.winner || null;
  const createdAt = session?.created_at || null;
  const lastTurn =
    Array.isArray(turns) && turns.length ? turns[turns.length - 1] : null;

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
      status: '턴을 실행하는 중입니다…',
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

      let resultText = '';
      const inputValue = runtimeState.input.trim();
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
          actorId: runtimeSession.actorId,
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
        session: json.session,
        input: '',
        running: false,
        status:
          json.session?.status === 'completed'
            ? '세션이 종료되었습니다.'
            : '다음 턴으로 진행했습니다.',
        error: '',
      }));
      await refreshPayload();
    } catch (error) {
      setRuntimeState(prev => ({
        ...prev,
        running: false,
        error: error?.message || String(error),
        status: '',
      }));
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e2e8f0',
        padding: '16px 14px 40px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        <header
          style={{
            borderRadius: 18,
            padding: '14px 16px',
            background:
              'linear-gradient(135deg, #1e1b4b 0%, #1d4ed8 40%, #0f172a 100%)',
            boxShadow: '0 18px 40px -22px rgba(15,23,42,0.9)',
            border: '1px solid rgba(59,130,246,0.6)',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: '#f9fafb',
            }}
          >
            텍스트 배틀 결과
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13,
              color: '#c7d2fe',
            }}
          >
            세션 ID: <code>{id}</code>
          </p>
          {createdAt && (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 12,
                color: '#a5b4fc',
              }}
            >
              생성 시각: {new Date(createdAt).toLocaleString()}
            </p>
          )}
        </header>

        <section
          style={{
            borderRadius: 16,
            padding: '12px 14px',
            background: '#020617',
            border: '1px solid rgba(30,64,175,0.7)',
            display: 'grid',
            gap: 8,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: '#e5e7eb',
            }}
          >
            세션 진행
          </h2>
          {runtimeSession ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                현재 상태: <strong style={{ color: '#f8fafc' }}>{runtimeSession.status || 'active'}</strong>
                {currentTurn ? (
                  <>
                    {' '}
                    · 현재 턴: <strong style={{ color: '#93c5fd' }}>{currentTurn.title || currentTurn.id}</strong>
                  </>
                ) : null}
              </div>
              {currentTurn?.display ? (
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: 13,
                    lineHeight: 1.6,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: '#020617',
                    border: '1px solid rgba(31,41,55,0.9)',
                  }}
                >
                  {currentTurn.display}
                </div>
              ) : null}
              {(currentTurn?.input?.mode || 'none') !== 'none' ? (
                <textarea
                  value={runtimeState.input}
                  onChange={event =>
                    setRuntimeState(prev => ({ ...prev, input: event.target.value }))
                  }
                  rows={3}
                  placeholder={currentTurn?.input?.placeholder || '응답을 입력하세요'}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(75,85,99,0.95)',
                    background: '#020617',
                    color: '#e2e8f0',
                    padding: '10px 12px',
                    resize: 'vertical',
                  }}
                />
              ) : null}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleRunTurn}
                  disabled={runtimeState.running || !currentTurn}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: runtimeState.running ? '#334155' : '#38bdf8',
                    color: runtimeState.running ? '#cbd5e1' : '#020617',
                    fontWeight: 800,
                    cursor: runtimeState.running ? 'wait' : 'pointer',
                  }}
                >
                  {runtimeState.running ? '실행 중…' : '다음 턴 실행'}
                </button>
                {runtimeState.status ? (
                  <span style={{ fontSize: 12, color: '#93c5fd', alignSelf: 'center' }}>
                    {runtimeState.status}
                  </span>
                ) : null}
                {runtimeState.error ? (
                  <span style={{ fontSize: 12, color: '#fca5a5', alignSelf: 'center' }}>
                    {runtimeState.error}
                  </span>
                ) : null}
              </div>
              {liveRuntime.runtimePrompt ? (
                <details
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(31,41,55,0.9)',
                    padding: '10px 12px',
                    background: '#020617',
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
                    {liveRuntime.runtimePrompt}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              이 기기에 저장된 실행 세션이 없습니다. 게임 시작 페이지에서 새 세션을 연 뒤 이어서 진행해 주세요.
            </p>
          )}
        </section>

        <section
          style={{
            borderRadius: 16,
            padding: '12px 14px',
            background: '#020617',
            border: '1px solid rgba(55,65,81,0.8)',
            display: 'grid',
            gap: 8,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: '#bfdbfe',
            }}
          >
            승패 / 최종 점수
          </h2>
          <div style={{ fontSize: 14 }}>
            <div style={{ marginBottom: 4 }}>
              승자:{' '}
              <strong style={{ color: '#f97316' }}>
                {winner || '미정'}
              </strong>
            </div>
            {finalScore && (
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  flexWrap: 'wrap',
                  fontSize: 13,
                  color: '#e5e7eb',
                }}
              >
                <span>
                  hero 점수:{' '}
                  <strong style={{ color: '#facc15' }}>
                    {finalScore.hero ?? 0}
                  </strong>
                </span>
                <span>
                  rival 점수:{' '}
                  <strong style={{ color: '#38bdf8' }}>
                    {finalScore.rival ?? 0}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </section>

        <section
          style={{
            borderRadius: 16,
            padding: '12px 14px',
            background: '#020617',
            border: '1px solid rgba(55,65,81,0.8)',
            display: 'grid',
            gap: 8,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: '#e5e7eb',
            }}
          >
            참가 캐릭터
          </h2>
          {Array.isArray(participants) && participants.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {participants.map(participant => (
                <div
                  key={participant.id}
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(31,41,55,0.9)',
                    padding: '10px 12px',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <strong style={{ fontSize: 14, color: '#f8fafc' }}>{participant.name}</strong>
                  {participant.description ? (
                    <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                      {participant.description}
                    </div>
                  ) : null}
                  {participant.abilities?.length ? (
                    <div style={{ fontSize: 12, color: '#93c5fd' }}>
                      능력: {participant.abilities.join(' / ')}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              연결된 캐릭터 정보가 없습니다.
            </p>
          )}
        </section>

        <section
          style={{
            borderRadius: 16,
            padding: '12px 14px',
            background: '#020617',
            border: '1px solid rgba(55,65,81,0.8)',
            display: 'grid',
            gap: 8,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: '#e5e7eb',
            }}
          >
            캐릭터 AI 게임 문맥
          </h2>
          {(liveRuntime.agentContexts?.length || agentContexts?.length) ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {(liveRuntime.agentContexts?.length ? liveRuntime.agentContexts : agentContexts).map(entry => (
                <details
                  key={entry.heroId || entry.id}
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(31,41,55,0.9)',
                    padding: '10px 12px',
                    background: '#020617',
                  }}
                >
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: '#bfdbfe', fontWeight: 700 }}>
                    {entry.name}
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
                    {entry.context}
                  </pre>
                </details>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              생성된 게임 문맥이 없습니다.
            </p>
          )}
        </section>

        <section
          style={{
            borderRadius: 16,
            padding: '12px 14px',
            background: '#020617',
            border: '1px solid rgba(55,65,81,0.8)',
            display: 'grid',
            gap: 8,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: '#e5e7eb',
            }}
          >
            마지막 장면 요약
          </h2>
          {lastTurn ? (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                background: '#020617',
                borderRadius: 12,
                border: '1px solid rgba(31,41,55,0.9)',
                padding: '10px 12px',
              }}
            >
              {lastTurn.ai_response || lastTurn.prompt || '요약이 없습니다.'}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              기록된 턴이 없습니다.
            </p>
          )}
        </section>

        <section
          style={{
            borderRadius: 16,
            padding: '12px 14px',
            background: '#020617',
            border: '1px solid rgba(55,65,81,0.8)',
            display: 'grid',
            gap: 8,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: '#e5e7eb',
            }}
          >
            턴 로그
          </h2>
          {Array.isArray(turns) && turns.length ? (
            <div
              style={{
                maxHeight: 320,
                overflowY: 'auto',
                borderRadius: 12,
                border: '1px solid rgba(31,41,55,0.9)',
              }}
            >
              {turns.map(turn => (
                <div
                  key={turn.id || `${turn.session_id}:${turn.turn_index}`}
                  style={{
                    padding: '8px 10px',
                    borderBottom: '1px solid rgba(31,41,55,0.8)',
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: '#9ca3af' }}>
                      턴 {turn.turn_index}
                    </span>
                    <span style={{ color: '#93c5fd' }}>
                      결과: {turn.result || '-'}
                    </span>
                  </div>
                  {turn.ai_response && (
                    <div
                      style={{
                        whiteSpace: 'pre-wrap',
                        color: '#e5e7eb',
                      }}
                    >
                      {turn.ai_response}
                    </div>
                  )}
                  {turn.effects?.apiRouting && (
                    <details
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: '#9ca3af',
                      }}
                    >
                      <summary>API 라우팅 정보</summary>
                      <pre
                        style={{
                          marginTop: 2,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {JSON.stringify(turn.effects?.apiRouting, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              턴 로그가 없습니다.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
