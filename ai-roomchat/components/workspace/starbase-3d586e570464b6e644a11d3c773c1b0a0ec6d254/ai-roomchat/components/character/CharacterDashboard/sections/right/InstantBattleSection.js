import React from 'react';

const styles = {
  section: {
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.78)',
    padding: 24,
    display: 'grid',
    gap: 18,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  titleGroup: { display: 'grid', gap: 4 },
  title: { margin: 0, fontSize: 22 },
  subtitle: { fontSize: 13, color: '#94a3b8' },
  meta: { textAlign: 'right', fontSize: 13, color: '#bae6fd' },
  statGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  },
  tile: {
    borderRadius: 20,
    padding: 14,
    background: 'rgba(30, 41, 59, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
  },
  tileLabel: { fontSize: 12, color: '#94a3b8' },
  tileValue: { display: 'block', marginTop: 6, fontSize: 18 },
  startButton: {
    marginTop: 4,
    padding: '16px 20px',
    borderRadius: 999,
    border: 'none',
    color: '#020617',
    fontWeight: 800,
    transition: 'filter 0.2s ease',
  },
};

export default function InstantBattleSection({
  selectedGameId,
  selectedEntry,
  battleSummary,
  onStartBattle,
}) {
  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <h2 style={styles.title}>즉시 전투</h2>
          <span style={styles.subtitle}>선택한 게임에서 바로 전투를 시작합니다.</span>
        </div>
        {selectedEntry ? (
          <div style={styles.meta}>
            {selectedEntry.game?.name || selectedEntry.role || selectedEntry.game_id}
          </div>
        ) : null}
      </div>
      <div style={styles.statGrid}>
        <InfoTile label="최근 전투" value={battleSummary.total} />
        <InfoTile
          label="승률"
          value={battleSummary.rate != null ? `${battleSummary.rate}%` : '—'}
        />
        <InfoTile
          label="승 / 패 / 무"
          value={`${battleSummary.wins}/${battleSummary.losses}/${battleSummary.draws}`}
        />
      </div>
      <button
        type="button"
        onClick={onStartBattle}
        disabled={!selectedGameId}
        style={{
          ...styles.startButton,
          background: selectedGameId
            ? 'linear-gradient(90deg, #38bdf8, #3b82f6)'
            : 'rgba(59, 130, 246, 0.35)',
          cursor: selectedGameId ? 'pointer' : 'not-allowed',
        }}
      >
        전투 시작
      </button>
    </section>
  );
}

function InfoTile({ label, value }) {
  return (
    <div style={styles.tile}>
      <span style={styles.tileLabel}>{label}</span>
      <strong style={styles.tileValue}>{value}</strong>
    </div>
  );
}
