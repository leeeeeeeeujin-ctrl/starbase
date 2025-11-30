"use client";

import { useEffect, useMemo, useState } from 'react';

/**
 * TurnLogBar
 *
 * - runtimeBus 의 `runtime:turn-log` 이벤트를 구독해 최근 턴 로그를 간단히 보여주는 바.
 * - 기본 표현은 "턴 N · 노드/요약" 한 줄이고, 클릭 시 전문/이전 턴을 볼 수 있는 작은 패널이 펼쳐진다.
 * - 메인게임/플레이 공통으로 사용할 수 있도록 GameShell 안에서만 runtimeBus 를 주입받는다.
 */
export default function TurnLogBar({ runtimeBus }) {
  const [events, setEvents] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);

  useEffect(() => {
    if (!runtimeBus || typeof runtimeBus.on !== 'function') return undefined;
    const off = runtimeBus.on('runtime:turn-log', (evt) => {
      try {
        const safe = evt && typeof evt === 'object' ? evt : {};
        setEvents((prev) => {
          const next = [...prev, safe];
          // keep only last 20 entries
          return next.slice(-20);
        });
      } catch {
        // ignore malformed events
      }
    });
    return () => {
      try {
        off && off();
      } catch {
        // ignore detach errors
      }
    };
  }, [runtimeBus]);

  const latest = events.length ? events[events.length - 1] : null;
  const hasEvents = !!latest;

  const summaryText = useMemo(() => {
    if (!latest) return '아직 진행된 턴이 없습니다.';
    const turn =
      typeof latest.turn === 'number' && Number.isFinite(latest.turn) ? latest.turn : null;
    const nodeLabel = latest.nodeLabel || latest.nodeId || '';
    const basePrompt = typeof latest.prompt === 'string' ? latest.prompt : '';
    const firstLine = basePrompt.split(/\r?\n/)[0] || '';
    const trimmed =
      firstLine.length > 80 ? `${firstLine.slice(0, 76).trimEnd()}…` : firstLine || nodeLabel;
    if (turn != null) {
      return `턴 ${turn} · ${trimmed || '내용 없음'}`;
    }
    return trimmed || '최근 턴 정보를 불러올 수 없습니다.';
  }, [latest]);

  const detailEvent =
    selectedIndex != null && selectedIndex >= 0 && selectedIndex < events.length
      ? events[selectedIndex]
      : latest;

  const detailPrompt =
    detailEvent && typeof detailEvent.prompt === 'string' ? detailEvent.prompt : '';

  if (!runtimeBus) return null;

  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 10,
        border: '1px solid rgba(30,64,175,0.6)',
        background: 'rgba(15,23,42,0.95)',
        color: '#e5e7eb',
        fontSize: 11,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => hasEvents && setExpanded((v) => !v)}
        style={{
          width: '100%',
          padding: '6px 10px',
          border: 'none',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: hasEvents ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            flex: 1,
          }}
        >
          <span
            style={{
              padding: '2px 6px',
              borderRadius: 999,
              border: '1px solid rgba(59,130,246,0.6)',
              background: 'rgba(15,23,42,0.9)',
              color: '#bfdbfe',
              fontSize: 10,
              flexShrink: 0,
            }}
          >
            턴 로그
          </span>
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity: hasEvents ? 1 : 0.7,
            }}
          >
            {summaryText}
          </span>
        </div>
        <span
          style={{
            marginLeft: 6,
            opacity: hasEvents ? 0.9 : 0.4,
          }}
        >
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && hasEvents && (
        <div
          style={{
            borderTop: '1px solid rgba(30,64,175,0.5)',
            maxHeight: 220,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 2fr)',
          }}
        >
          <div
            style={{
              padding: 8,
              borderRight: '1px solid rgba(30,64,175,0.35)',
              overflowY: 'auto',
            }}
          >
            {events
              .slice()
              .reverse()
              .map((evt, idx) => {
                const absoluteIndex = events.length - 1 - idx;
                const turn =
                  typeof evt.turn === 'number' && Number.isFinite(evt.turn) ? evt.turn : null;
                const nodeLabel = evt.nodeLabel || evt.nodeId || '';
                const firstLine =
                  typeof evt.prompt === 'string'
                    ? evt.prompt.split(/\r?\n/)[0] || ''
                    : nodeLabel || '';
                const short =
                  firstLine.length > 60
                    ? `${firstLine.slice(0, 56).trimEnd()}…`
                    : firstLine || '내용 없음';
                const selected = absoluteIndex === selectedIndex || (!detailEvent && idx === 0);
                return (
                  <button
                    key={`evt-${absoluteIndex}-${turn ?? 'null'}`}
                    type="button"
                    onClick={() => setSelectedIndex(absoluteIndex)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '4px 6px',
                      borderRadius: 6,
                      border: 'none',
                      background: selected
                        ? 'rgba(37,99,235,0.25)'
                        : 'rgba(15,23,42,0.9)',
                      color: '#e5e7eb',
                      marginBottom: 4,
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ opacity: 0.85 }}>
                        {turn != null ? `턴 ${turn}` : '턴 ?'}
                      </span>
                      {evt.reason ? (
                        <span style={{ opacity: 0.7 }}>{String(evt.reason)}</span>
                      ) : null}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        opacity: 0.9,
                      }}
                    >
                      {short}
                    </div>
                  </button>
                );
              })}
          </div>
          <div
            style={{
              padding: 8,
              overflowY: 'auto',
              background: 'rgba(15,23,42,0.96)',
            }}
          >
            {detailPrompt ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 11,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  lineHeight: 1.4,
                }}
              >
                {detailPrompt}
              </pre>
            ) : (
              <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>
                이 턴에 표시할 프롬프트를 찾지 못했습니다.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

