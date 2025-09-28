import React, { useEffect, useMemo } from 'react'
import { styles } from './styles'

function formatNumber(value) {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('ko-KR').format(value)
}

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('ko-KR')
  } catch (error) {
    return value
  }
}

function getParticipantLabel(row) {
  if (row.hero_name) return row.hero_name
  if (row.hero_id) return row.hero_id
  if (row.owner_id) return row.owner_id.slice(0, 8)
  return '알 수 없음'
}

export default function GameDetail({
  game,
  detailLoading,
  roles = [],
  participants = [],
  roleChoice,
  onRoleChange,
  roleSlots = new Map(),
  onEnterGame,
  viewerParticipant,
}) {
  const hasGame = Boolean(game)

  useEffect(() => {
    if (!hasGame || detailLoading) return
    if (!viewerParticipant) return
    onEnterGame(game)
  }, [game, hasGame, detailLoading, onEnterGame, viewerParticipant])

  useEffect(() => {
    if (!hasGame || detailLoading) return
    if (viewerParticipant) return
    if (roleChoice) return
    const fallbackRole = roles.find((role) => {
      const slot = roleSlots.get(role.name)
      if (!slot) return true
      return slot.occupied < slot.capacity
    }) || roles[0]
    if (fallbackRole) {
      onRoleChange(fallbackRole.name)
    }
  }, [hasGame, detailLoading, viewerParticipant, roleChoice, roles, roleSlots, onRoleChange])

  const totalParticipants = participants.length

  const roleSummaries = useMemo(
    () =>
      roles.map((role) => {
        const slot = roleSlots.get(role.name) || { capacity: role.slot_count ?? 1, occupied: 0 }
        const remaining = Math.max(0, (slot.capacity ?? 0) - (slot.occupied ?? 0))
        return {
          name: role.name,
          capacity: slot.capacity ?? 0,
          occupied: slot.occupied ?? 0,
          remaining,
          disabled: remaining <= 0,
        }
      }),
    [roles, roleSlots],
  )

  const allSlotsFilled = roleSummaries.length > 0 && roleSummaries.every((role) => role.remaining === 0)

  const joinDisabled = detailLoading || allSlotsFilled || !roleChoice

  const handleJoin = () => {
    if (!game || joinDisabled) return
    onEnterGame(game, roleChoice)
  }

  if (!hasGame) {
    return <div style={styles.detailPlaceholder}>게임을 선택하면 상세 정보가 표시됩니다.</div>
  }

  if (viewerParticipant) {
    return (
      <div style={styles.detailPlaceholder}>
        이미 참여 중인 게임입니다. 곧 게임 룸으로 이동합니다…
      </div>
    )
  }

  return (
    <div style={styles.detailBox}>
      <div style={styles.detailHeader}>
        <div>
          <strong style={styles.detailTitle}>{game.name}</strong>
          <p style={styles.detailDesc}>{game.description || '설명이 없습니다.'}</p>
        </div>
        <div style={styles.detailMeta}>
          <span>좋아요 {formatNumber(game.likes_count)}</span>
          <span>게임 횟수 {formatNumber(game.play_count)}</span>
          {game.created_at ? <span>등록일 {formatDate(game.created_at)}</span> : null}
        </div>
      </div>

      {detailLoading ? <div style={styles.detailLoading}>참여 정보를 불러오는 중…</div> : null}

      <div style={styles.roleSection}>
        <span style={styles.roleLabel}>참여할 역할을 골라주세요</span>
        <div style={styles.roleGrid}>
          {roleSummaries.map((role) => {
            const isActive = roleChoice === role.name
            const buttonStyle = {
              ...styles.roleButton,
              ...(isActive ? styles.roleButtonActive : styles.roleButtonInactive),
              ...(role.disabled ? styles.roleButtonDisabled : null),
            }
            return (
              <button
                key={role.name}
                type="button"
                style={buttonStyle}
                onClick={() => !role.disabled && onRoleChange(role.name)}
                disabled={role.disabled}
              >
                <span>{role.name}</span>
                <span style={styles.roleSlotMeta}>
                  {role.occupied} / {role.capacity} 슬롯 사용 중
                </span>
                {role.disabled ? <span style={styles.roleBadgeFull}>모집 완료</span> : null}
              </button>
            )
          })}
        </div>
      </div>

      <div style={styles.joinControls}>
        <button
          type="button"
          style={{
            ...styles.joinButton,
            ...(joinDisabled ? styles.joinButtonDisabled : null),
          }}
          onClick={handleJoin}
          disabled={joinDisabled}
        >
          참여하기
        </button>
        {allSlotsFilled ? (
          <p style={styles.joinNotice}>모든 슬롯이 가득 찼습니다. 빈자리가 생길 때까지 기다려주세요.</p>
        ) : null}
      </div>

      <div style={styles.participantSection}>
        <span style={styles.participantLabel}>현재 참가자 ({totalParticipants}명)</span>
        <div style={styles.participantList}>
          {participants.length === 0 ? (
            <div style={styles.emptyState}>아직 참가한 사람이 없습니다.</div>
          ) : (
            participants.map((row) => (
              <div key={row.id} style={styles.participantRow}>
                <span style={styles.participantName}>{getParticipantLabel(row)}</span>
                <span style={styles.participantRole}>{row.role || '미정'}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
