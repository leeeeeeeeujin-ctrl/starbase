import React from 'react'

import { useCharacterDashboardContext } from '../context'

export default function RightColumn() {
  const {
    selectedGameId,
    selectedEntry,
    battleSummary,
    onStartBattle,
    scoreboardRows,
    hero,
    heroLookup,
    battleDetails,
    visibleBattles,
    onShowMoreBattles,
    battleLoading,
    battleError,
  } = useCharacterDashboardContext()

  return (
    <main style={styles.column}>
      <InstantBattleSection
        selectedGameId={selectedGameId}
        selectedEntry={selectedEntry}
        battleSummary={battleSummary}
        onStartBattle={onStartBattle}
      />
      <RankingSection
        scoreboardRows={scoreboardRows}
        heroId={hero?.id}
        heroLookup={heroLookup}
        selectedEntry={selectedEntry}
      />
      <BattleLogSection
        battleDetails={battleDetails}
        visibleBattles={visibleBattles}
        onShowMoreBattles={onShowMoreBattles}
        battleLoading={battleLoading}
        battleError={battleError}
      />
    </main>
  )
}

function InstantBattleSection({ selectedGameId, selectedEntry, battleSummary, onStartBattle }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitleGroup}>
          <h2 style={styles.sectionTitle}>즉시 전투</h2>
          <span style={styles.sectionSubtitle}>
            선택한 게임에서 바로 전투를 시작합니다.
          </span>
        </div>
        {selectedEntry ? (
          <div style={styles.sectionMeta}>
            {selectedEntry.game?.name || selectedEntry.role || selectedEntry.game_id}
          </div>
        ) : null}
      </div>
      <div style={styles.battleStatGrid}>
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
          ...styles.primaryButton,
          background: selectedGameId ? 'linear-gradient(90deg, #38bdf8, #3b82f6)' : 'rgba(59, 130, 246, 0.35)',
          cursor: selectedGameId ? 'pointer' : 'not-allowed',
        }}
      >
        전투 시작
      </button>
    </section>
  )
}

function RankingSection({ scoreboardRows, heroId, heroLookup, selectedEntry }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>랭킹</h2>
        {selectedEntry ? (
          <span style={styles.sectionSubtitle}>{selectedEntry.game?.name || '—'}</span>
        ) : null}
      </div>
      {scoreboardRows.length ? (
        <div style={styles.rankingList}>
          {scoreboardRows.map((row, index) => {
            const highlight = row.hero_id === heroId
            const displayName = heroLookup[row.hero_id]?.name || row.role || `참가자 ${index + 1}`
            return (
              <div
                key={row.id || `${row.hero_id}-${index}`}
                style={{
                  ...styles.rankingRow,
                  background: highlight
                    ? 'rgba(56, 189, 248, 0.25)'
                    : 'rgba(30, 41, 59, 0.6)',
                  border: highlight
                    ? '1px solid rgba(56, 189, 248, 0.55)'
                    : '1px solid rgba(148, 163, 184, 0.25)',
                }}
              >
                <div style={styles.rankingBadge}>#{index + 1}</div>
                <div style={styles.rankingInfo}>
                  <strong>{displayName}</strong>
                  <span style={styles.rankingRole}>{row.role || '—'}</span>
                </div>
                <div style={styles.rankingScore}>{row.rating ?? row.score ?? '—'}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={styles.emptyState}>선택한 게임의 랭킹 데이터가 없습니다.</div>
      )}
    </section>
  )
}

function BattleLogSection({
  battleDetails,
  visibleBattles,
  onShowMoreBattles,
  battleLoading,
  battleError,
}) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>베틀로그</h2>
        {battleDetails.length ? (
          <span style={styles.sectionSubtitle}>{battleDetails.length}회 기록</span>
        ) : null}
      </div>
      {battleLoading ? (
        <div style={styles.loadingState}>전투 로그를 불러오는 중…</div>
      ) : battleDetails.length ? (
        <div style={styles.battleList}>
          {battleDetails.slice(0, visibleBattles).map((battle) => (
            <article key={battle.id} style={styles.battleCard}>
              <div style={styles.battleCardHeader}>
                <strong>{new Date(battle.created_at || 0).toLocaleString()}</strong>
                <span style={styles.battleResult}>{(battle.result || '').toUpperCase()}</span>
              </div>
              <div style={styles.battleScore}>점수 변화: {battle.score_delta ?? 0}</div>
              {battle.logs?.length ? (
                <div style={styles.battleLogs}>
                  {battle.logs.map((log) => (
                    <div key={`${log.battle_id}-${log.turn_no}`} style={styles.battleLogRow}>
                      <strong style={styles.battleTurn}>턴 {log.turn_no}</strong>
                      <div>프롬프트: {log.prompt}</div>
                      <div>응답: {log.ai_response}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {visibleBattles < battleDetails.length ? (
            <button
              type="button"
              onClick={onShowMoreBattles}
              style={styles.moreButton}
            >
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

function InfoTile({ label, value }) {
  return (
    <div style={styles.infoTile}>
      <span style={styles.infoTileLabel}>{label}</span>
      <strong style={styles.infoTileValue}>{value}</strong>
    </div>
  )
}

const styles = {
  column: { display: 'grid', gap: 24 },
  section: {
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.78)',
    padding: 24,
    display: 'grid',
    gap: 18,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitleGroup: { display: 'grid', gap: 4 },
  sectionTitle: { margin: 0, fontSize: 22 },
  sectionSubtitle: { fontSize: 13, color: '#94a3b8' },
  sectionMeta: { textAlign: 'right', fontSize: 13, color: '#bae6fd' },
  battleStatGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  },
  infoTile: {
    borderRadius: 20,
    padding: 14,
    background: 'rgba(30, 41, 59, 0.7)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
  },
  infoTileLabel: { fontSize: 12, color: '#94a3b8' },
  infoTileValue: { display: 'block', marginTop: 6, fontSize: 18 },
  primaryButton: {
    marginTop: 4,
    padding: '16px 20px',
    borderRadius: 999,
    border: 'none',
    color: '#020617',
    fontWeight: 800,
    transition: 'filter 0.2s ease',
  },
  rankingList: { display: 'grid', gap: 10 },
  rankingRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    padding: 14,
  },
  rankingBadge: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: 'rgba(8, 47, 73, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
  },
  rankingInfo: { display: 'grid', gap: 4 },
  rankingRole: { fontSize: 12, color: '#94a3b8' },
  rankingScore: { textAlign: 'right', fontWeight: 700 },
  emptyState: {
    padding: 20,
    textAlign: 'center',
    color: '#94a3b8',
    borderRadius: 18,
    border: '1px dashed rgba(148, 163, 184, 0.35)',
  },
  loadingState: { padding: 20, color: '#94a3b8' },
  battleList: { display: 'grid', gap: 16 },
  battleCard: {
    borderRadius: 20,
    padding: 16,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(30, 41, 59, 0.6)',
    display: 'grid',
    gap: 10,
  },
  battleCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  battleResult: { fontSize: 12, color: '#94a3b8' },
  battleScore: { fontSize: 13, color: '#cbd5f5' },
  battleLogs: { display: 'grid', gap: 8, fontSize: 12, color: '#e2e8f0' },
  battleLogRow: { display: 'grid', gap: 4 },
  battleTurn: { color: '#38bdf8' },
  moreButton: {
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(56, 189, 248, 0.12)',
    color: '#38bdf8',
    fontWeight: 700,
    justifySelf: 'center',
  },
  errorText: { color: '#f87171', fontSize: 12 },
}

//
