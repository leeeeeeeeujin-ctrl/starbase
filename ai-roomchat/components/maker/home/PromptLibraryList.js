'use client';

function formatDownloads(count) {
  if (!Number.isFinite(count)) return '0회 다운로드';
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K회 다운로드`;
  }
  return `${count}회 다운로드`;
}

export default function PromptLibraryList({
  entries,
  loading,
  errorMessage,
  importingId,
  onImport,
  onRefresh,
}) {
  return (
    <section
      style={{
        background: 'rgba(15,23,42,0.82)',
        borderRadius: 24,
        padding: 20,
        display: 'grid',
        gap: 16,
        color: '#e2e8f0',
        boxShadow: '0 28px 62px -48px rgba(15, 23, 42, 0.7)',
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 18 }}>공유 프롬프트</strong>
          <span style={{ fontSize: 12, color: '#cbd5f5' }}>
            다른 제작자들이 공유한 세트를 내려받아 바로 편집할 수 있습니다.
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          style={{
            padding: '8px 12px',
            borderRadius: 14,
            border: '1px solid rgba(148,163,184,0.45)',
            background: 'rgba(15,23,42,0.55)',
            color: '#e2e8f0',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          새로고침
        </button>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 14,
            background: 'rgba(248,113,113,0.12)',
            color: '#fecaca',
            fontSize: 12,
          }}
        >
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div
          style={{
            padding: '42px 18px',
            textAlign: 'center',
            color: '#cbd5f5',
            fontWeight: 600,
          }}
        >
          공유 프롬프트를 불러오는 중…
        </div>
      ) : entries.length === 0 ? (
        <div
          style={{
            padding: '42px 18px',
            textAlign: 'center',
            color: '#cbd5f5',
            fontWeight: 600,
            lineHeight: 1.6,
          }}
        >
          아직 공유된 프롬프트가 없어요. 잠시 후 다시 확인해 주세요.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {entries.map(entry => {
            const isImporting = importingId === entry.id;
            return (
              <article
                key={entry.id}
                style={{
                  borderRadius: 18,
                  background: 'rgba(15,23,42,0.72)',
                  border: '1px solid rgba(148,163,184,0.3)',
                  padding: '16px 18px',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <strong style={{ fontSize: 17, color: '#f8fafc' }}>
                      {entry.title || '이름 없는 세트'}
                    </strong>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      {formatDownloads(entry.download_count || 0)} ·{' '}
                      {entry.profiles?.username || '익명'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onImport(entry.id)}
                    disabled={isImporting}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 999,
                      border: 'none',
                      background: 'linear-gradient(135deg, #22d3ee 0%, #0ea5e9 100%)',
                      color: '#0f172a',
                      fontWeight: 700,
                      minWidth: 120,
                      opacity: isImporting ? 0.7 : 1,
                    }}
                  >
                    {isImporting ? '가져오는 중…' : '내 메이커로'}
                  </button>
                </div>
                {entry.summary && (
                  <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5', lineHeight: 1.6 }}>
                    {entry.summary.length > 140 ? `${entry.summary.slice(0, 140)}…` : entry.summary}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
