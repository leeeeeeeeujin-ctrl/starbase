// components/rank/GameRoomView.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  brawl_rule: {
    getEntry(value) {
      if (!value) return null
      if (value === 'allow-brawl') {
        return {
          label: '난입 허용',
          description:
            '전투 중 같은 역할군에서 탈락자가 발생하면 비슷한 점수대의 다른 유저가 즉시 합류해 흐름을 이어갑니다.',
        }
      }
      const hint = typeof value === 'string' ? value : JSON.stringify(value)
      return {
        label: '난입 규칙',
        description: hint,
      }
    },
  },
  end_condition_variable: {
    label: '게임 종료 조건 변수',
    description(value) {
      if (!value) return '게임 종료 조건이 아직 지정되지 않았습니다.'
      return `조건: ${value}`
    },
  },
}

const TABS = [
  { key: 'main', label: '메인 룸' },
  { key: 'hero', label: '캐릭터 정보' },
  { key: 'ranking', label: '랭킹' },
]

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
    if (typeof meta.getEntry === 'function') {
      const entry = meta.getEntry(ruleObject[key], ruleObject)
      if (entry) {
        entries.push({ key, ...entry })
      }
      return
    }

    const resolvedDescription =
      typeof meta.description === 'function' ? meta.description(ruleObject[key], ruleObject) : meta.description

    entries.push({
      key,
      label: meta.label,
      description: resolvedDescription,
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
    const lines = interpreted.value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
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

function ensureArray(value) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return []
}

function buildBattleLine(battle, heroNameMap) {
  const attackers = ensureArray(battle.attacker_hero_ids).map((id) => heroNameMap.get(id) || '알 수 없음')
  const defenders = ensureArray(battle.defender_hero_ids).map((id) => heroNameMap.get(id) || '알 수 없음')
  const createdAt = formatDate(battle.created_at)
  const score = Number.isFinite(Number(battle.score_delta)) && Number(battle.score_delta) !== 0
    ? `${Number(battle.score_delta) > 0 ? '+' : ''}${Number(battle.score_delta)}`
    : null
  const parts = []
  if (createdAt) parts.push(createdAt)
  if (attackers.length || defenders.length) {
    const matchUp = `${attackers.length ? attackers.join(', ') : '공격'} vs ${
      defenders.length ? defenders.join(', ') : '방어'
    }`
    parts.push(matchUp)
  }
  if (battle.result) parts.push(battle.result)
  if (score) parts.push(`${score}점`)
  return {
    id: battle.id,
    text: parts.join(' · '),
    result: battle.result || '',
  }
}

function formatNumber(value) {
  if (value === null || value === undefined) return '0'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return numeric.toLocaleString()
}

function formatWinRate(value) {
  if (value === null || value === undefined) return '기록 없음'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '기록 없음'
  const ratio = numeric > 1 ? numeric : numeric * 100
  const rounded = Math.round(ratio * 10) / 10
  return `${rounded}%`
}

function groupByRole(participants = []) {
  const map = new Map()
  participants.forEach((participant) => {
    const role = participant?.role || '역할 미정'
    if (!map.has(role)) {
      map.set(role, [])
    }
    map.get(role).push(participant)
  })
  return map
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
  recentBattles = [],
}) {
  const [joinLoading, setJoinLoading] = useState(false)
  const [visibleHeroLogs, setVisibleHeroLogs] = useState(10)
  const [activeTab, setActiveTab] = useState(TABS[0].key)
  const touchStartRef = useRef(null)

  const resolvedActiveIndex = useMemo(() => {
    const index = TABS.findIndex((tab) => tab.key === activeTab)
    return index >= 0 ? index : 0
  }, [activeTab])

  useEffect(() => {
    const safeKey = TABS[resolvedActiveIndex]?.key ?? TABS[0].key
    if (activeTab !== safeKey) {
      setActiveTab(safeKey)
    }
  }, [activeTab, resolvedActiveIndex])

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

  const entryBackdrop = myEntry?.hero?.background_url || null

  const heroBackdrop = useMemo(() => {
    if (myHero?.background_url) return myHero.background_url
    if (entryBackdrop) return entryBackdrop
    const participantBackdrop = participants.find((participant) => participant?.hero?.background_url)
    return participantBackdrop?.hero?.background_url || null
  }, [entryBackdrop, myHero?.background_url, participants])

  const backgroundImage = heroBackdrop || game?.image_url || null
  const coverImage = game?.image_url || null

  const heroAbilities = useMemo(() => {
    if (!myHero) return []
    return [myHero.ability1, myHero.ability2, myHero.ability3, myHero.ability4].filter(Boolean)
  }, [myHero])

  const hasHeroEntry = Boolean(myEntry)

  const heroInfoStages = useMemo(() => {
    const stages = ['profile']
    if (hasHeroEntry) {
      stages.push('stats')
    }
    if (heroAbilities.length > 0) {
      stages.push('abilities')
    }
    return stages
  }, [hasHeroEntry, heroAbilities.length])

  const [heroStageIndex, setHeroStageIndex] = useState(0)

  useEffect(() => {
    setHeroStageIndex(0)
  }, [myHero?.id])

  useEffect(() => {
    if (!heroInfoStages.length) return
    if (heroStageIndex >= heroInfoStages.length) {
      setHeroStageIndex(0)
    }
  }, [heroInfoStages, heroStageIndex])

  const currentHeroStage = heroInfoStages[heroStageIndex] || 'profile'

  const handleAdvanceHeroStage = useCallback(() => {
    if (heroInfoStages.length <= 1) return
    setHeroStageIndex((prev) => {
      if (heroInfoStages.length === 0) return 0
      return (prev + 1) % heroInfoStages.length
    })
  }, [heroInfoStages])

  const handleHeroKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleAdvanceHeroStage()
      }
    },
    [handleAdvanceHeroStage],
  )

  const heroStageHasMultipleViews = heroInfoStages.length > 1

  const heroNameMap = useMemo(() => {
    const map = new Map()
    participants.forEach((participant) => {
      if (participant?.hero_id && participant?.hero?.name) {
        map.set(participant.hero_id, participant.hero.name)
      }
    })
    if (myHero?.id && myHero?.name) {
      map.set(myHero.id, myHero.name)
    }
    return map
  }, [myHero, participants])

  const heroStats = useMemo(() => {
    const rankIndex = myEntry ? participants.findIndex((participant) => participant.id === myEntry.id) : -1
    return [
      { label: '승률', value: formatWinRate(myEntry?.win_rate) },
      { label: '점수', value: formatNumber(myEntry?.score ?? myEntry?.rating ?? 0) },
      { label: '랭킹', value: rankIndex >= 0 ? `${rankIndex + 1}위` : '랭킹 없음' },
      { label: '게임 수', value: formatNumber(myEntry?.battles ?? 0) },
    ]
  }, [myEntry, participants])

  const heroBattleLogs = useMemo(() => {
    const source = Array.isArray(recentBattles) ? recentBattles : []
    const heroId = myEntry?.hero_id || myHero?.id || null
    const filtered = heroId
      ? source.filter((battle) => {
          const attackers = ensureArray(battle.attacker_hero_ids)
          const defenders = ensureArray(battle.defender_hero_ids)
          return attackers.includes(heroId) || defenders.includes(heroId)
        })
      : source
    return filtered.map((battle) => buildBattleLine(battle, heroNameMap))
  }, [heroNameMap, myEntry?.hero_id, myHero?.id, recentBattles])

  const displayedHeroLogs = useMemo(
    () => heroBattleLogs.slice(0, visibleHeroLogs),
    [heroBattleLogs, visibleHeroLogs]
  )

  const heroLogsExhausted = heroBattleLogs.length <= visibleHeroLogs

  useEffect(() => {
    setVisibleHeroLogs(10)
  }, [myEntry?.hero_id, myHero?.id, recentBattles])

  const overallRanking = useMemo(() => {
    return [...participants].sort((a, b) => {
      const scoreA = Number.isFinite(Number(a?.score)) ? Number(a.score) : -Infinity
      const scoreB = Number.isFinite(Number(b?.score)) ? Number(b.score) : -Infinity
      if (scoreA === scoreB) return (a?.created_at || '').localeCompare(b?.created_at || '')
      return scoreB - scoreA
    })
  }, [participants])

  const roleRankings = useMemo(() => {
    const grouped = groupByRole(participants)
    return Array.from(grouped.entries()).map(([role, members]) => ({
      role,
      members: [...members].sort((a, b) => {
        const scoreA = Number.isFinite(Number(a?.score)) ? Number(a.score) : -Infinity
        const scoreB = Number.isFinite(Number(b?.score)) ? Number(b.score) : -Infinity
        if (scoreA === scoreB) return (a?.created_at || '').localeCompare(b?.created_at || '')
        return scoreB - scoreA
      }),
    }))
  }, [participants])

  const rankingBattleLogs = useMemo(
    () =>
      (Array.isArray(recentBattles) ? recentBattles : [])
        .slice(0, 10)
        .map((battle) => buildBattleLine(battle, heroNameMap)),
    [heroNameMap, recentBattles]
  )

  const topParticipant = overallRanking[0] || null
  const rankingBackdrop = topParticipant?.hero?.background_url || backgroundImage

  const createdAt = formatDate(game?.created_at)
  const updatedAt = formatDate(game?.updated_at)

  const goToTabIndex = (index) => {
    const clamped = Math.max(0, Math.min(TABS.length - 1, index))
    const key = TABS[clamped]?.key
    if (key) {
      setActiveTab(key)
    }
  }

  const goNextTab = () => goToTabIndex(resolvedActiveIndex + 1)
  const goPrevTab = () => goToTabIndex(resolvedActiveIndex - 1)

  const handleTouchStart = (event) => {
    if (event.touches?.length !== 1) return
    touchStartRef.current = event.touches[0].clientX
  }

  const handleTouchMove = (event) => {
    if (touchStartRef.current === null) return
    if (event.touches?.length !== 1) return
    const delta = event.touches[0].clientX - touchStartRef.current
    if (Math.abs(delta) < 48) return
    if (delta < 0) {
      goNextTab()
    } else {
      goPrevTab()
    }
    touchStartRef.current = null
  }

  const handleTouchEnd = () => {
    touchStartRef.current = null
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

  const handleShowMoreLogs = () => {
    setVisibleHeroLogs((prev) => prev + 10)
  }

  const tabButtonId = (key) => `game-room-tab-${key}`
  const tabPanelId = (key) => `game-room-panel-${key}`

  if (!game) {
    return (
      <div className={styles.room}>
        <div className={styles.backdropFallback} />
        <div className={styles.overlay} />
        <div className={styles.shell}>
          <div className={styles.loadingCard}>게임 정보를 불러오는 중입니다…</div>
        </div>
      </div>
    )
  }

  const mainPanelContent = (
    <div className={styles.panelInner}>
      <section className={styles.joinCard}>
        <div className={styles.capacityRow}>
          <span className={styles.capacityCount}>참여 {readyCount}명</span>
          <span className={`${styles.capacityStatus} ${canStart ? styles.capacityReady : ''}`}>
            {canStart ? '매칭 준비 완료' : '함께할 참가자를 기다리는 중'}
          </span>
        </div>

        {participantsByRole.length > 0 ? (
          <div className={styles.roleList}>
            {participantsByRole.map(({ name, count }) => {
              const isPicked = currentRole === name
              const isMine = myEntry?.role === name
              const highlight = isPicked || isMine
              const label = `${count}명 참여 중`
              return (
                <button
                  key={name}
                  type="button"
                  className={`${styles.roleChip} ${highlight ? styles.roleChipActive : ''} ${
                    alreadyJoined && !isMine ? styles.roleChipDisabled : ''
                  }`}
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
          <div className={styles.emptyCard}>선택 가능한 역할 정보가 없습니다.</div>
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
            <button type="button" className={styles.ownerStartButton} onClick={onStart} disabled={startDisabled}>
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
            <button type="button" className={styles.subtleButton} onClick={onDelete} disabled={deleting}>
              {deleting ? '방 삭제 중…' : '방 삭제하기'}
            </button>
          </div>
        )}
      </section>

      <section className={styles.section}>
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

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>게임 룰</h2>
        </div>
        {renderRules(game.rules) || <div className={styles.emptyCard}>룰 정보가 준비 중입니다.</div>}
      </section>
    </div>
  )

  const heroPanelContent = (
    <div className={styles.panelInner}>
      <div className={styles.heroLayout}>
        <div className={styles.heroVisual}>
          <button
            type="button"
            className={styles.heroImageButton}
            onClick={handleAdvanceHeroStage}
            onKeyDown={handleHeroKeyDown}
            aria-label={heroStageHasMultipleViews ? '캐릭터 정보 전환' : '캐릭터 정보'}
            data-stage={currentHeroStage}
          >
            {myHero?.image_url ? (
              <img src={myHero.image_url} alt={myHero?.name || '선택한 캐릭터'} loading="lazy" />
            ) : (
              <div className={styles.heroImageFallback}>캐릭터 이미지를 선택해 주세요.</div>
            )}

            <div className={styles.heroInfo} data-stage={currentHeroStage}>
              <div className={styles.heroInfoTop}>
                <span className={styles.heroLabel}>내 캐릭터</span>
                <h2 className={styles.heroName}>{myHero?.name || '캐릭터가 선택되지 않았습니다.'}</h2>
                {currentHeroStage === 'profile' && myHero?.description && (
                  <p className={styles.heroDescription}>{myHero.description}</p>
                )}
              </div>

              <div className={styles.heroInfoBody}>
                {currentHeroStage === 'stats' && myEntry && (
                  <div className={styles.heroStats}>
                    <h3 className={styles.heroSectionTitle}>전적</h3>
                    <ul className={styles.heroStatsList}>
                      {heroStats.map((stat) => (
                        <li key={stat.label}>
                          <span className={styles.heroStatLabel}>{stat.label}</span>
                          <span className={styles.heroStatValue}>{stat.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {currentHeroStage === 'abilities' && heroAbilities.length > 0 && (
                  <div className={styles.heroAbilities}>
                    <h3 className={styles.heroSectionTitle}>능력</h3>
                    <ul className={styles.heroAbilityList}>
                      {heroAbilities.map((ability, index) => (
                        <li key={`${ability}-${index}`} className={styles.heroAbility}>
                          {ability}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {heroStageHasMultipleViews && (
                <div className={styles.heroHintRow}>
                  <span className={styles.heroHint}>탭하면 정보가 전환됩니다</span>
                </div>
              )}
            </div>
          </button>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>최근 베틀 로그</h2>
          <span className={styles.sectionBadge}>{heroBattleLogs.length}</span>
        </div>
        {displayedHeroLogs.length === 0 ? (
          <div className={styles.emptyCard}>아직 기록된 로그가 없습니다.</div>
        ) : (
          <ul className={styles.logList}>
            {displayedHeroLogs.map((log) => (
              <li key={`hero-${log.id}`} className={styles.logItem}>
                <span className={styles.logText}>{log.text}</span>
                {log.result && <span className={styles.logTag}>{log.result}</span>}
              </li>
            ))}
          </ul>
        )}
        {!heroLogsExhausted && (
          <button type="button" className={styles.moreButton} onClick={handleShowMoreLogs}>
            더 보기
          </button>
        )}
      </section>
    </div>
  )

  const rankingPanelContent = (
    <div className={styles.panelInner}>
      <div className={styles.rankingPanel}>
        {rankingBackdrop ? (
          <div className={styles.rankingBackdrop} style={{ backgroundImage: `url(${rankingBackdrop})` }} aria-hidden />
        ) : (
          <div className={styles.rankingBackdropFallback} />
        )}
        <div className={styles.rankingOverlay} />

        <div className={styles.rankingContent}>
          <header className={styles.rankingHeader}>
            <span className={styles.rankingLabel}>랭킹 1위</span>
            <h2 className={styles.rankingHeroName}>{topParticipant?.hero?.name || '랭킹 정보 없음'}</h2>
            {topParticipant?.hero?.image_url && (
              <div className={styles.rankingHeroVisual}>
                <img
                  src={topParticipant.hero.image_url}
                  alt={topParticipant.hero?.name || '랭킹 1위 캐릭터'}
                  loading="lazy"
                />
              </div>
            )}
            {topParticipant && (
              <p className={styles.rankingHeroMeta}>
                역할 {topParticipant.role || '미정'} · 점수 {formatNumber(topParticipant.score ?? 0)} ·{' '}
                {topParticipant.battles ?? 0}전
              </p>
            )}
          </header>

          <div className={styles.rankingGrid}>
            <section className={styles.rankingSection}>
              <h3 className={styles.rankingSectionTitle}>종합 랭킹</h3>
              {overallRanking.length === 0 ? (
                <div className={styles.emptyCard}>참가자가 없습니다.</div>
              ) : (
                <ol className={styles.rankingList}>
                  {overallRanking.slice(0, 10).map((entry, index) => (
                    <li key={entry.id || `${entry.owner_id}-${index}`} className={styles.rankingRow}>
                      <span className={styles.rankingIndex}>{index + 1}</span>
                      <div>
                        <strong className={styles.rankingRowName}>
                          {entry.hero?.name || entry.owner_id?.slice(0, 8) || '알 수 없음'}
                        </strong>
                        <span className={styles.rankingRowMeta}>
                          역할 {entry.role || '미정'} · 점수 {formatNumber(entry.score ?? 0)} · {entry.battles ?? 0}전
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className={styles.rankingSection}>
              <h3 className={styles.rankingSectionTitle}>역할군별 랭킹</h3>
              {roleRankings.length === 0 ? (
                <div className={styles.emptyCard}>참가자 없습니다.</div>
              ) : (
                <div className={styles.roleRankingGroups}>
                  {roleRankings.map(({ role, members }) => (
                    <div key={role} className={styles.roleRankingGroup}>
                      <h4 className={styles.roleRankingTitle}>{role}</h4>
                      <ol className={styles.rankingList}>
                        {members.slice(0, 10).map((entry, index) => (
                          <li key={entry.id || `${entry.owner_id}-${index}`} className={styles.rankingRow}>
                            <span className={styles.rankingIndex}>{index + 1}</span>
                            <div>
                              <strong className={styles.rankingRowName}>
                                {entry.hero?.name || entry.owner_id?.slice(0, 8) || '알 수 없음'}
                              </strong>
                              <span className={styles.rankingRowMeta}>
                                점수 {formatNumber(entry.score ?? 0)} · {entry.battles ?? 0}전
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className={styles.section}>
            <h3 className={styles.rankingSectionTitle}>최근 10게임 로그</h3>
            {rankingBattleLogs.length === 0 ? (
              <div className={styles.emptyCard}>아직 게임 로그가 없습니다.</div>
            ) : (
              <ul className={styles.logList}>
                {rankingBattleLogs.map((log) => (
                  <li key={`ranking-${log.id}`} className={styles.logItem}>
                    <span className={styles.logText}>{log.text}</span>
                    {log.result && <span className={styles.logTag}>{log.result}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )

  const panelContentByKey = {
    main: mainPanelContent,
    hero: heroPanelContent,
    ranking: rankingPanelContent,
  }

  return (
    <div className={styles.room}>
      {backgroundImage ? (
        <div className={styles.backdrop} style={{ backgroundImage: `url(${backgroundImage})` }} aria-hidden />
      ) : (
        <div className={styles.backdropFallback} />
      )}
      <div className={styles.overlay} />

      <div className={styles.shell}>
        {onBack && (
          <button type="button" className={styles.backButton} onClick={onBack}>
            ← 로비로
          </button>
        )}

        <section className={styles.summaryCard}>
          <div className={styles.gameHeader}>
            <div className={styles.gameText}>
              <span className={styles.gameBadge}>랭크 게임</span>
              <h1 className={styles.gameTitle}>{game.name || '이름 없는 게임'}</h1>
              <p className={styles.gameDescription}>
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
                <img src={coverImage} alt={game.name || '게임 대표 이미지'} loading="lazy" />
              ) : (
                <div className={styles.coverPlaceholder}>대표 이미지가 등록되지 않았습니다.</div>
              )}
            </div>
          </div>
        </section>

        <div className={styles.tabBar} role="tablist" aria-label="랭크 게임 탭">
          {TABS.map((tab, index) => {
            const selected = resolvedActiveIndex === index
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={tabButtonId(tab.key)}
                aria-controls={tabPanelId(tab.key)}
                aria-selected={selected}
                className={`${styles.tabButton} ${selected ? styles.tabButtonActive : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div
          className={styles.panels}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {TABS.map((tab, index) => {
            const selected = resolvedActiveIndex === index
            const content = panelContentByKey[tab.key] || null
            return (
              <section
                key={tab.key}
                role="tabpanel"
                id={tabPanelId(tab.key)}
                aria-labelledby={tabButtonId(tab.key)}
                className={`${styles.panel} ${selected ? styles.panelActive : ''}`}
                hidden={!selected}
              >
                {content}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
