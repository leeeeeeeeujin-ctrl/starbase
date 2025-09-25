import React from 'react'

export default function GameSearchPanel({
  query,
  onQueryChange,
  sort,
  onSortChange,
  sortOptions,
  rows,
  loading,
  selectedGame,
  onSelectGame,
  detailLoading,
  roles,
  participants,
  roleChoice,
  onRoleChange,
  roleSlots,
  onEnterGame,
}) {
  return (
    <div style={styles.root}>
      <div style={styles.searchControls}>
        <div style={styles.searchInputs}>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="게임 이름 또는 설명 검색"
            inputMode="search"
            style={styles.searchInput}
          />
          <select value={sort} onChange={(event) => onSortChange(event.target.value)} style={styles.sortSelect}>
            {sortOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.listBox}>
          {loading && <div style={styles.emptyState}>불러오는 중…</div>}
          {!loading && rows.length === 0 && <div style={styles.emptyState}>조건에 맞는 게임이 없습니다.</div>}
          {rows.map((game) => {
            const active = selectedGame?.id === game.id
            return (
              <button
                key={game.id}
                onClick={() => onSelectGame(game)}
                style={{ ...styles.gameRow, ...(active ? styles.gameRowActive : styles.gameRowInactive) }}
              >
                <div style={styles.gameThumb}>
                  {game.image_url ? <img src={game.image_url} alt="" style={styles.gameThumbImage} /> : null}
                </div>
                <div style={styles.gameInfo}>
                  <strong style={styles.gameTitle}>{game.name}</strong>
                  <span style={styles.gameDesc}>
                    {game.description ? game.description.slice(0, 80) + (game.description.length > 80 ? '…' : '') : '설명이 없습니다.'}
                  </span>
                  <div style={styles.gameMeta}>
                    <span>좋아요 {game.likes_count ?? 0}</span>
                    <span>게임횟수 {game.play_count ?? 0}</span>
                  </div>
                </div>
                <span style={styles.gameDate}>{new Date(game.created_at).toLocaleDateString()}</span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedGame && (
        <div style={styles.detailBox}>
          <div style={styles.detailHeader}>
            <strong style={styles.detailTitle}>{selectedGame.name}</strong>
            <p style={styles.detailDesc}>{selectedGame.description || '설명이 없습니다.'}</p>
          </div>
          <div style={styles.roleSection}>
            <span style={styles.roleLabel}>역할 선택</span>
            <div style={styles.roleGrid}>
              {roles.map((role) => {
                const slot = roleSlots.get(role.name) || { capacity: role.slot_count ?? 1, occupied: 0 }
                const disabled = slot.occupied >= (slot.capacity ?? 1)
                const active = roleChoice === role.name
                return (
                  <button
                    key={role.id}
                    onClick={() => onRoleChange(role.name)}
                    disabled={disabled}
                    style={{
                      ...styles.roleButton,
                      ...(active ? styles.roleButtonActive : styles.roleButtonInactive),
                      ...(disabled ? styles.roleButtonDisabled : null),
                    }}
                  >
                    <strong>{role.name}</strong>
                    <span style={styles.roleSlotMeta}>
                      {slot.occupied}/{slot.capacity ?? 1}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div style={styles.participantSection}>
            <span style={styles.participantLabel}>참여 중</span>
            <div style={styles.participantList}>
              {detailLoading && <div style={styles.emptyState}>참여 정보를 불러오는 중…</div>}
              {!detailLoading && participants.length === 0 && <div style={styles.emptyState}>아직 참여한 사람이 없습니다.</div>}
              {participants.map((row) => (
                <div key={row.id} style={styles.participantRow}>
                  <span style={styles.participantName}>{row.hero_name || row.hero_id}</span>
                  <span style={styles.participantRole}>{row.role || '미지정'}</span>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => onEnterGame(selectedGame, roleChoice)}
            disabled={!selectedGame}
            style={styles.enterButton}
          >
            선택한 역할로 입장
          </button>
        </div>
      )}
    </div>
  )
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
  searchControls: {
    display: 'grid',
    gap: 10,
  },
  searchInputs: {
    display: 'grid',
    gridTemplateColumns: '1fr 120px',
    gap: 10,
  },
  searchInput: {
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
  },
  sortSelect: {
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
  },
  listBox: {
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 12,
    maxHeight: '45vh',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    display: 'grid',
    gap: 10,
  },
  emptyState: {
    padding: 12,
    textAlign: 'center',
    color: '#64748b',
  },
  gameRow: {
    textAlign: 'left',
    display: 'grid',
    gridTemplateColumns: '64px 1fr auto',
    gap: 12,
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 16,
  },
  gameRowActive: {
    border: '2px solid #2563eb',
    background: 'rgba(37, 99, 235, 0.08)',
  },
  gameRowInactive: {
    border: '1px solid #e2e8f0',
    background: '#f9fafb',
  },
  gameThumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
    background: '#e2e8f0',
  },
  gameThumbImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  gameInfo: {
    display: 'grid',
    gap: 4,
  },
  gameTitle: {
    fontSize: 15,
    color: '#0f172a',
  },
  gameDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 1.4,
  },
  gameMeta: {
    display: 'flex',
    gap: 12,
    fontSize: 12,
    color: '#94a3b8',
  },
  gameDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  detailBox: {
    border: '1px solid #e2e8f0',
    borderRadius: 20,
    padding: 16,
    display: 'grid',
    gap: 12,
    background: '#f9fafc',
  },
  detailHeader: {
    display: 'grid',
    gap: 6,
  },
  detailTitle: {
    fontSize: 16,
    color: '#0f172a',
  },
  detailDesc: {
    margin: 0,
    fontSize: 13,
    color: '#475569',
    lineHeight: 1.6,
  },
  roleSection: {
    display: 'grid',
    gap: 10,
  },
  roleLabel: {
    fontWeight: 600,
    color: '#0f172a',
  },
  roleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 10,
  },
  roleButton: {
    borderRadius: 14,
    padding: '12px 14px',
    border: '1px solid #e2e8f0',
    display: 'grid',
    gap: 6,
    background: '#fff',
  },
  roleButtonActive: {
    borderColor: '#2563eb',
    background: 'rgba(37, 99, 235, 0.1)',
  },
  roleButtonInactive: {},
  roleButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  roleSlotMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  participantSection: {
    display: 'grid',
    gap: 10,
  },
  participantLabel: {
    fontWeight: 600,
    color: '#0f172a',
  },
  participantList: {
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: 12,
    display: 'grid',
    gap: 10,
    background: '#fff',
  },
  participantRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#1f2937',
  },
  participantName: {
    fontWeight: 600,
  },
  participantRole: {
    color: '#64748b',
  },
  enterButton: {
    marginTop: 4,
    padding: '12px 16px',
    borderRadius: 12,
    background: '#2563eb',
    color: '#fff',
    fontWeight: 700,
    border: 'none',
  },
}
//
