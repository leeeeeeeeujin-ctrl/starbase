"use client";

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch (err) {
    return value;
  }
}

function EventRow({ ev }) {
  const turn = Number.isFinite(Number(ev.turn)) ? ev.turn : null;
  const speaker = ev.speaker?.name || ev.speaker?.slotId || '';
  const summary =
    ev.summary ||
    (typeof ev.prompt === 'string' ? ev.prompt.split(/\r?\n/)[0] : ev.nodeLabel || ev.nodeId || '');
  return (
    <div style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.6)', display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#93c5fd' }}>
        {turn != null ? <span>턴 {turn}</span> : null}
        {ev.type ? <span>{ev.type}</span> : null}
        {speaker ? <span>{speaker}</span> : null}
      </div>
      <div style={{ fontSize: 13, color: '#e2e8f0' }}>{summary || '내용 없음'}</div>
    </div>
  );
}

export default function BattleLogPage() {
  const router = useRouter();
  const { sessionId, view: viewParam } = router.query || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let canceled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/rank/history?sessionId=${encodeURIComponent(sessionId)}`);
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || 'load_failed');
        }
        if (!canceled) setData(json);
      } catch (err) {
        if (!canceled) setError(err.message || 'load_failed');
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    load();
    return () => {
      canceled = true;
    };
  }, [sessionId]);

  if (!sessionId) {
    return <div style={{ padding: 24, color: '#e2e8f0' }}>세션 ID가 없습니다.</div>;
  }

  if (loading && !data) {
    return <div style={{ padding: 24, color: '#e2e8f0' }}>불러오는 중…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 24, color: '#e2e8f0' }}>
        베틀로그를 불러오지 못했습니다: {error}
      </div>
    );
  }
  if (!data) {
    return null;
  }

  const battleLog = data.battleLog || {};
  const events = Array.isArray(battleLog?.events) ? battleLog.events : [];
  const highlights = data.result?.highlightIds || data.battleLog?.highlightIds || [];
  const highlightSet = new Set(highlights);
  const highlightEvents = events.filter(ev => highlightSet.has(ev.id));

  const participants =
    battleLog && typeof battleLog.participants === 'object' ? battleLog.participants : {};
  const scoreboardFromLog =
    battleLog && typeof battleLog.scoreboard === 'object' && battleLog.scoreboard
      ? battleLog.scoreboard
      : null;
  const scoresFromResult =
    data.result && typeof data.result.scores === 'object' ? data.result.scores : null;
  const scoreboard = scoreboardFromLog || scoresFromResult || null;
  const winners = Array.isArray(data.result?.winners) ? data.result.winners : [];
  const losers = Array.isArray(data.result?.losers) ? data.result.losers : [];
  const draw = !!data.result?.draw;
  const winnerSet = new Set(winners.map(id => String(id)));
  const loserSet = new Set(losers.map(id => String(id)));
  const hasScoreboard =
    scoreboard && typeof scoreboard === 'object' && Object.keys(scoreboard).length > 0;

  const viewId =
    typeof viewParam === 'string' && viewParam.trim() ? viewParam.trim() : 'default';
  const showResultCard = true;
  const showScoreboardCard = viewId === 'default' || viewId === 'scores' || viewId === 'summary';
  const showHighlights = viewId === 'default' || viewId === 'summary' || viewId === 'highlights';
  const showFullLog = viewId === 'default' || viewId === 'log' || viewId === 'timeline';

  const templateId =
    data.result?.meta?.templateId ||
    data.battleLog?.meta?.templateId ||
    null;
  const templateVars =
    data.result?.meta?.templateVars ||
    data.battleLog?.meta?.templateVars ||
    null;

  return (
    <div style={{ padding: 24, color: '#e2e8f0', background: '#0b1220', minHeight: '100vh' }}>
      <div style={{ display: 'grid', gap: 12, maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>베틀로그</h1>
          <div style={{ fontSize: 13, color: '#93c5fd' }}>
            세션 {sessionId} · 게임 {data.meta?.gameId || '-'} · {formatDate(data.meta?.createdAt || data.receivedAt)}
          </div>
        </div>

        {showResultCard && (
          <div style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: 12, padding: 14, background: 'rgba(15,23,42,0.7)' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 6 }}>결과</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
              <span>승자: {(data.result?.winners || []).join(', ') || '-'}</span>
              <span>패자: {(data.result?.losers || []).join(', ') || '-'}</span>
              <span>무승부: {data.result?.draw ? '예' : '아니오'}</span>
            </div>
          </div>
        )}

        {showScoreboardCard && hasScoreboard ? (
          <div
            style={{
              border: '1px solid rgba(148,163,184,0.3)',
              borderRadius: 12,
              padding: 14,
              background: 'rgba(15,23,42,0.75)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, color: '#cbd5e1' }}>참여자 요약</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {Object.entries(scoreboard).map(([slotId, row]) => {
                const key = String(slotId);
                const participant = participants[key] || {};
                const name =
                  participant.heroName ||
                  participant.hero_name ||
                  participant.name ||
                  participant.displayName ||
                  key;
                const role = participant.role || '';
                const baseScore =
                  typeof row === 'number'
                    ? row
                    : typeof row?.score === 'number'
                      ? row.score
                      : null;
                const delta =
                  typeof row?.delta === 'number' && Number.isFinite(row.delta)
                    ? row.delta
                    : null;
                const tone = winnerSet.has(key)
                  ? 'win'
                  : loserSet.has(key)
                    ? 'lose'
                    : draw
                      ? 'draw'
                      : 'neutral';

                let borderColor = 'rgba(148,163,184,0.45)';
                let bg = 'rgba(15,23,42,0.9)';
                let textColor = '#e5e7eb';
                if (tone === 'win') {
                  borderColor = 'rgba(34,197,94,0.9)';
                  bg = 'linear-gradient(135deg, rgba(6,78,59,0.9), rgba(5,46,22,0.95))';
                  textColor = '#bbf7d0';
                } else if (tone === 'lose') {
                  borderColor = 'rgba(239,68,68,0.85)';
                  bg = 'linear-gradient(135deg, rgba(127,29,29,0.9), rgba(69,10,10,0.95))';
                  textColor = '#fecaca';
                } else if (tone === 'draw') {
                  borderColor = 'rgba(245,158,11,0.85)';
                  bg = 'linear-gradient(135deg, rgba(120,53,15,0.9), rgba(69,26,3,0.95))';
                  textColor = '#fde68a';
                }

                const scoreText =
                  baseScore != null ? baseScore : delta != null ? delta : null;
                const deltaLabel =
                  delta != null && delta !== baseScore
                    ? `${delta > 0 ? '+' : ''}${delta}`
                    : null;

                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: `1px solid ${borderColor}`,
                      background: bg,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: textColor,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {name}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                        {role ? (
                          <span style={{ fontSize: 11, color: '#bfdbfe' }}>
                            역할: <span style={{ color: '#e5e7eb' }}>{role}</span>
                          </span>
                        ) : null}
                        {tone === 'win' ? (
                          <span style={{ fontSize: 11, color: '#bbf7d0' }}>승리</span>
                        ) : tone === 'lose' ? (
                          <span style={{ fontSize: 11, color: '#fecaca' }}>패배</span>
                        ) : tone === 'draw' ? (
                          <span style={{ fontSize: 11, color: '#fde68a' }}>무승부</span>
                        ) : null}
                      </div>
                    </div>
                    {scoreText != null || deltaLabel ? (
                      <div
                        style={{
                          fontSize: 12,
                          textAlign: 'right',
                          color: '#e5e7eb',
                          minWidth: 80,
                        }}
                      >
                        {scoreText != null ? <div>점수 {scoreText}</div> : null}
                        {deltaLabel ? (
                          <div style={{ fontSize: 11, color: delta > 0 ? '#bbf7d0' : '#fecaca' }}>
                            Δ {deltaLabel}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {templateId || templateVars ? (
          <div style={{ border: '1px solid rgba(129,140,248,0.5)', borderRadius: 12, padding: 14, background: 'rgba(30,64,175,0.25)' }}>
            <div style={{ fontSize: 13, color: '#c7d2fe', marginBottom: 6 }}>템플릿 요약</div>
            <div style={{ fontSize: 13, color: '#e5e7eb', marginBottom: 4 }}>
              템플릿 ID: {templateId || '지정되지 않음'}
            </div>
            {templateVars && templateVars.finalScore ? (
              <div style={{ fontSize: 13, color: '#e5e7eb' }}>
                최종 점수: hero {templateVars.finalScore.hero ?? '-'} vs rival{' '}
                {templateVars.finalScore.rival ?? '-'}
              </div>
            ) : null}
            {templateVars && (templateVars.winner || templateVars.draw) ? (
              <div style={{ fontSize: 13, color: '#e5e7eb', marginTop: 2 }}>
                {templateVars.draw
                  ? '템플릿 기준: 무승부'
                  : `템플릿 기준 승자: ${templateVars.winner}`}
              </div>
            ) : null}
            {templateVars &&
            !templateVars.finalScore &&
            !templateVars.winner &&
            !templateVars.draw ? (
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                템플릿 변수: {JSON.stringify(templateVars)}
              </div>
            ) : null}
          </div>
        ) : null}

        {showHighlights && highlightEvents.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>하이라이트</div>
            {highlightEvents.map(ev => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </div>
        ) : null}

        {showFullLog && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>전체 로그</div>
            {events.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>기록이 없습니다.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {events.map(ev => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
