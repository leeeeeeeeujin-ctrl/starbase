const styles = {
  root: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 12,
    display: 'grid',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  refresh: { padding: '6px 10px' },
  empty: { color: '#64748b' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '6px 4px' },
  td: { borderBottom: '1px solid #f1f5f9', padding: '6px 4px' },
};

export default function ParticipantLeaderboard({ participants, onRefresh }) {
  return (
    <section style={styles.root}>
      <div style={styles.header}>
        <h3 style={{ margin: '4px 0' }}>리더보드 (최신 게임)</h3>
        <button type="button" onClick={onRefresh} style={styles.refresh}>
          새로고침
        </button>
      </div>
      {participants.length === 0 ? (
        <div style={styles.empty}>참가자가 없습니다.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>순위</th>
              <th style={styles.th}>Owner</th>
              <th style={styles.th}>Rating</th>
              <th style={styles.th}>Battles</th>
              <th style={styles.th}>Likes</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((participant, index) => (
              <tr key={participant.owner_id}>
                <td style={styles.td}>{index + 1}</td>
                <td style={styles.td}>{participant.owner_id?.slice(0, 8)}…</td>
                <td style={styles.td}>{participant.rating}</td>
                <td style={styles.td}>{participant.battles}</td>
                <td style={styles.td}>{participant.likes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
