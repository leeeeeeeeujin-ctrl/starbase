function LogCard({ entry }) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: 10,
        background: '#f8fafc',
        display: 'grid',
        gap: 6,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700 }}>턴 {entry.turn} · 노드 {entry.nodeId}</div>
      <div style={{ whiteSpace: 'pre-wrap', color: '#1e293b' }}>{entry.response}</div>
      <div style={{ color: '#475569' }}>결론: {entry.outcome || '미확인'}</div>
      <div style={{ color: '#475569' }}>
        활성 변수: {entry.variables.length ? entry.variables.join(', ') : '없음'}
      </div>
      <div style={{ color: '#475569' }}>
        다음 노드: {entry.next ? entry.next : '없음'} ({entry.action || 'continue'})
      </div>
    </div>
  )
}

export default function LogsPanel({ logs = [] }) {
  return (
    <section
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        background: '#fff',
        padding: 12,
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 700 }}>턴 로그</div>
      <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 8 }}>
        {logs.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            아직 진행된 턴이 없습니다.
          </div>
        )}
        {logs.map((entry) => (
          <LogCard key={`${entry.turn}-${entry.nodeId}`} entry={entry} />
        ))}
      </div>
    </section>
  )
}

//
