'use client';

import { useMemo } from 'react';

export default function AdvancedToolsPanel({
  expanded = false,
  onToggle = () => {},
  storageKey = '',
  historyEntries = [],
  onExport = () => {},
  onClear = () => {},
}) {
  const entryCount = Array.isArray(historyEntries) ? historyEntries.length : 0;
  const latestTimestamp = useMemo(() => {
    if (!Array.isArray(historyEntries) || historyEntries.length === 0) {
      return null;
    }
    const latest = historyEntries[0];
    if (!latest?.timestamp) return null;
    try {
      return new Date(latest.timestamp).toLocaleString('ko-KR', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (error) {
      console.warn('[AdvancedToolsPanel] 최근 타임스탬프 포맷 실패', error);
      return null;
    }
  }, [historyEntries]);

  return (
    <section
      style={{
        background: '#ffffff',
        borderRadius: 18,
        padding: '12px 14px',
        boxShadow: '0 16px 40px -34px rgba(15, 23, 42, 0.38)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid' }}>
          <strong style={{ fontSize: 14, color: '#0f172a' }}>고급 도구</strong>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            자동 업그레이드 기록 {entryCount}건{latestTimestamp ? ` · 최근 ${latestTimestamp}` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          style={{
            padding: '6px 12px',
            borderRadius: 10,
            border: '1px solid #cbd5f5',
            background: expanded ? '#1d4ed8' : '#f8fafc',
            color: expanded ? '#fff' : '#0f172a',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {expanded ? '도구 닫기' : '도구 열기'}
        </button>
      </div>

      {expanded && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
            히스토리는 로컬 스토리지에 저장됩니다. 같은 브라우저에서만 공유되며, 필요하면 JSON으로
            내보내 다른 환경에 보관할 수 있습니다.
          </p>

          <div
            style={{
              display: 'grid',
              gap: 8,
              background: '#f8fafc',
              border: '1px dashed #cbd5f5',
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 12,
              color: '#475569',
            }}
          >
            <span style={{ fontWeight: 700, color: '#0f172a' }}>스토리지 키</span>
            <code style={{ fontFamily: 'Menlo, ui-monospace, SFMono-Regular, monospace' }}>
              {storageKey || 'maker:history:{setId}'}
            </code>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => entryCount > 0 && onExport()}
              disabled={entryCount === 0}
              style={{
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid #cbd5f5',
                background: entryCount === 0 ? '#f1f5f9' : '#dbeafe',
                color: entryCount === 0 ? '#94a3b8' : '#1d4ed8',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              JSON 내보내기
            </button>
            <button
              type="button"
              onClick={() => {
                if (entryCount === 0) return;
                if (typeof window !== 'undefined') {
                  const confirmed = window.confirm(
                    '저장된 자동 업그레이드 히스토리를 모두 삭제할까요?'
                  );
                  if (!confirmed) {
                    return;
                  }
                }
                onClear();
              }}
              disabled={entryCount === 0}
              style={{
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid #fecdd3',
                background: entryCount === 0 ? '#fef2f2' : '#fee2e2',
                color: entryCount === 0 ? '#fca5a5' : '#b91c1c',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              기록 비우기
            </button>
          </div>

          {entryCount === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              아직 자동 업그레이드 내역이 없습니다. 저장 후 자동 갱신이 실행되면 이곳에 기록이
              쌓입니다.
            </p>
          ) : (
            <ol
              style={{
                margin: 0,
                paddingLeft: 20,
                display: 'grid',
                gap: 10,
                fontSize: 12,
                color: '#0f172a',
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {historyEntries.map(entry => (
                <li key={entry.id} style={{ display: 'grid', gap: 6 }}>
                  <strong style={{ fontSize: 13 }}>{entry.message}</strong>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {entry.timestamp
                      ? new Date(entry.timestamp).toLocaleString('ko-KR', {
                          hour12: false,
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : '타임스탬프 없음'}
                  </span>
                  {entry.summary && (
                    <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                      {entry.summary}
                    </p>
                  )}
                  {Array.isArray(entry.details) && entry.details.length > 0 && (
                    <ul
                      style={{
                        margin: '0 0 0 18px',
                        padding: 0,
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: '#1f2937',
                      }}
                    >
                      {entry.details.map(detail => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
