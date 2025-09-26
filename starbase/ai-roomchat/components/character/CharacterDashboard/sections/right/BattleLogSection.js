import React from 'react'

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
  },
  title: { margin: 0, fontSize: 22 },
  subtitle: { fontSize: 13, color: '#94a3b8' },
  loading: { padding: 20, color: '#94a3b8' },
  list: { display: 'grid', gap: 16 },
  card: {
    borderRadius: 20,
    padding: 16,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(30, 41, 59, 0.6)',
    display: 'grid',
    gap: 10,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  result: { fontSize: 12, color: '#94a3b8' },
  score: { fontSize: 13, color: '#cbd5f5' },
  logs: { display: 'grid', gap: 8, fontSize: 12, color: '#e2e8f0' },
  logRow: { display: 'grid', gap: 4 },
  turn: { color: '#38bdf8' },
  moreButton: {
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(56, 189, 248, 0.12)',
    color: '#38bdf8',
    fontWeight: 700,
    justifySelf: 'center',
  },
  emptyState: {
    padding: 20,
    textAlign: 'center',
    color: '#94a3b8',
    borderRadius: 18,
    border: '1px dashed rgba(148, 163, 184, 0.35)',
  },
  errorText: { color: '#f87171', fontSize: 12 },
}

export default function BattleLogSection({
  battleDetails,
  visibleBattles,
  onShowMoreBattles,
  battleLoading,
  battleError,
}) {
  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <h2 style={styles.title}>베틀로그</h2>
        {battleDetails.length ? (
          <span data-numeric style={styles.subtitle}>{battleDetails.length}회 기록</span>
        ) : null}
      </div>
      {battleLoading ? (
        <div style={styles.loading}>전투 로그를 불러오는 중…</div>
      ) : battleDetails.length ? (
        <div style={styles.list}>
          {battleDetails.slice(0, visibleBattles).map((battle) => (
            <article key={battle.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <strong>{new Date(battle.created_at || 0).toLocaleString()}</strong>
                <span style={styles.result}>{(battle.result || '').toUpperCase()}</span>
              </div>
              <div data-numeric style={styles.score}>점수 변화: {battle.score_delta ?? 0}</div>
              {battle.logs?.length ? (
                <div style={styles.logs}>
                  {battle.logs.map((log) => (
                    <div key={`${log.battle_id}-${log.turn_no}`} style={styles.logRow}>
                      <strong data-numeric style={styles.turn}>턴 {log.turn_no}</strong>
                      <div>프롬프트: {log.prompt}</div>
                      <div>응답: {log.ai_response}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {visibleBattles < battleDetails.length ? (
            <button type="button" onClick={onShowMoreBattles} style={styles.moreButton}>
              더 보기
            </button>
          ) : null}
        </div>
      ) : (
        <div style={styles.emptyState}>아직 전투 기록이 없습니다.</div>
      )}
      {battleError ? <div style={styles.errorText}>{battleError}</div> : null}
    </section>
  )
}
