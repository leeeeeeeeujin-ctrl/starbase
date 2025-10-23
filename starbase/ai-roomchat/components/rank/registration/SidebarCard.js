'use client';

export default function SidebarCard({ title, children }) {
  return (
    <div
      style={{
        background: 'rgba(15,23,42,0.62)',
        borderRadius: 24,
        padding: '20px 22px',
        boxShadow: '0 28px 60px -52px rgba(15, 23, 42, 0.85)',
        color: '#e2e8f0',
        display: 'grid',
        gap: 12,
      }}
    >
      {title ? (
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{title}</p>
      ) : null}
      <div style={{ display: 'grid', gap: 8, fontSize: 13, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}
