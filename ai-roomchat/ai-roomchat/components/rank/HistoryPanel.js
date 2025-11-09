// components/rank/HistoryPanel.js
export default function HistoryPanel({ text }) {
  if (!text) return null;
  const lines = String(text).split('\n').filter(Boolean);
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 12,
        background: '#fafafa',
        maxHeight: 180,
        overflowY: 'auto',
        marginTop: 4,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>히스토리</div>
      {lines.map((line, i) => (
        <div key={i} style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>
          {line}
        </div>
      ))}
    </div>
  );
}
