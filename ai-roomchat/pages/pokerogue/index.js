'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const pageStyle = {
  minHeight: '100vh',
  background: '#020617',
  color: '#e2e8f0',
  padding: '32px 20px 80px',
};

const shellStyle = {
  width: '100%',
  maxWidth: 1120,
  margin: '0 auto',
  display: 'grid',
  gap: 20,
};

const cardStyle = {
  padding: 20,
  borderRadius: 24,
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'rgba(15,23,42,0.78)',
};

function JsonPane({ value }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 16,
        borderRadius: 18,
        background: 'rgba(2,6,23,0.82)',
        border: '1px solid rgba(51,65,85,0.8)',
        fontSize: 12,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowX: 'auto',
      }}
    >
      {value}
    </pre>
  );
}

export default function PokerogueIndexPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/pokerogue/participants');
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'pokerogue_participants_fetch_failed');
        }
        if (!cancelled) {
          setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        }
      } catch (fetchError) {
        if (!cancelled) setError(fetchError?.message || '포켓로그 참여 캐릭터를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const readyEntries = useMemo(() => entries.filter(entry => entry?.ready), [entries]);
  const pendingEntries = useMemo(() => entries.filter(entry => !entry?.ready), [entries]);
  const sampleJson = useMemo(
    () => JSON.stringify(readyEntries.slice(0, 5), null, 2),
    [readyEntries]
  );

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 28 }}>포켓로그 참여 캐릭터</h1>
              <p style={{ margin: 0, color: '#94a3b8', lineHeight: 1.7 }}>
                AI 스펙 생성 전 단계에서, 현재 캐릭터 메타를 포켓로그 엔트리로 변환한 결과를
                확인하는 개발용 화면이다.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href="/roster"
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.28)',
                  color: '#e2e8f0',
                  textDecoration: 'none',
                }}
              >
                로스터
              </Link>
              <a
                href="/api/pokerogue/participants"
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
                  color: '#0f172a',
                  textDecoration: 'none',
                  fontWeight: 800,
                }}
              >
                JSON 열기
              </a>
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ ...cardStyle, padding: 16, minWidth: 160 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>전체 참여 캐릭터</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{loading ? '—' : entries.length}</div>
            </div>
            <div style={{ ...cardStyle, padding: 16, minWidth: 160 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>즉시 주입 가능</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{loading ? '—' : readyEntries.length}</div>
            </div>
            <div style={{ ...cardStyle, padding: 16, minWidth: 160 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>보완 필요</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{loading ? '—' : pendingEntries.length}</div>
            </div>
          </div>

          {error ? <p style={{ margin: 0, color: '#fca5a5' }}>{error}</p> : null}
          {loading ? <p style={{ margin: 0, color: '#94a3b8' }}>불러오는 중…</p> : null}
        </section>

        <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>샘플 내보내기 형식</h2>
          <JsonPane value={sampleJson || '[]'} />
        </section>

        <section style={{ ...cardStyle, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>참여 캐릭터 목록</h2>
          {entries.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {entries.map(entry => (
                <div
                  key={entry.id}
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: '1px solid rgba(51,65,85,0.9)',
                    background: 'rgba(2,6,23,0.58)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong>{entry.name}</strong>
                    <span style={{ color: entry.ready ? '#67e8f9' : '#fda4af', fontSize: 12 }}>
                      {entry.ready ? '준비 완료' : `누락: ${entry.missingRequirements.join(', ')}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {entry.region || '지역 미지정'} · {entry.tier} ·{' '}
                    {entry.playable ? '플레이어블' : '비플레이어블'}
                  </div>
                  <div style={{ fontSize: 12, color: '#cbd5e1' }}>{entry.slug}</div>
                </div>
              ))}
            </div>
          ) : loading ? null : (
            <p style={{ margin: 0, color: '#94a3b8' }}>아직 등록된 참여 캐릭터가 없다.</p>
          )}
        </section>
      </div>
    </main>
  );
}
