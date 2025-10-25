export default function AlertsPanel({ alerts }) {
  return (
    <div style={styles.root}>
      {alerts.map(alert => (
        <div key={alert.id} style={styles.card}>
          <strong style={styles.title}>{alert.title}</strong>
          <p style={styles.body}>{alert.body}</p>
          <span style={styles.time}>{alert.created_at}</span>
        </div>
      ))}
    </div>
  );
}

const styles = {
  root: {
    background: '#ffffff',
    borderRadius: 24,
    boxShadow: '0 28px 60px -46px rgba(15, 23, 42, 0.55)',
    padding: 18,
    display: 'grid',
    gap: 14,
  },
  card: {
    border: '1px solid #e2e8f0',
    borderRadius: 18,
    padding: 16,
    background: '#f8fafc',
    display: 'grid',
    gap: 6,
  },
  title: {
    color: '#0f172a',
    fontSize: 15,
  },
  body: {
    margin: 0,
    fontSize: 13,
    color: '#475569',
    lineHeight: 1.6,
  },
  time: {
    fontSize: 12,
    color: '#94a3b8',
  },
};
//
