import React from 'react'
import { styles } from './styles'

export default function GameDetail({
  game,
  detailLoading,
  participants,
  roles,
  roleChoice,
  onRoleChange,
  roleSlots,
  onEnterGame,
}) {
  if (!game) {
    return null
  }

  const handleEnter = () => {
    onEnterGame(game, roleChoice)
  }

  return (
    <div style={styles.detailBox}>
      <div style={styles.detailHeader}>
        <strong style={styles.detailTitle}>{game.name}</strong>
        <p style={styles.detailDesc}>{game.description || '설명이 없습니다.'}</p>
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

      <button onClick={handleEnter} disabled={!game} style={styles.enterButton}>
        선택한 역할로 입장
      </button>
    </div>
  )
}
//
