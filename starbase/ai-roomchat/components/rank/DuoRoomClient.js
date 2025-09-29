'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import styles from './DuoRoomClient.module.css'

const STORAGE_PREFIX = 'duoRooms:'
const ACTION_OPTIONS = new Set(['create', 'search', 'code'])

function cleanupRooms(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((room) => ({
      ...room,
      members: Array.isArray(room?.members)
        ? room.members
            .filter((member) => member && member.userId)
            .map((member) => ({
              ...member,
              ready: Boolean(member.ready),
              isHost: Boolean(member.isHost),
            }))
        : [],
    }))
    .filter((room) => room.members.length > 0 && room.role)
}

function cloneRooms(list) {
  return list.map((room) => ({
    ...room,
    members: room.members.map((member) => ({ ...member })),
  }))
}

function loadRooms(gameId) {
  if (!gameId || typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${gameId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return cleanupRooms(Array.isArray(parsed) ? parsed : [])
  } catch (error) {
    console.warn('듀오 방 정보를 불러오지 못했습니다:', error)
    return []
  }
}

function saveRooms(gameId, rooms) {
  if (!gameId || typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${gameId}`,
      JSON.stringify(cleanupRooms(rooms)),
    )
  } catch (error) {
    console.warn('듀오 방 정보를 저장하지 못했습니다:', error)
  }
}

function generateCode(existingCodes) {
  const codes = new Set(existingCodes)
  while (true) {
    const value = Math.floor(100000 + Math.random() * 900000).toString()
    if (!codes.has(value)) {
      return value
    }
  }
}

function formatName(hero, user) {
  if (hero?.name) return hero.name
  if (user?.email) return user.email
  if (user?.id) return `사용자 ${user.id.slice(0, 6)}`
  return '미지정 플레이어'
}

function resolveInitialAction(initial) {
  if (ACTION_OPTIONS.has(initial)) return initial
  return 'create'
}

function RoleBadge({ label, count }) {
  return (
    <span className={styles.roleBadge}>
      {label} · 정원 {count}명
    </span>
  )
}

export default function DuoRoomClient({
  game,
  roleDetails,
  roles,
  myHero,
  myEntry,
  user,
  initialAction,
  onExit,
  onLaunch,
}) {
  const gameId = game?.id || ''
  const [rooms, setRooms] = useState([])
  const [view, setView] = useState(resolveInitialAction(initialAction))
  const [selectedRole, setSelectedRole] = useState('')
  const [codeValue, setCodeValue] = useState('')
  const [error, setError] = useState('')

  const lockedRole = useMemo(() => {
    if (!myEntry?.role) return ''
    const trimmed = String(myEntry.role).trim()
    return trimmed
  }, [myEntry?.role])

  useEffect(() => {
    if (!gameId) return
    const initial = loadRooms(gameId)
    setRooms(initial)
    if (initial.length) {
      saveRooms(gameId, initial)
    }
  }, [gameId])

  const updateRooms = useCallback(
    (mutator) => {
      setRooms((prev) => {
        const base = cloneRooms(cleanupRooms(prev))
        const next = cleanupRooms(mutator(base))
        saveRooms(gameId, next)
        return next
      })
    },
    [gameId],
  )

  const baseRoleCapacities = useMemo(() => {
    const entries = new Map()
    if (Array.isArray(roleDetails) && roleDetails.length) {
      roleDetails.forEach((role) => {
        const count = Number(role.slot_count ?? role.slotCount)
        entries.set(role.name, Math.max(2, Number.isFinite(count) ? count : 2))
      })
    } else if (Array.isArray(roles) && roles.length) {
      roles.forEach((role) => {
        const name =
          typeof role === 'string'
            ? role.trim()
            : typeof role?.name === 'string'
              ? role.name.trim()
              : ''
        if (!name) return
        if (!entries.has(name)) entries.set(name, 2)
      })
    }
    if (!entries.size) {
      entries.set('공격', 2)
      entries.set('수비', 2)
    }
    return entries
  }, [roleDetails, roles])

  const roleCapacities = useMemo(() => {
    if (!lockedRole) return baseRoleCapacities
    const resolved = new Map()
    if (baseRoleCapacities.has(lockedRole)) {
      resolved.set(lockedRole, baseRoleCapacities.get(lockedRole))
    } else {
      resolved.set(lockedRole, 2)
    }
    return resolved
  }, [baseRoleCapacities, lockedRole])

  useEffect(() => {
    if (lockedRole) {
      if (selectedRole !== lockedRole) {
        setSelectedRole(lockedRole)
      }
      return
    }

    if (selectedRole) return

    const first = roleCapacities.keys().next()
    if (!first.done) {
      setSelectedRole(first.value)
    }
  }, [lockedRole, roleCapacities, selectedRole])

  const viewerRoom = useMemo(() => {
    if (!user?.id) return null
    return rooms.find((room) => room.members.some((member) => member.userId === user.id)) || null
  }, [rooms, user?.id])

  const viewerMember = useMemo(() => {
    if (!viewerRoom || !user?.id) return null
    return viewerRoom.members.find((member) => member.userId === user.id) || null
  }, [viewerRoom, user?.id])

  const capacity = selectedRole ? roleCapacities.get(selectedRole) || 2 : 2
  const lockedCapacity = lockedRole ? roleCapacities.get(lockedRole) || 2 : null

  useEffect(() => {
    if (viewerRoom) {
      setView('room')
    } else if (!ACTION_OPTIONS.has(view)) {
      setView('create')
    }
  }, [viewerRoom, view])

  const handleCreateRoom = useCallback(() => {
    if (!gameId || !user?.id) {
      setError('로그인이 필요합니다.')
      return
    }
    if (!myHero?.id) {
      setError('먼저 사용할 캐릭터를 선택해 주세요.')
      return
    }
    if (!selectedRole) {
      setError('역할을 선택해 주세요.')
      return
    }
    const hostName = formatName(myHero, user)
    const cap = Math.max(2, capacity)

    updateRooms((prev) => {
      const existingCodes = prev.map((room) => room.code)
      const code = generateCode(existingCodes)
      const withoutViewer = prev
        .map((room) => ({
          ...room,
          members: room.members.filter((member) => member.userId !== user.id),
        }))
        .filter((room) => room.members.length > 0)

      const roomId = `duo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const nextRoom = {
        id: roomId,
        gameId,
        role: selectedRole,
        capacity: cap,
        hostId: user.id,
        hostName,
        code,
        createdAt: Date.now(),
        members: [
          {
            userId: user.id,
            heroId: myHero.id,
            heroName: hostName,
            ready: false,
            isHost: true,
          },
        ],
      }
      return [...withoutViewer, nextRoom]
    })
    setError('')
    setView('room')
  }, [capacity, gameId, myHero, selectedRole, updateRooms, user])

  const handleJoinRoom = useCallback(
    (roomId) => {
      if (!gameId || !user?.id) {
        setError('로그인이 필요합니다.')
        return
      }
      if (!myHero?.id) {
        setError('먼저 사용할 캐릭터를 선택해 주세요.')
        return
      }
      updateRooms((prev) => {
        const withoutViewer = prev
          .map((room) => ({
            ...room,
            members: room.members.filter((member) => member.userId !== user.id),
          }))
          .filter((room) => room.members.length > 0)

        return withoutViewer.map((room) => {
          if (room.id !== roomId) return room
          if (room.members.length >= room.capacity) return room
          return {
            ...room,
            members: [
              ...room.members,
              {
                userId: user.id,
                heroId: myHero.id,
                heroName: formatName(myHero, user),
                ready: false,
                isHost: false,
              },
            ],
          }
        })
      })
      setError('')
      setView('room')
    },
    [gameId, myHero, updateRooms, user],
  )

  const handleJoinByCode = useCallback(() => {
    if (!codeValue.trim()) {
      setError('방 코드를 입력해 주세요.')
      return
    }
    const normalized = codeValue.trim()
    const target = rooms.find((room) => room.code === normalized)
    if (!target) {
      setError('해당 코드를 가진 방을 찾을 수 없습니다.')
      return
    }
    if (target.members.length >= target.capacity) {
      setError('이미 정원이 가득 찬 방입니다.')
      return
    }
    handleJoinRoom(target.id)
    setCodeValue('')
  }, [codeValue, handleJoinRoom, rooms])

  const handleReady = useCallback(() => {
    if (!viewerRoom || !user?.id) return
    updateRooms((prev) =>
      prev.map((room) => {
        if (room.id !== viewerRoom.id) return room
        return {
          ...room,
          members: room.members.map((member) =>
            member.userId === user.id ? { ...member, ready: true } : member,
          ),
        }
      }),
    )
  }, [updateRooms, user?.id, viewerRoom])

  const handleLeave = useCallback(() => {
    if (!viewerRoom || !user?.id) return
    updateRooms((prev) =>
      prev
        .map((room) => {
          if (room.id !== viewerRoom.id) return room
          if (room.hostId === user.id) {
            return null
          }
          return {
            ...room,
            members: room.members.filter((member) => member.userId !== user.id),
          }
        })
        .filter(Boolean),
    )
    setView('create')
  }, [updateRooms, user?.id, viewerRoom])

  const handleKick = useCallback(
    (targetId) => {
      if (!viewerRoom || viewerRoom.hostId !== user?.id) return
      updateRooms((prev) =>
        prev
          .map((room) => {
            if (room.id !== viewerRoom.id) return room
            return {
              ...room,
              members: room.members.filter((member) => member.userId !== targetId),
            }
          })
          .filter((room) => room.members.length > 0),
      )
    },
    [updateRooms, user?.id, viewerRoom],
  )

  const handleStart = useCallback(() => {
    if (!viewerRoom || viewerRoom.hostId !== user?.id) return
    const allReady = viewerRoom.members.length === viewerRoom.capacity && viewerRoom.members.every((member) => member.ready)
    if (!allReady) {
      setError('모든 인원이 준비 완료일 때만 시작할 수 있습니다.')
      return
    }
    onLaunch?.({ room: viewerRoom })
    updateRooms((prev) => prev.filter((room) => room.id !== viewerRoom.id))
  }, [onLaunch, updateRooms, user?.id, viewerRoom])

  const handleResetError = useCallback(() => setError(''), [])

  const joinableRooms = useMemo(() => {
    if (!selectedRole) return []
    return rooms
      .filter((room) => room.role === selectedRole)
      .filter((room) => room.members.length < room.capacity)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  }, [rooms, selectedRole])

  const allReady = viewerRoom
    ? viewerRoom.members.length === viewerRoom.capacity &&
      viewerRoom.members.every((member) => member.ready)
    : false

  const canLeave = viewerMember ? !viewerMember.ready : true

  const heroName = myHero?.name || '선택된 캐릭터 없음'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={onExit}>
          ← 메인 룸으로 돌아가기
        </button>
        <div>
          <p className={styles.gameName}>{game?.name || '랭크 게임'}</p>
          <h1 className={styles.title}>듀오 랭크 팀 편성</h1>
          <p className={styles.subtitle}>
            같은 역할군으로 구성된 팀을 만들어 게임을 시작하세요. 준비 완료 후에는 방을 나갈 수 없습니다.
          </p>
        </div>
      </header>

      {!myHero?.id ? (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>캐릭터가 필요합니다</h2>
          <p className={styles.sectionText}>
            듀오 랭크에 참가하려면 먼저 사용할 캐릭터를 선택해야 합니다. 로스터에서 캐릭터를 고른 뒤 다시 시도해 주세요.
          </p>
          <button type="button" className={styles.primaryButton} onClick={onExit}>
            캐릭터 선택하러 가기
          </button>
        </section>
      ) : null}

      {error ? (
        <div className={styles.errorBanner} role="alert">
          <span>{error}</span>
          <button type="button" onClick={handleResetError} aria-label="오류 닫기">
            ✕
          </button>
        </div>
      ) : null}

      {!viewerRoom && myHero?.id ? (
        lockedRole ? (
          <section className={styles.card}>
            <div className={styles.selectorHeader}>
              <h2 className={styles.sectionTitle}>고정된 역할</h2>
              <p className={styles.sectionHint}>선택된 캐릭터: {heroName}</p>
            </div>
            <p className={styles.sectionText}>
              이미 <strong>{lockedRole}</strong> 역할로 등록되어 있습니다. 듀오 방은 같은 역할군으로만 구성됩니다.
            </p>
            <div className={styles.roleGroup}>
              <button
                type="button"
                className={`${styles.roleButton} ${styles.roleButtonActive}`}
                disabled
              >
                <span className={styles.roleName}>{lockedRole}</span>
                <RoleBadge label="필요 인원" count={lockedCapacity || capacity} />
              </button>
            </div>
            <p className={styles.sectionHint}>역할은 메인 룸 참여 시점에 고정되며 여기에서 변경할 수 없습니다.</p>
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.selectorHeader}>
              <h2 className={styles.sectionTitle}>역할 선택</h2>
              <p className={styles.sectionHint}>선택된 캐릭터: {heroName}</p>
            </div>
            <div className={styles.roleGroup}>
              {Array.from(roleCapacities.entries()).map(([roleName, count]) => {
                const active = selectedRole === roleName
                return (
                  <button
                    key={roleName}
                    type="button"
                    className={`${styles.roleButton} ${active ? styles.roleButtonActive : ''}`}
                    onClick={() => setSelectedRole(roleName)}
                  >
                    <span className={styles.roleName}>{roleName}</span>
                    <RoleBadge label="필요 인원" count={count} />
                  </button>
                )
              })}
            </div>
          </section>
        )
      ) : null}

      {!viewerRoom && myHero?.id ? (
        <section className={styles.card}>
          <div className={styles.switchRow}>
            <button
              type="button"
              className={`${styles.switchButton} ${view === 'create' ? styles.switchButtonActive : ''}`}
              onClick={() => setView('create')}
            >
              방 만들기
            </button>
            <button
              type="button"
              className={`${styles.switchButton} ${view === 'search' ? styles.switchButtonActive : ''}`}
              onClick={() => setView('search')}
            >
              방 검색
            </button>
            <button
              type="button"
              className={`${styles.switchButton} ${view === 'code' ? styles.switchButtonActive : ''}`}
              onClick={() => setView('code')}
            >
              방 코드 입력
            </button>
          </div>

          {view === 'create' ? (
            <div className={styles.panelBody}>
              <p className={styles.sectionText}>
                선택한 역할 <strong>{selectedRole}</strong>로 팀을 만들고, 정원 {capacity}명 중 1명을 당신이 차지합니다.
              </p>
              <button type="button" className={styles.primaryButton} onClick={handleCreateRoom}>
                새 듀오 방 만들기
              </button>
            </div>
          ) : null}

          {view === 'search' ? (
            <div className={styles.panelBody}>
              <p className={styles.sectionText}>
                {selectedRole} 역할군 방을 찾고 있습니다. 남은 자리가 있는 방만 표시됩니다.
              </p>
              {joinableRooms.length === 0 ? (
                <p className={styles.emptyText}>조건에 맞는 방이 없습니다. 직접 방을 만들어 보세요.</p>
              ) : (
                <ul className={styles.roomList}>
                  {joinableRooms.map((room) => (
                    <li key={room.id} className={styles.roomItem}>
                      <div>
                        <p className={styles.roomTitle}>{room.hostName || '방장'}</p>
                        <p className={styles.roomMeta}>
                          코드 {room.code} · {room.members.length}/{room.capacity}명 대기 중
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleJoinRoom(room.id)}
                      >
                        참여하기
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {view === 'code' ? (
            <div className={styles.panelBody}>
              <label className={styles.label} htmlFor="duo-room-code">
                방 코드 입력
              </label>
              <input
                id="duo-room-code"
                className={styles.input}
                value={codeValue}
                onChange={(event) => setCodeValue(event.target.value.replace(/[^0-9]/g, ''))}
                placeholder="예: 123456"
                maxLength={6}
              />
              <button type="button" className={styles.primaryButton} onClick={handleJoinByCode}>
                코드로 참가하기
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {viewerRoom ? (
        <section className={styles.card}>
          <div className={styles.roomHeader}>
            <div>
              <h2 className={styles.sectionTitle}>내 듀오 방</h2>
              <p className={styles.sectionText}>
                역할 {viewerRoom.role} · 코드 {viewerRoom.code} · {viewerRoom.members.length}/{viewerRoom.capacity}명
              </p>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={handleLeave} disabled={!canLeave}>
              방 나가기
            </button>
          </div>
          <ul className={styles.memberList}>
            {viewerRoom.members.map((member) => (
              <li key={member.userId} className={styles.memberItem}>
                <div>
                  <p className={styles.memberName}>{member.heroName || '플레이어'}</p>
                  <p className={styles.memberMeta}>{member.isHost ? '방장' : '참가자'}</p>
                </div>
                <div className={styles.memberActions}>
                  <span className={`${styles.readyBadge} ${member.ready ? styles.readyActive : styles.readyWaiting}`}>
                    {member.ready ? '준비 완료' : '대기 중'}
                  </span>
                  {viewerRoom.hostId === user?.id && !member.isHost ? (
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() => handleKick(member.userId)}
                    >
                      추방
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.roomActions}>
            {!viewerMember?.ready ? (
              <button type="button" className={styles.primaryButton} onClick={handleReady}>
                준비 완료
              </button>
            ) : (
              <span className={styles.readyHint}>준비 완료 상태에서는 방을 떠날 수 없습니다.</span>
            )}
            {viewerRoom.hostId === user?.id ? (
              <button
                type="button"
                className={styles.startButton}
                onClick={handleStart}
                disabled={!allReady}
              >
                모두 준비 완료, 게임 시작
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}

