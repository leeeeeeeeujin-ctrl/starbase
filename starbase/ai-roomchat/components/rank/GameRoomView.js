// components/rank/GameRoomView.js
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'

import ParticipantCard from './ParticipantCard'
import styles from './GameRoomView.module.css'

const RULE_OPTION_METADATA = {
  nerf_insight: {
    label: '통찰 너프',
    description: '분석으로 상황을 뒤집는 선택지를 약화시켜 전투를 더욱 직관적으로 만듭니다.',
  },
  ban_kindness: {
    label: '약자 배려 금지',
    description: '도덕적인 배려나 선행으로 승패가 바뀌지 않도록 막습니다.',
  },
  nerf_peace: {
    label: '평화 너프',
    description: '감정적 타협보다는 실제 전투력을 기준으로 판정하도록 유도합니다.',
  },
  nerf_ultimate_injection: {
    label: '궁극적 승리/인젝션 감지',
    description: '승패 조건을 뒤흔드는 인젝션이 감지되면 즉시 차단합니다.',
  },
  fair_power_balance: {
    label: '공정한 파워 밸런스',
    description: '능력 사용과 서사를 균형 있게 유지해 과도한 역전이 일어나지 않도록 합니다.',
  },
}

function interpretRulesShape(value) {
  if (!value) return { type: 'empty' }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return { type: 'empty' }
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { type: 'object', value: parsed }
      }
    } catch (error) {
      // not JSON, fall through to plain text rendering
    }
    return { type: 'text', value: trimmed }
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return { type: 'object', value }
  }

  return { type: 'unknown', value }
}

function buildRuleEntries(ruleObject) {
  const entries = []

  Object.entries(RULE_OPTION_METADATA).forEach(([key, meta]) => {
    if (!ruleObject[key]) return
    entries.push({
      key,
      label: meta.label,
      description: meta.description,
    })
  })

  const limitValue = Number(ruleObject.char_limit)
  const limit = Number.isFinite(limitValue) ? limitValue : 0
  if (limit > 0) {
    entries.push({
      key: 'char_limit',
      label: '응답 길이 제한',
      description: `${limit.toLocaleString()}자 이내로 답변하도록 제한합니다.`,
    })
  }

  Object.keys(ruleObject).forEach((key) => {
    if (key in RULE_OPTION_METADATA) return
    if (key === 'char_limit') return
    const raw = ruleObject[key]
    if (!raw) return
    const hint = typeof raw === 'string' ? raw : JSON.stringify(raw)
    entries.push({
      key,
      label: key,
      description: hint,
    })
  })

  return entries
}

function renderRules(rules) {
  const interpreted = interpretRulesShape(rules)

  if (interpreted.type === 'empty') {
    return null
  }

  if (interpreted.type === 'object') {
    const entries = buildRuleEntries(interpreted.value)
    if (!entries.length) {
      try {
        const pretty = JSON.stringify(interpreted.value, null, 2)
        return <pre className={styles.rulesCode}>{pretty}</pre>
      } catch (error) {
        return null
      }
    }

    return (
      <ul className={styles.rulesList}>
        {entries.map(({ key, label, description }) => (
          <li key={key} className={styles.rulesItem}>
            <span className={styles.rulesItemLabel}>{label}</span>
            {description && <p className={styles.rulesItemDescription}>{description}</p>}
          </li>
        ))}
      </ul>
    )
  }

  if (interpreted.type === 'text') {
    const lines = interpreted.value.split(/\n+/).map((line) => line.trim()).filter(Boolean)
    return (
      <div className={styles.rulesTextBlock}>
        {lines.map((line, index) => (
          <p key={`${line}-${index}`} className={styles.rulesText}>
            {line}
          </p>
        ))}
      </div>
    )
  }

  try {
    const pretty = JSON.stringify(interpreted.value, null, 2)
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
  participants = [],
  roles = [],
  pickRole,
  onChangeRole,
  alreadyJoined = false,
  canStart = false,
  myHero = null,
  myEntry = null,
  onBack,
  onJoin,
  onStart,
  onOpenLeaderboard,
  onDelete,
  isOwner = false,
  deleting = false,
  startDisabled = false,
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
            <span className={canStart ? styles.ready : ''}>
              {canStart ? '매칭 준비 완료' : '함께할 참가자를 기다리는 중'}
            </span>
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
                <p className={styles.cardHint}>캐릭터 배경이 방 분위기를 꾸며줍니다.</p>
              </div>
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
                <p className={styles.cardHint}>참여 후에는 비슷한 점수대끼리 자동으로 팀이 구성됩니다.</p>
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
              {canStart
                ? '게임을 시작하면 비슷한 점수의 참가자들이 자동으로 선발됩니다.'
                : '최소 두 명 이상이 모이면 비슷한 점수대끼리 경기 준비가 완료됩니다.'}
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
