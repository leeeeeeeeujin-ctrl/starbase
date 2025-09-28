// components/rank/GameRoomView.js
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'

import ParticipantCard from './ParticipantCard'
import styles from './GameRoomView.module.css'

function renderRules(rules) {
  if (!rules) return null

  if (typeof rules === 'string') {
    const trimmed = rules.trim()
    if (!trimmed) return null
    return <p className={styles.rulesText}>{trimmed}</p>
  }

  try {
    const pretty = JSON.stringify(rules, null, 2)
    if (!pretty) return null
    return <pre className={styles.rulesCode}>{pretty}</pre>
  } catch (error) {
    return null
  }
}

function formatDate(value) {
  if (!value) return ''
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString()
  } catch (error) {
    return ''
  }
}

export default function GameRoomView({
  game,
  requiredSlots = 0,
  participants = [],
  roles = [],
  pickRole,
  onChangeRole,
  alreadyJoined = false,
  canStart = false,
  myHero = null,
  myEntry = null,
  onBack,
  onOpenHeroPicker,
  onJoin,
  onStart,
  onOpenLeaderboard,
  onDelete,
  isOwner = false,
  deleting = false,
  startDisabled = false,
  historyText = '',
  onChatSend,
}) {
  const [joinLoading, setJoinLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)

  const normalizedRoles = useMemo(() => {
    if (!Array.isArray(roles)) return []
    return roles.filter((role) => typeof role === 'string' && role.trim().length > 0)
  }, [roles])

  const participantsByRole = useMemo(() => {
    const base = new Map(normalizedRoles.map((role) => [role, 0]))
    participants.forEach((participant) => {
      const key = participant?.role
      if (!key) return
      base.set(key, (base.get(key) || 0) + 1)
    })

    const extras = []
    participants.forEach((participant) => {
      const key = participant?.role
      if (!key) return
      if (!base.has(key) && !extras.some((extra) => extra.name === key)) {
        const count = participants.filter((p) => p.role === key).length
        extras.push({ name: key, count })
      }
    })

    return [
      ...Array.from(base.entries()).map(([name, count]) => ({ name, count })),
      ...extras,
    ]
  }, [normalizedRoles, participants])

  const fallbackRole = normalizedRoles[0] || (participantsByRole[0]?.name ?? '')
  const currentRole = pickRole || fallbackRole

  useEffect(() => {
    if (!pickRole && fallbackRole) {
      onChangeRole?.(fallbackRole)
    }
  }, [fallbackRole, onChangeRole, pickRole])

  const roster = Array.isArray(participants) ? participants : []
  const readyCount = roster.length
  const needsCount = requiredSlots || 0
  const hasCapacityGoal = needsCount > 0
  const readyForStart = hasCapacityGoal ? readyCount >= needsCount : readyCount > 0

  const backgroundImage = myHero?.background_url || game?.image_url || null
  const coverImage = game?.image_url || null

  const heroAbilities = useMemo(() => {
    if (!myHero) return []
    return [myHero.ability1, myHero.ability2, myHero.ability3, myHero.ability4].filter(Boolean)
  }, [myHero])

  const createdAt = formatDate(game?.created_at)
  const updatedAt = formatDate(game?.updated_at)

  if (!game) {
    return (
      <div className={styles.room}>
        <div className={styles.backdropFallback} />
        <div className={styles.overlay} />
        <div className={styles.content}>
          <div className={styles.loadingCard}>게임 정보를 불러오는 중입니다…</div>
        </div>
      </div>
    )
  }

  const handleJoinClick = async () => {
    if (!onJoin || alreadyJoined || joinLoading) return
    setJoinLoading(true)
    try {
      await onJoin()
    } finally {
      setJoinLoading(false)
    }
  }

  const handleChatSubmit = async (event) => {
    event?.preventDefault?.()
    const value = chatInput.trim()
    if (!value || !onChatSend) return
    setChatSending(true)
    try {
      const result = await onChatSend(value)
      if (result !== false) {
        setChatInput('')
      }
    } finally {
      setChatSending(false)
    }
  }

  return (
    <div className={styles.room}>
      {backgroundImage ? (
        <div
          className={styles.backdrop}
          style={{ backgroundImage: `url(${backgroundImage})` }}
          aria-hidden
        />
      ) : (
        <div className={styles.backdropFallback} />
      )}
      <div className={styles.overlay} />

      <div className={styles.content}>
        <header className={styles.topBar}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            ← 로비로
          </button>
          <div className={styles.capacity}>
            <span>참여 {readyCount}명</span>
            {hasCapacityGoal && (
              <span className={readyForStart ? styles.ready : ''}>
                필요 {needsCount}명
              </span>
            )}
          </div>
        </header>

        <section className={styles.heroSection}>
          <div className={styles.heroMeta}>
            <div className={styles.gameBadge}>랭크 게임</div>
            <h1 className={styles.title}>{game.name || '이름 없는 게임'}</h1>
            <p className={styles.subtitle}>
              {game.description?.trim() || '소개 문구가 아직 준비되지 않았습니다.'}
            </p>
            <div className={styles.metaRow}>
              {game.realtime_match && <span className={styles.metaChip}>실시간 매칭</span>}
              {createdAt && <span className={styles.metaChip}>등록 {createdAt}</span>}
              {updatedAt && <span className={styles.metaChip}>갱신 {updatedAt}</span>}
              <button type="button" className={styles.linkButton} onClick={onOpenLeaderboard}>
                리더보드 보기
              </button>
            </div>
          </div>

          <div className={styles.coverFrame}>
            {coverImage ? (
              <Image
                src={coverImage}
                alt={game.name || '게임 대표 이미지'}
                width={640}
                height={360}
                className={styles.cover}
              />
            ) : (
              <div className={styles.coverPlaceholder}>대표 이미지가 등록되지 않았습니다.</div>
            )}
          </div>
        </section>

        <section className={styles.summaryGrid}>
          <article className={styles.card}>
            <header className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>내 캐릭터</h2>
                <p className={styles.cardHint}>참여 전에 캐릭터를 골라주세요.</p>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={onOpenHeroPicker}>
                캐릭터 선택
              </button>
            </header>

            {myHero ? (
              <div className={styles.heroBody}>
                <div className={styles.heroPortrait}>
                  {myHero.image_url ? (
                    <Image
                      src={myHero.image_url}
                      alt={myHero.name || '선택한 캐릭터'}
                      width={128}
                      height={128}
                    />
                  ) : (
                    <div className={styles.heroPortraitFallback}>이미지 없음</div>
                  )}
                </div>
                <div className={styles.heroInfo}>
                  <strong className={styles.heroName}>{myHero.name}</strong>
                  {myEntry?.role && (
                    <span className={styles.heroRole}>담당 역할: {myEntry.role}</span>
                  )}
                  <p className={styles.heroDescription}>
                    {myHero.description || '설명 없는 캐릭터입니다.'}
                  </p>
                  {heroAbilities.length > 0 && (
                    <ul className={styles.abilityList}>
                      {heroAbilities.map((ability, index) => (
                        <li key={index} className={styles.abilityItem}>
                          <span className={styles.abilityLabel}>#{index + 1}</span>
                          <span>{ability}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.heroEmpty}>캐릭터가 선택되지 않았습니다.</div>
            )}
          </article>

          <article className={styles.card}>
            <header className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>역할 선택</h2>
                <p className={styles.cardHint}>참여할 역할을 고르고 팀에 합류하세요.</p>
              </div>
            </header>

            {participantsByRole.length > 0 ? (
              <div className={styles.roleGrid}>
                {participantsByRole.map(({ name, count }) => {
                  const isPicked = currentRole === name
                  const isMine = myEntry?.role === name
                  const highlight = isPicked || isMine
                  const label = `${count}명 참여 중`
                  return (
                    <button
                      key={name}
                      type="button"
                      className={[
                        styles.roleChip,
                        highlight ? styles.roleChipActive : '',
                        alreadyJoined && !isMine ? styles.roleChipDisabled : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onChangeRole?.(name)}
                      disabled={alreadyJoined && !isMine}
                    >
                      <span className={styles.roleName}>{name}</span>
                      <span className={styles.roleCount}>{label}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className={styles.heroEmpty}>선택 가능한 역할 정보가 없습니다.</div>
            )}

            <div className={styles.joinActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleJoinClick}
                disabled={alreadyJoined || joinLoading || !currentRole}
              >
                {alreadyJoined ? '참여 완료됨' : joinLoading ? '참여 중…' : `${currentRole || '역할'}로 참여하기`}
              </button>
              {isOwner && (
                <button
                  type="button"
                  className={styles.ownerStartButton}
                  onClick={onStart}
                  disabled={startDisabled}
                >
                  게임 시작
                </button>
              )}
            </div>

            <p className={styles.capacityHint}>
              {hasCapacityGoal
                ? readyForStart
                  ? '시작 조건을 만족했습니다. 게임을 시작할 수 있어요.'
                  : `게임 시작까지 ${needsCount - readyCount}명 더 필요합니다.`
                : '정원 정보가 없어 현재 참여 인원으로 즉시 시작할 수 있습니다.'}
            </p>

            {isOwner && (
              <div className={styles.ownerActions}>
                <button
                  type="button"
                  className={styles.subtleButton}
                  onClick={onDelete}
                  disabled={deleting}
                >
                  {deleting ? '방 삭제 중…' : '방 삭제하기'}
                </button>
              </div>
            )}
          </article>
        </section>

        <section className={styles.rosterSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>참가자 명단</h2>
            <span className={styles.sectionBadge}>{readyCount}명</span>
          </div>

          {roster.length === 0 ? (
            <div className={styles.emptyCard}>아직 참가자가 없습니다. 첫 번째로 참여해보세요!</div>
          ) : (
            <div className={styles.rosterGrid}>
              {roster.map((participant) => (
                <ParticipantCard key={participant.id || participant.hero_id} p={participant} />
              ))}
            </div>
          )}
        </section>

        <section className={styles.rulesSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>게임 룰</h2>
          </div>
          {renderRules(game.rules) || (
            <div className={styles.emptyCard}>룰 정보가 준비 중입니다.</div>
          )}
        </section>

        <section className={styles.historySection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>최근 기록</h2>
          </div>
          {historyText ? (
            <pre className={styles.historyLog}>{historyText}</pre>
          ) : (
            <div className={styles.emptyCard}>아직 공유된 히스토리가 없습니다.</div>
          )}
        </section>

        <section className={styles.chatSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>공용 채팅</h2>
            {myHero?.name && (
              <span className={styles.sectionHint}>내 캐릭터: {myHero.name}</span>
            )}
          </div>

          <form className={styles.chatForm} onSubmit={handleChatSubmit}>
            <textarea
              className={styles.chatInput}
              placeholder={alreadyJoined ? '팀원들과 전략을 상의해보세요.' : '참여 후 채팅을 시작할 수 있습니다.'}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              disabled={!alreadyJoined || chatSending}
              rows={3}
            />
            <div className={styles.chatActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!alreadyJoined || chatSending || !chatInput.trim()}
              >
                {chatSending ? '전송 중…' : '메시지 보내기'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
