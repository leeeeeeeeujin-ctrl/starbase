"use client";

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function TextBattleSessionPage() {
  const router = useRouter();
  const { id } = router.query || {};
  const [state, setState] = useState({
    loading: true,
    error: null,
    payload: null,
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
        setState({
          loading: false,
          error: null,
          payload: json,
        });
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

  const { session, turns } = state.payload || {};
  const finalScore = session?.final_score || null;
  const winner = session?.winner || null;
  const createdAt = session?.created_at || null;
  const lastTurn =
    Array.isArray(turns) && turns.length ? turns[turns.length - 1] : null;

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

