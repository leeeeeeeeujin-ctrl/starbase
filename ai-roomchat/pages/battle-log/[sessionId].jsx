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
  const { sessionId } = router.query || {};
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

  const events = Array.isArray(data.battleLog?.events) ? data.battleLog.events : [];
  const highlights = data.result?.highlightIds || data.battleLog?.highlightIds || [];
  const highlightSet = new Set(highlights);
  const highlightEvents = events.filter(ev => highlightSet.has(ev.id));

  return (
    <div style={{ padding: 24, color: '#e2e8f0', background: '#0b1220', minHeight: '100vh' }}>
      <div style={{ display: 'grid', gap: 12, maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>베틀로그</h1>
          <div style={{ fontSize: 13, color: '#93c5fd' }}>
            세션 {sessionId} · 게임 {data.meta?.gameId || '-'} · {formatDate(data.meta?.createdAt || data.receivedAt)}
          </div>
        </div>

        <div style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: 12, padding: 14, background: 'rgba(15,23,42,0.7)' }}>
          <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 6 }}>결과</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
            <span>승자: {(data.result?.winners || []).join(', ') || '-'}</span>
            <span>패자: {(data.result?.losers || []).join(', ') || '-'}</span>
            <span>무승부: {data.result?.draw ? '예' : '아니오'}</span>
          </div>
        </div>

        {highlightEvents.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>하이라이트</div>
            {highlightEvents.map(ev => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </div>
        ) : null}

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
      </div>
    </div>
  );
}
