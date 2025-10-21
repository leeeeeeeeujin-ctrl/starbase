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
  if (row.name) return row.name
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
  viewerId,
  onJoinGame,
  joinLoading = false,
}) {
  const hasGame = Boolean(game)
  const viewerKey = viewerId != null ? String(viewerId) : null
  const isViewerOwner = Boolean(
    viewerKey && game && game.owner_id != null && String(game.owner_id) === viewerKey
  )

  const conflictingOthers = useMemo(() => {
    if (!viewerKey) return []
    const list = Array.isArray(participants) ? participants : []
    const viewerRows = list.filter((row) => {
      if (!row) return false
      const ownerKey =
        row.owner_id != null ? String(row.owner_id) : row.ownerId != null ? String(row.ownerId) : null
      return ownerKey && ownerKey === viewerKey
    })

    if (viewerRows.length <= 1) {
      return []
    }

    const participantId = viewerParticipant?.id || null
    const heroId =
      viewerParticipant?.hero_id ||
      viewerParticipant?.heroId ||
      viewerParticipant?.hero?.id ||
      null

    return viewerRows.filter((row) => {
      if (!row) return false
      if (participantId && row.id === participantId) return false
      if (heroId != null) {
        const rowHeroId =
          row.hero_id != null
            ? row.hero_id
            : row.heroId != null
              ? row.heroId
              : row.hero?.id != null
                ? row.hero.id
                : null
        if (rowHeroId != null && rowHeroId === heroId) {
          return false
        }
      }
      return true
    })
  }, [participants, viewerKey, viewerParticipant])

  const hasConflict = conflictingOthers.length > 0 && !isViewerOwner

  useEffect(() => {
    if (!hasGame || detailLoading) return
    if (!viewerParticipant) return
    if (hasConflict) return
    onEnterGame(game)
  }, [game, hasGame, detailLoading, hasConflict, onEnterGame, viewerParticipant])

  useEffect(() => {
    if (!hasGame || detailLoading) return
    if (viewerParticipant) return
    if (hasConflict) return
    if (roleChoice) return

    const fallbackRole = [...roles]
      .map((role) => ({
        role,
        weight: roleSlots.get(role.name)?.occupied ?? 0,
      }))
      .sort((a, b) => a.weight - b.weight)[0]?.role

    const roleToApply = fallbackRole || roles[0]
    if (roleToApply) {
      onRoleChange(roleToApply.name)
    }
  }, [
    hasGame,
    detailLoading,
    viewerParticipant,
    hasConflict,
    roleChoice,
    roles,
    roleSlots,
    onRoleChange,
  ])

  const totalParticipants = participants.length

  const roleSummaries = useMemo(
    () =>
      roles.map((role) => {
        const slot = roleSlots.get(role.name) || { capacity: role.slot_count ?? 1, occupied: 0 }
        const capacity = Number.isFinite(Number(slot.capacity)) ? Number(slot.capacity) : 0
        const occupied = slot.occupied ?? 0
        const minimum = Math.max(0, capacity)
        return {
          name: role.name,
          capacity,
          occupied,
          minimum,
        }
      }),
    [roles, roleSlots],
  )

  const joinDisabled = detailLoading || joinLoading || !roleChoice || hasConflict

  const handleJoin = async () => {
    if (!game || joinDisabled) return
    if (onJoinGame) {
      const result = await onJoinGame(roleChoice)
      if (!result?.ok) {
        if (result?.error) {
          alert(result.error)
        }
        return
      }
    }
    onEnterGame(game, roleChoice)
  }

  if (!hasGame) {
    return <div style={styles.detailPlaceholder}>게임을 선택하면 상세 정보가 표시됩니다.</div>
  }

  if (viewerParticipant && !hasConflict) {
    return (
      <div style={styles.detailPlaceholder}>
        이미 참여 중인 게임입니다. 곧 게임 룸으로 이동합니다…
      </div>
    )
  }

  if (hasConflict) {
    const heroSummaries = conflictingOthers.map((row) => {
      const heroName =
        (typeof row?.name === 'string' && row.name.trim()) ||
        (typeof row?.hero_name === 'string' && row.hero_name.trim()) ||
        (typeof row?.heroName === 'string' && row.heroName.trim()) ||
        (row?.hero && typeof row.hero.name === 'string' && row.hero.name.trim()) ||
        (row?.hero_id ? `#${row.hero_id}` : '알 수 없음')
      const roleName = (row?.role && row.role.trim()) || ''
      return { heroName, roleName }
    })

    return (
      <div style={styles.conflictBox}>
        <div style={styles.conflictCard}>
          <div style={styles.conflictTitle}>이미 동일 명의로 참여한 게임입니다.</div>
          <p style={styles.conflictBody}>
            동일 명의로 참가 중인 캐릭터가 있어 새로 입장할 수 없습니다. 아래 정보를 확인한 뒤 기존 참가
            캐릭터로 게임을 진행하거나 다른 게임을 선택해 주세요.
          </p>
          <div style={styles.conflictList}>
            {heroSummaries.map(({ heroName, roleName }, index) => (
              <div key={`${heroName}-${roleName || 'none'}-${index}`} style={styles.conflictListItem}>
                <span style={styles.conflictHero}>{heroName}</span>
                {roleName ? <span style={styles.conflictRole}>{roleName}</span> : null}
              </div>
            ))}
          </div>
          <p style={styles.conflictHint}>참여 중인 캐릭터를 해제하거나 다른 게임을 선택해 주세요.</p>
        </div>
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
            }
            return (
              <button
                key={role.name}
                type="button"
                style={buttonStyle}
                onClick={() => onRoleChange(role.name)}
              >
                <span>{role.name}</span>
                <span style={styles.roleSlotMeta}>
                  최소 {role.minimum}명 필요 · 현재 {role.occupied}명 참가
                </span>
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
          {joinLoading ? '참여 처리 중…' : '참여하기'}
        </button>
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
