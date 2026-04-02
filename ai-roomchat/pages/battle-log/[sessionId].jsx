"use client";

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withTable } from '@/lib/supabaseTables';
import { clearActiveSessionRecord, readActiveSession } from '@/lib/rank/activeSessionStorage';

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch (error) {
    return value;
  }
}

function shortText(value, limit = 280) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

function parseJsonLikeText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function extractBattleLogText(value) {
  const parsed = parseJsonLikeText(value);
  if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
    return parsed.reply.trim();
  }
  return typeof value === 'string' ? value : '';
}

function BattleLogShell({ children }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(59,130,246,0.18), transparent 24%), linear-gradient(180deg, #020617 0%, #0f172a 100%)',
        color: '#e2e8f0',
        padding: '20px 14px 42px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 820,
          margin: '0 auto',
          display: 'grid',
          gap: 16,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function BattleLogHeader({ title = '베틀로그', meta = '', backHref = '' }) {
  return (
    <header
      style={{
        borderRadius: 24,
        padding: '18px 18px 16px',
        background: 'rgba(2,6,23,0.82)',
        border: '1px solid rgba(59,130,246,0.22)',
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>{title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {backHref ? (
            <Link
              href={backHref}
              style={{
                textDecoration: 'none',
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(15,23,42,0.76)',
                border: '1px solid rgba(148,163,184,0.28)',
                color: '#e2e8f0',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              게임 시작으로 돌아가기
            </Link>
          ) : null}
          {meta ? <div style={{ fontSize: 12, color: '#93c5fd' }}>{meta}</div> : null}
        </div>
      </div>
    </header>
  );
}

function ResultPortrait({ participant, tone = 'neutral' }) {
  const borderColor =
    tone === 'win'
      ? 'rgba(96,165,250,0.96)'
      : tone === 'lose'
        ? 'rgba(248,113,113,0.92)'
        : 'rgba(148,163,184,0.5)';
  const shadowColor =
    tone === 'win'
      ? 'rgba(59,130,246,0.4)'
      : tone === 'lose'
        ? 'rgba(239,68,68,0.35)'
        : 'rgba(15,23,42,0.35)';

  return (
    <article
      style={{
        display: 'grid',
        gap: 10,
        justifyItems: 'center',
      }}
    >
      <div
        style={{
          width: 136,
          height: 180,
          borderRadius: 24,
          border: `3px solid ${borderColor}`,
          boxShadow: `0 26px 50px -34px ${shadowColor}`,
          background: participant?.image_url
            ? `linear-gradient(180deg, rgba(15,23,42,0.18), rgba(2,6,23,0.72)), url(${participant.image_url}) center/cover no-repeat`
            : 'linear-gradient(180deg, rgba(30,41,59,0.96), rgba(15,23,42,0.98))',
          display: 'grid',
          alignItems: 'end',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            padding: '12px 12px 10px',
            background: 'linear-gradient(180deg, rgba(2,6,23,0), rgba(2,6,23,0.86))',
            fontSize: 11,
            color: '#cbd5e1',
            boxSizing: 'border-box',
          }}
        >
          {participant?.team ? `팀 ${participant.team}` : '팀 미지정'}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
        <strong style={{ color: '#f8fafc', fontSize: 15 }}>{participant?.name || '이름 없음'}</strong>
        {participant?.role ? (
          <div style={{ fontSize: 12, color: '#93c5fd' }}>{participant.role}</div>
        ) : null}
      </div>
    </article>
  );
}

function buildTeamOutcomeMap(finalScore = {}, session = {}) {
  const raw =
    (finalScore?.teamOutcomes && typeof finalScore.teamOutcomes === 'object'
      ? finalScore.teamOutcomes
      : session?.team_outcomes && typeof session.team_outcomes === 'object'
        ? session.team_outcomes
        : {}) || {};
  const normalized = {};
  Object.entries(raw).forEach(([key, value]) => {
    const normalizedKey = String(key || '').replace(/^팀\s*/i, '').trim();
    if (!normalizedKey) return;
    normalized[normalizedKey] = String(value || '').trim().toLowerCase();
  });
  return normalized;
}

function TextBattleResultView({ payload, sessionId, backHref = '' }) {
  const session = payload?.session || {};
  const participants = Array.isArray(payload?.participants) ? payload.participants : [];
  const turns = Array.isArray(payload?.turns) ? payload.turns : [];
  const finalScore =
    session?.final_score && typeof session.final_score === 'object'
      ? session.final_score
      : {};
  const attacker = participants[0] || null;
  const defender = participants[1] || null;
  const teamOutcomeMap = buildTeamOutcomeMap(finalScore, session);
  const attackerTeamKey = String(attacker?.team || '').trim();
  const defenderTeamKey = String(defender?.team || '').trim();
  const attackerOutcome = attackerTeamKey ? teamOutcomeMap[attackerTeamKey] || '' : '';
  const defenderOutcome = defenderTeamKey ? teamOutcomeMap[defenderTeamKey] || '' : '';
  const attackerTone =
    attackerOutcome === 'win' ? 'win' : attackerOutcome === 'lose' ? 'lose' : 'neutral';
  const defenderTone =
    defenderOutcome === 'win' ? 'win' : defenderOutcome === 'lose' ? 'lose' : 'neutral';
  const attackerDelta =
    Number.isFinite(Number(finalScore?.deltas?.attacker))
      ? Number(finalScore.deltas.attacker)
      : Number.isFinite(Number(finalScore?.delta))
        ? Number(finalScore.delta)
        : null;
  const defenderDelta =
    Number.isFinite(Number(finalScore?.deltas?.defender))
      ? Number(finalScore.deltas.defender)
      : attackerDelta == null
        ? null
        : attackerDelta * -1;

  const logRows = turns.map((turn, index) => {
    const actor = participants.find(participant =>
      [participant?.hero_id, participant?.id]
        .filter(Boolean)
        .map(value => String(value))
        .includes(String(turn?.hero_id || ''))
    );
    return {
      id: turn?.id || `${turn?.session_id || sessionId}:${index}`,
      turnIndex: Number.isFinite(Number(turn?.turn_index)) ? Number(turn.turn_index) + 1 : index + 1,
      actorName: actor?.name || '시스템',
      summary: shortText(turn?.ai_response || turn?.prompt || turn?.result || '기록이 없습니다.', 420),
      raw: turn?.ai_response || turn?.prompt || turn?.result || '',
    };
  });

  return (
    <BattleLogShell>
      <BattleLogHeader
        meta={`세션 ${sessionId} · ${formatDate(session?.updated_at || session?.created_at)}`}
        backHref={backHref}
      />
      <div
        style={{
          fontSize: 13,
          color: '#cbd5e1',
          borderRadius: 18,
          padding: '12px 16px',
          background: 'rgba(2,6,23,0.72)',
          border: '1px solid rgba(71,85,105,0.3)',
        }}
      >
        종료 사유: <strong style={{ color: '#f8fafc' }}>{finalScore?.reason || session?.status || 'completed'}</strong>
      </div>

        <section
          style={{
            borderRadius: 28,
            padding: '22px 18px',
            background: 'rgba(2,6,23,0.78)',
            border: '1px solid rgba(71,85,105,0.4)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <ResultPortrait participant={attacker} tone={attackerTone} />
            <div
              style={{
                display: 'grid',
                gap: 8,
                justifyItems: 'center',
                minWidth: 90,
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8', letterSpacing: '0.06em' }}>점수 변동</div>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 18,
                  background: 'rgba(15,23,42,0.92)',
                  border: '1px solid rgba(71,85,105,0.65)',
                  display: 'grid',
                  gap: 6,
                  justifyItems: 'center',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 900, color: '#60a5fa' }}>
                  {attackerDelta == null ? '-' : `${attackerDelta > 0 ? '+' : ''}${attackerDelta}`}
                </div>
                <div style={{ fontSize: 12, color: '#475569' }}>vs</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#f87171' }}>
                  {defenderDelta == null ? '-' : `${defenderDelta > 0 ? '+' : ''}${defenderDelta}`}
                </div>
              </div>
            </div>
            <ResultPortrait participant={defender} tone={defenderTone} />
          </div>
        </section>

        <section
          style={{
            borderRadius: 22,
            padding: '16px 16px 18px',
            background: 'rgba(2,6,23,0.84)',
            border: '1px solid rgba(71,85,105,0.34)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#f8fafc' }}>전투 로그</h2>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{logRows.length}개 기록</div>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {logRows.length ? (
              logRows.map(row => (
                <article
                  key={row.id}
                  style={{
                    borderRadius: 18,
                    padding: '12px 14px',
                    background: 'rgba(15,23,42,0.78)',
                    border: '1px solid rgba(51,65,85,0.82)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: '#93c5fd' }}>
                      턴 {row.turnIndex} · {row.actorName}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.75, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                    {row.summary}
                  </div>
                </article>
              ))
            ) : (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>기록된 베틀로그가 없습니다.</div>
            )}
          </div>
        </section>
    </BattleLogShell>
  );
}

function EventRow({ ev }) {
  const turn = Number.isFinite(Number(ev.turn)) ? ev.turn : null;
  const speaker = ev.speaker?.name || ev.speaker?.slotId || '';
  const summary =
    ev.summary ||
    (typeof ev.prompt === 'string' ? ev.prompt.split(/\r?\n/)[0] : ev.nodeLabel || ev.nodeId || '');
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid rgba(148,163,184,0.35)',
        background: 'rgba(15,23,42,0.6)',
        display: 'grid',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#93c5fd' }}>
        {turn != null ? <span>턴 {turn}</span> : null}
        {ev.type ? <span>{ev.type}</span> : null}
        {speaker ? <span>{speaker}</span> : null}
      </div>
      <div style={{ fontSize: 13, color: '#e2e8f0' }}>{summary || '내용 없음'}</div>
    </div>
  );
}

function LegacyBattleLogView({ data, sessionId, viewParam, backHref = '' }) {
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

  return (
    <div style={{ padding: 24, color: '#e2e8f0', background: '#0b1220', minHeight: '100vh' }}>
      <div style={{ display: 'grid', gap: 12, maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>베틀로그</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {backHref ? (
              <Link
                href={backHref}
                style={{
                  textDecoration: 'none',
                  padding: '8px 12px',
                  borderRadius: 999,
                  background: 'rgba(15,23,42,0.76)',
                  border: '1px solid rgba(148,163,184,0.28)',
                  color: '#e2e8f0',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                게임 시작으로 돌아가기
              </Link>
            ) : null}
            <div style={{ fontSize: 13, color: '#93c5fd' }}>
              세션 {sessionId} · 게임 {data.meta?.gameId || '-'} · {formatDate(data.meta?.createdAt || data.receivedAt)}
            </div>
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

function RankBattleDetailView({ battle, logs, backHref = '' }) {
  const rawResult = String(battle?.result || '').toLowerCase();
  const attackerParticipant = battle?.attackerParticipant || { name: '공격 캐릭터', image_url: null, team: '1', role: '' };
  const defenderParticipant = battle?.defenderParticipant || { name: '방어 캐릭터', image_url: null, team: '2', role: '' };
  const attackerTone =
    rawResult === 'win' ? 'win' : rawResult === 'lose' || rawResult === 'loss' ? 'lose' : 'neutral';
  const defenderTone =
    rawResult === 'win' ? 'lose' : rawResult === 'lose' || rawResult === 'loss' ? 'win' : 'neutral';
  const attackerDelta = Number.isFinite(Number(battle?.score_delta)) ? Number(battle.score_delta) : null;
  const defenderDelta = attackerDelta == null ? null : attackerDelta * -1;
  return (
    <BattleLogShell>
      <BattleLogHeader
        meta={`전투 ${battle?.id || '-'} · ${formatDate(battle?.created_at)}`}
        backHref={backHref}
      />

        <div
          style={{
            borderRadius: 28,
            padding: '22px 18px',
            background: 'rgba(2,6,23,0.78)',
            border: '1px solid rgba(71,85,105,0.4)',
            display: 'grid',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>결과 요약</div>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: `1px solid ${attackerTone === 'win' ? 'rgba(96,165,250,0.72)' : attackerTone === 'lose' ? 'rgba(248,113,113,0.72)' : 'rgba(148,163,184,0.42)'}`,
                color: attackerTone === 'win' ? '#93c5fd' : attackerTone === 'lose' ? '#fca5a5' : '#cbd5e1',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {battle?.result || 'unknown'}
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <ResultPortrait participant={attackerParticipant} tone={attackerTone} />
            <div
              style={{
                display: 'grid',
                gap: 8,
                justifyItems: 'center',
                minWidth: 90,
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8', letterSpacing: '0.06em' }}>점수 변동</div>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 18,
                  background: 'rgba(15,23,42,0.92)',
                  border: '1px solid rgba(71,85,105,0.65)',
                  display: 'grid',
                  gap: 6,
                  justifyItems: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: attackerDelta == null ? '#cbd5e1' : attackerDelta >= 0 ? '#60a5fa' : '#f87171',
                  }}
                >
                  {attackerDelta != null
                    ? `${attackerDelta > 0 ? '+' : ''}${attackerDelta}`
                    : '-'}
                </div>
                <div style={{ fontSize: 12, color: '#475569' }}>vs</div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: defenderDelta == null ? '#cbd5e1' : defenderDelta >= 0 ? '#60a5fa' : '#f87171',
                  }}
                >
                  {defenderDelta != null
                    ? `${defenderDelta > 0 ? '+' : ''}${defenderDelta}`
                    : '-'}
                </div>
                </div>
              </div>
            <ResultPortrait participant={defenderParticipant} tone={defenderTone} />
          </div>
        </div>

        <section
          style={{
            borderRadius: 22,
            padding: '16px 16px 18px',
            background: 'rgba(2,6,23,0.84)',
            border: '1px solid rgba(71,85,105,0.34)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#f8fafc' }}>전투 로그</h2>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{logs.length}개 기록</div>
          </div>
          {logs.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8' }}>기록이 없습니다.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {logs.map(log => (
                <article
                  key={`${battle?.id}-${log.turn_no ?? 'na'}-${log.created_at ?? ''}`}
                  style={{
                    borderRadius: 18,
                    padding: '12px 14px',
                    background: 'rgba(15,23,42,0.78)',
                    border: '1px solid rgba(51,65,85,0.82)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 12, color: '#93c5fd' }}>턴 {log.turn_no ?? '-'}</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                    {shortText(extractBattleLogText(log.ai_response || log.prompt || '내용 없음'), 800)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
    </BattleLogShell>
  );
}

export default function BattleLogPage() {
  const router = useRouter();
  const { sessionId, view: viewParam, heroId: heroIdParam, gameId: gameIdParam, battleId: battleIdParam } = router.query || {};
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('loading');
  const [error, setError] = useState(null);
  const [storedHeroId, setStoredHeroId] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setStoredHeroId(window.localStorage.getItem('character-play:last-hero-id') || '');
    } catch (storageError) {
      setStoredHeroId('');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !sessionId) return;
    const active = readActiveSession();
    if (!active) return;
    if (active.sessionId && String(active.sessionId) !== String(sessionId)) return;
    clearActiveSessionRecord(active.gameId || undefined);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const load = async () => {
      setMode('loading');
      setError(null);
      try {
        const textRes = await fetch(`/api/text-battle/session?id=${encodeURIComponent(sessionId)}`);
        const textJson = await textRes.json().catch(() => null);
        if (!cancelled && textRes.ok && textJson?.ok) {
          setData(textJson);
          setMode('text-battle');
          return;
        }

        const legacyRes = await fetch(`/api/rank/history?sessionId=${encodeURIComponent(sessionId)}`);
        const legacyJson = await legacyRes.json().catch(() => null);
        if (!legacyRes.ok || !legacyJson?.ok) {
          const fallbackBattleId =
            (Array.isArray(battleIdParam) ? battleIdParam[0] : battleIdParam) ||
            String(sessionId);
          const { data: battleRow, error: battleError } = await withTable(supabase, 'rank_battles', table =>
            supabase
              .from(table)
              .select('id, game_id, created_at, result, score_delta, attacker_hero_ids, defender_hero_ids')
              .eq('id', fallbackBattleId)
              .maybeSingle()
          );
          if (battleError || !battleRow?.id) {
            throw new Error(legacyJson?.error || textJson?.error || 'load_failed');
          }
          const { data: logRows } = await withTable(supabase, 'rank_battle_logs', table =>
            supabase
              .from(table)
              .select('battle_id, turn_no, prompt, ai_response, created_at')
              .eq('battle_id', fallbackBattleId)
              .order('turn_no', { ascending: true })
          );
          const attackerHeroIds = Array.isArray(battleRow?.attacker_hero_ids)
            ? battleRow.attacker_hero_ids.map(value => String(value))
            : [];
          const defenderHeroIds = Array.isArray(battleRow?.defender_hero_ids)
            ? battleRow.defender_hero_ids.map(value => String(value))
            : [];
          const heroIds = [...new Set([...attackerHeroIds, ...defenderHeroIds])];
          let heroRows = [];
          if (heroIds.length) {
            const heroResult = await withTable(supabase, 'heroes', table =>
              supabase
                .from(table)
                .select('id, name, image_url')
                .in('id', heroIds)
            );
            heroRows = Array.isArray(heroResult?.data) ? heroResult.data : [];
          }
          const heroMap = Object.fromEntries(
            heroRows.map(row => [String(row.id), row])
          );
          const attackerHeroId = attackerHeroIds[0] || '';
          const defenderHeroId = defenderHeroIds[0] || '';
          const attackerHero = heroMap[attackerHeroId] || null;
          const defenderHero = heroMap[defenderHeroId] || null;
          if (!cancelled) {
            setData({
              battle: {
                ...battleRow,
                attackerParticipant: {
                  name: attackerHero?.name || '공격 캐릭터',
                  image_url: attackerHero?.image_url || null,
                  team: '1',
                },
                defenderParticipant: {
                  name: defenderHero?.name || '방어 캐릭터',
                  image_url: defenderHero?.image_url || null,
                  team: '2',
                },
              },
              logs: Array.isArray(logRows) ? logRows : [],
            });
            setMode('battle');
          }
          return;
        }
        if (!cancelled) {
          setData(legacyJson);
          setMode('legacy');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'load_failed');
          setMode('error');
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const resolvedHeroId = (Array.isArray(heroIdParam) ? heroIdParam[0] : heroIdParam) || storedHeroId || '';
  const resolvedGameId =
    (Array.isArray(gameIdParam) ? gameIdParam[0] : gameIdParam) ||
    data?.session?.game_id ||
    data?.session?.gameId ||
    data?.meta?.gameId ||
    '';
  const backHref =
    resolvedHeroId && resolvedGameId
      ? `/character/${encodeURIComponent(resolvedHeroId)}/play?gameId=${encodeURIComponent(resolvedGameId)}`
      : '';

  const content = useMemo(() => {
    if (!sessionId) {
      return <div style={{ padding: 24, color: '#e2e8f0' }}>세션 ID가 없습니다.</div>;
    }
    if (mode === 'loading') {
      return <div style={{ padding: 24, color: '#e2e8f0' }}>불러오는 중…</div>;
    }
    if (mode === 'error') {
      return (
        <div style={{ padding: 24, color: '#e2e8f0' }}>
          베틀로그를 불러오지 못했습니다: {error}
        </div>
      );
    }
    if (!data) return null;
    if (mode === 'text-battle') {
      return <TextBattleResultView payload={data} sessionId={String(sessionId)} backHref={backHref} />;
    }
    if (mode === 'battle') {
      return <RankBattleDetailView battle={data.battle} logs={Array.isArray(data.logs) ? data.logs : []} backHref={backHref} />;
    }
    return <LegacyBattleLogView data={data} sessionId={String(sessionId)} viewParam={viewParam} backHref={backHref} />;
  }, [backHref, data, error, mode, sessionId, viewParam]);

  return content;
}
