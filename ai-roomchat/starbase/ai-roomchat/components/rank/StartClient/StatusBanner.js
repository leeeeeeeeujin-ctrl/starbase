export default function StatusBanner({ message }) {
  if (!message) return null;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 14,
        background: 'rgba(56, 189, 248, 0.15)',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        color: '#bae6fd',
      }}
    >
      {message}
    </div>
  );
}

//
