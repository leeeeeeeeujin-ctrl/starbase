import React, { useEffect, useMemo, useState } from 'react'

import { MATCH_MODE_KEYS, getMatchModeConfig } from '../../../lib/rank/matchModes'
import { styles } from './styles'

function mergeStyle(...layers) {
  return Object.assign({}, ...layers.filter(Boolean))
}

function ModeSelector({ mode, onChange, loading }) {
  const modes = [
    { key: MATCH_MODE_KEYS.RANK_DUO, label: '듀오 랭크' },
    { key: MATCH_MODE_KEYS.CASUAL_MATCH, label: '캐주얼 매칭' },
    { key: MATCH_MODE_KEYS.CASUAL_PRIVATE, label: '사설 방' },
  ]
  return (
    <div style={styles.modeTabs}>
      {modes.map((item) => {
        const active = mode === item.key
        return (
          <button
            key={item.key}
            type="button"
            style={mergeStyle(styles.modeButton, active && styles.modeButtonActive, loading && styles.modeButtonDisabled)}
            onClick={() => !loading && onChange(item.key)}
            disabled={loading}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function RoomList({ rooms = [], selectedRoomId, onSelect, loading, error }) {
  if (error) {
    return <div style={styles.errorText}>{error}</div>
  }
  if (loading && rooms.length === 0) {
    return <div style={styles.placeholder}>방 목록을 불러오는 중입니다…</div>
  }
  if (rooms.length === 0) {
    return <div style={styles.placeholder}>조건에 맞는 방이 없습니다. 새로 만들어 보세요!</div>
  }
  return (
    <div style={styles.roomList}>
      {rooms.map((room) => {
        const selected = room.id === selectedRoomId
        const filled = room.filledCount ?? 0
        const total = room.slotCount ?? 0
        const subtitleParts = []
        if (room.code) subtitleParts.push(`코드 ${room.code}`)
        if (room.status) subtitleParts.push(room.status === 'starting' ? '시작 준비 중' : room.status === 'in-progress' ? '진행 중' : '대기 중')
        return (
          <div
            key={room.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(room.id)}
            onKeyPress={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                onSelect(room.id)
              }
            }}
            style={mergeStyle(styles.roomRow, selected && styles.roomRowActive)}
          >
            <div style={styles.roomRowMeta}>
              <span style={styles.roomRowTitle}>{room.game?.name || '이름 없는 게임'}</span>
              <span style={styles.roomRowSubtitle}>{subtitleParts.join(' · ')}</span>
            </div>
            <span style={styles.occupancyBadge}>
              {filled}/{total}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function SlotCard({
  slot,
  viewerSlot,
  viewerId,
  isHost,
  joinLoading,
  readyLoading,
  onJoin,
  onLeave,
  onReady,
  onKick,
}) {
  const occupied = Boolean(slot.occupantOwnerId)
  const viewerOwns = viewerSlot && viewerSlot.id === slot.id
  const ready = slot.occupantReady
  const heroName = slot.hero?.name || (occupied ? '이름 없는 캐릭터' : null)
  return (
    <div style={styles.slotCard}>
      <div>
        <div style={styles.slotRole}>{slot.role || '역할 미지정'}</div>
        {occupied ? (
          <div style={styles.slotHero}>{heroName}</div>
        ) : (
          <div style={styles.slotPlaceholder}>빈 슬롯</div>
        )}
      </div>
      {occupied && (
        <div style={styles.badgeList}>
          {ready ? <span style={styles.detailBadge}>준비 완료</span> : <span style={styles.detailBadge}>대기 중</span>}
        </div>
      )}
      <div style={styles.slotActions}>
        {!occupied && (
          <button
            type="button"
            style={mergeStyle(styles.primaryButton, joinLoading && styles.buttonDisabled)}
            onClick={async () => {
              const result = await onJoin(slot.id)
              if (!result?.ok && result?.error) {
                alert(result.error)
              }
            }}
            disabled={joinLoading}
          >
            참가하기
          </button>
        )}
        {viewerOwns && (
          <>
            <button
              type="button"
              style={mergeStyle(styles.secondaryButton, readyLoading && styles.buttonDisabled)}
              onClick={async () => {
                const result = await onReady(slot.id, !ready)
                if (!result?.ok && result?.error) {
                  alert(result.error)
                }
              }}
              disabled={readyLoading}
            >
              {ready ? '준비 해제' : '준비 완료'}
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={async () => {
                const result = await onLeave(slot.id)
                if (!result?.ok && result?.error) {
                  alert(result.error)
                }
              }}
            >
              나가기
            </button>
          </>
        )}
        {occupied && !viewerOwns && isHost && (
          <button
            type="button"
            style={styles.dangerButton}
            onClick={async () => {
              const result = await onKick(slot.id)
              if (!result?.ok && result?.error) {
                alert(result.error)
              }
            }}
          >
            강퇴
          </button>
        )}
      </div>
    </div>
  )
}

function RoomDetail({
  room,
  slots,
  viewerId,
  viewerSlot,
  hostInactive,
  loading,
  joinLoading,
  readyLoading,
  startLoading,
  onJoin,
  onLeave,
  onReady,
  onKick,
  onStart,
  onClaimHost,
}) {
  const isHost = room && viewerId && room.ownerId === viewerId
  const hasSlots = slots.length > 0
  const allFilled = hasSlots && slots.every((slot) => slot.occupantOwnerId)
  const allReady = hasSlots && allFilled && slots.every((slot) => slot.occupantReady)
  const startDisabled = !isHost || startLoading || !allReady
  const badges = []
  if (room?.code) badges.push(`코드 ${room.code}`)
  const modeConfig = getMatchModeConfig(room?.mode)
  if (modeConfig?.key === MATCH_MODE_KEYS.RANK_DUO) {
    badges.push('듀오')
  } else if (modeConfig?.key === MATCH_MODE_KEYS.CASUAL_MATCH) {
    badges.push('캐주얼')
  } else {
    badges.push('사설')
  }
  if (hasSlots) {
    badges.push(allFilled ? '모든 슬롯 채움' : '빈 슬롯 있음')
    if (allReady) badges.push('전원 준비 완료')
  }

  const showClaimHost = !isHost && viewerSlot && hostInactive

  return (
    <div style={mergeStyle(styles.card, styles.detailCard)}>
      <div style={styles.detailHeader}>
        <h3 style={styles.detailTitle}>{room?.game?.name || '선택된 방 없음'}</h3>
        <p style={styles.detailSubtitle}>{room?.game?.description || '게임 설명이 표시됩니다.'}</p>
        <div style={styles.detailMetaRow}>
          {badges.map((badge) => (
            <span key={badge} style={styles.detailBadge}>
              {badge}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h4 style={styles.sectionTitle}>슬롯 현황</h4>
        {loading && slots.length === 0 ? (
          <div style={styles.placeholder}>슬롯 정보를 불러오는 중입니다…</div>
        ) : (
          <div style={styles.slotGrid}>
            {slots.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                viewerSlot={viewerSlot}
                viewerId={viewerId}
                isHost={isHost}
                joinLoading={joinLoading}
                readyLoading={readyLoading}
                onJoin={onJoin}
                onLeave={onLeave}
                onReady={onReady}
                onKick={onKick}
              />
            ))}
          </div>
        )}
      </div>

      <div style={styles.slotActions}>
        <button
          type="button"
          style={mergeStyle(styles.primaryButton, startDisabled && styles.buttonDisabled)}
          onClick={async () => {
            const result = await onStart()
            if (!result?.ok && result?.error) {
              alert(result.error)
            }
          }}
          disabled={startDisabled}
        >
          {startLoading ? '시작 준비 중…' : '게임 시작'}
        </button>
        {showClaimHost ? (
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={async () => {
              const result = await onClaimHost()
              if (!result?.ok && result?.error) {
                alert(result.error)
              }
            }}
          >
            방장 권한 가져오기
          </button>
        ) : null}
      </div>
    </div>
  )
}

function RoomCreateCard({ mode, availableGames, loadRoleOptions, onCreate, createLoading }) {
  const [gameId, setGameId] = useState('')
  const [duoRole, setDuoRole] = useState('')
  const [roleOptions, setRoleOptions] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!gameId) {
      setRoleOptions([])
      setDuoRole('')
      return
    }
    let cancelled = false
    loadRoleOptions(gameId)
      .then((options) => {
        if (!cancelled) {
          setRoleOptions(options)
          if (options.length > 0) {
            setDuoRole(options[0].name)
          }
        }
      })
      .catch((cause) => {
        console.error('역할 정보를 불러오지 못했습니다:', cause)
        if (!cancelled) {
          setRoleOptions([])
          setDuoRole('')
          setError('역할 정보를 불러오지 못했습니다.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [gameId, loadRoleOptions])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!gameId) {
      setError('게임을 선택해 주세요.')
      return
    }
    if (mode === MATCH_MODE_KEYS.RANK_DUO && !duoRole) {
      setError('듀오 방은 역할군을 선택해야 합니다.')
      return
    }
    const result = await onCreate({ gameId, roomMode: mode, duoRole })
    if (!result?.ok && result?.error) {
      setError(result.error)
    } else {
      setError('')
    }
  }

  const duoHint = useMemo(() => {
    if (mode !== MATCH_MODE_KEYS.RANK_DUO) return null
    if (!duoRole) return '듀오 랭크는 같은 역할군 두 슬롯으로 구성됩니다.'
    const option = roleOptions.find((role) => role.name === duoRole)
    if (!option) return '듀오 랭크는 같은 역할군 두 슬롯으로 구성됩니다.'
    return `${duoRole} 역할의 활성 슬롯 ${option.count}개 중 2개만 사용됩니다.`
  }, [duoRole, mode, roleOptions])

  return (
    <div style={mergeStyle(styles.card, styles.detailCard)}>
      <h3 style={styles.sectionTitle}>새 방 만들기</h3>
      <form style={styles.createForm} onSubmit={handleSubmit}>
        <div style={styles.formRow}>
          <label style={styles.label} htmlFor="room-game-select">
            게임 선택
          </label>
          <select
            id="room-game-select"
            style={styles.select}
            value={gameId}
            onChange={(event) => setGameId(event.target.value)}
          >
            <option value="">게임을 선택해 주세요</option>
            {availableGames.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
        </div>
        {mode === MATCH_MODE_KEYS.RANK_DUO ? (
          <div style={styles.formRow}>
            <label style={styles.label} htmlFor="room-duo-role">
              역할군 선택
            </label>
            <select
              id="room-duo-role"
              style={styles.select}
              value={duoRole}
              onChange={(event) => setDuoRole(event.target.value)}
            >
              {roleOptions.map((role) => (
                <option key={role.name} value={role.name}>
                  {role.name} (활성 {role.count}개)
                </option>
              ))}
            </select>
            {duoHint ? <p style={styles.helperText}>{duoHint}</p> : null}
          </div>
        ) : (
          <p style={styles.helperText}>캐주얼/사설은 활성화된 모든 슬롯을 사용합니다.</p>
        )}
        {error ? <p style={styles.errorText}>{error}</p> : null}
        <button
          type="submit"
          style={mergeStyle(styles.primaryButton, createLoading && styles.buttonDisabled)}
          disabled={createLoading}
        >
          {createLoading ? '생성 중…' : '방 만들기'}
        </button>
      </form>
    </div>
  )
}

function JoinCodeCard({ onSubmit, loading }) {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')
    if (!code.trim()) {
      setMessage('방 코드를 입력해 주세요.')
      return
    }
    const result = await onSubmit(code.trim())
    if (!result?.ok && result?.error) {
      setMessage(result.error)
    } else {
      setMessage('방 정보를 불러왔습니다.')
    }
  }

  return (
    <div style={mergeStyle(styles.card, styles.detailCard)}>
      <h3 style={styles.sectionTitle}>방 코드로 참가</h3>
      <form style={styles.createForm} onSubmit={handleSubmit}>
        <div style={styles.joinCodeRow}>
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            style={styles.input}
            placeholder="예: A1B2C3"
            maxLength={6}
          />
          <button
            type="submit"
            style={mergeStyle(styles.secondaryButton, loading && styles.buttonDisabled)}
            disabled={loading}
          >
            {loading ? '찾는 중…' : '찾기'}
          </button>
        </div>
        {message ? <p style={styles.helperText}>{message}</p> : null}
      </form>
    </div>
  )
}

export default function RoomBrowserPanel({
  mode,
  setMode,
  rooms,
  roomLoading,
  roomError,
  selectedRoom,
  selectRoom,
  slots,
  roomDetailLoading,
  viewerId,
  viewerSlot,
  hostInactive,
  availableGames,
  createRoom,
  loadRoleOptions,
  joinSlot,
  leaveSlot,
  toggleReady,
  kickSlot,
  startRoom,
  claimHost,
  joinByCode,
  createLoading,
  joinLoading,
  readyLoading,
  startLoading,
  joinCodeLoading,
}) {
  const selectedRoomId = selectedRoom?.id || null
  const slotsToRender = useMemo(() => [...slots].sort((a, b) => a.index - b.index), [slots])

  return (
    <div style={styles.container}>
      <div style={styles.layout}>
        <ModeSelector mode={mode} onChange={setMode} loading={roomLoading} />
        <div style={styles.twoColumn}>
          <div style={styles.columns}>
            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>방 목록</h3>
              <RoomList
                rooms={rooms}
                selectedRoomId={selectedRoomId}
                onSelect={selectRoom}
                loading={roomLoading}
                error={roomError}
              />
            </div>
            <JoinCodeCard onSubmit={joinByCode} loading={joinCodeLoading} />
            <RoomCreateCard
              mode={mode}
              availableGames={availableGames}
              loadRoleOptions={loadRoleOptions}
              onCreate={createRoom}
              createLoading={createLoading}
            />
          </div>
          <div>
            {selectedRoom ? (
              <RoomDetail
                room={selectedRoom}
                slots={slotsToRender}
                viewerId={viewerId}
                viewerSlot={viewerSlot}
                hostInactive={hostInactive}
                loading={roomDetailLoading}
                joinLoading={joinLoading}
                readyLoading={readyLoading}
                startLoading={startLoading}
                onJoin={joinSlot}
                onLeave={leaveSlot}
                onReady={toggleReady}
                onKick={kickSlot}
                onStart={startRoom}
                onClaimHost={claimHost}
              />
            ) : (
              <div style={mergeStyle(styles.card, styles.placeholder)}>방을 선택하면 상세 정보가 표시됩니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

