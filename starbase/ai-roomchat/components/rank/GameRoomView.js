// components/rank/GameRoomView.js
import { useEffect, useMemo, useState } from 'react'

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

const HERO_PANEL_SEQUENCE = ['name', 'description', 'abilities12', 'abilities34', 'stats']

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

function useLoopedAudio(url, volume = 0.6) {
  useEffect(() => {
    if (!url || typeof window === 'undefined') return () => {}
    const audio = new Audio(url)
    audio.loop = true
    audio.volume = volume
    audio.play().catch(() => {})
    return () => {
      audio.pause()
      audio.src = ''
    }
  }, [url, volume])
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
  const [heroPanelStep, setHeroPanelStep] = useState(0)
  const [visibleHeroLogs, setVisibleHeroLogs] = useState(10)
  const [orientation, setOrientation] = useState('portrait')

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

  const rankingEntries = useMemo(() => participants.slice(0, 12), [participants])

  const rankingBattleLogs = useMemo(
    () =>
      (Array.isArray(recentBattles) ? recentBattles : [])
        .slice(0, 10)
        .map((battle) => buildBattleLine(battle, heroNameMap)),
    [heroNameMap, recentBattles]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(orientation: landscape)')
    const update = () => {
      setOrientation(media.matches ? 'landscape' : 'portrait')
    }
    try {
      media.addEventListener('change', update)
    } catch (error) {
      media.addListener(update)
    }
    update()
    return () => {
      try {
        media.removeEventListener('change', update)
      } catch (error) {
        media.removeListener(update)
      }
    }
  }, [])

  useEffect(() => {
    setVisibleHeroLogs(10)
  }, [myEntry?.hero_id, myHero?.id, recentBattles])

  const heroPanelState = HERO_PANEL_SEQUENCE[heroPanelStep % HERO_PANEL_SEQUENCE.length]

  const cycleHeroPanel = () => {
    setHeroPanelStep((prev) => (prev + 1) % HERO_PANEL_SEQUENCE.length)
  }

  const topParticipant = rankingEntries[0] || null
  const rankingBackdrop = topParticipant?.hero?.background_url || backgroundImage

  const portraitHeroBgm = orientation === 'portrait' ? myHero?.bgm_url || null : null
  const rankingHeroBgm = orientation === 'landscape' ? topParticipant?.hero?.bgm_url || null : null

  useLoopedAudio(portraitHeroBgm)
  useLoopedAudio(rankingHeroBgm)

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

  const portraitContent = (
    <>
      <div className={styles.capacityBar}>
        <div className={styles.capacityCount}>참여 {readyCount}명</div>
        <div className={`${styles.capacityStatus} ${canStart ? styles.capacityReady : ''}`}>
          {canStart ? '매칭 준비 완료' : '함께할 참가자를 기다리는 중'}
        </div>
      </div>

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
            <img
              src={coverImage}
              alt={game.name || '게임 대표 이미지'}
              className={styles.cover}
              loading="lazy"
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
              <p className={styles.cardHint}>이미지를 눌러 정보 단계를 순서대로 살펴보세요.</p>
            </div>
          </header>

          {myHero ? (
            <div className={styles.heroBody}>
              <button
                type="button"
                className={`${styles.heroPortraitButton} ${
                  heroPanelState === 'name' ? '' : styles.heroPortraitDimmed
                }`}
                onClick={cycleHeroPanel}
              >
                {myHero.image_url ? (
                  <img
                    src={myHero.image_url}
                    alt={myHero.name || '선택한 캐릭터'}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.heroPortraitFallback}>이미지 없음</div>
                )}
                <div className={styles.heroOverlay}>
                  {heroPanelState === 'name' && (
                    <div className={styles.heroOverlayName}>
                      <span className={styles.heroNameBadge}>{myHero.name}</span>
                      {myEntry?.role && <span className={styles.heroRole}>담당 역할: {myEntry.role}</span>}
                    </div>
                  )}
                  {heroPanelState === 'description' && (
                    <p className={styles.heroOverlayDescription}>
                      {myHero.description || '설명 없는 캐릭터입니다.'}
                    </p>
                  )}
                  {heroPanelState === 'abilities12' && (
                    <ul className={styles.heroAbilityList}>
                      {[heroAbilities[0], heroAbilities[1]].filter(Boolean).map((ability, index) => (
                        <li key={`ability12-${index}`} className={styles.heroAbilityItem}>
                          <span className={styles.abilityLabel}>능력 {index + 1}</span>
                          <span>{ability}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {heroPanelState === 'abilities34' && (
                    <ul className={styles.heroAbilityList}>
                      {[heroAbilities[2], heroAbilities[3]].filter(Boolean).map((ability, index) => (
                        <li key={`ability34-${index}`} className={styles.heroAbilityItem}>
                          <span className={styles.abilityLabel}>능력 {index + 3}</span>
                          <span>{ability}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {heroPanelState === 'stats' && (
                    <div className={styles.heroStatsGrid}>
                      {heroStats.map((stat) => (
                        <div key={stat.label} className={styles.heroStatTile}>
                          <span className={styles.heroStatLabel}>{stat.label}</span>
                          <strong className={styles.heroStatValue}>{stat.value}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>

              <div className={styles.heroLogSection}>
                <div className={styles.sectionHeaderSmall}>
                  <h3 className={styles.sectionTitle}>최근 베틀 로그</h3>
                  <span className={styles.sectionHintSmall}>
                    {heroBattleLogs.length ? `${heroBattleLogs.length}건` : '기록 없음'}
                  </span>
                </div>
                {displayedHeroLogs.length === 0 ? (
                  <div className={styles.emptyCard}>아직 베틀 로그가 없습니다.</div>
                ) : (
                  <ul className={styles.logList}>
                    {displayedHeroLogs.map((log) => (
                      <li key={log.id} className={styles.logItem}>
                        <span className={styles.logText}>{log.text}</span>
                        {log.result && <span className={styles.logTag}>{log.result}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {!heroLogsExhausted && (
                  <button
                    type="button"
                    className={styles.moreButton}
                    onClick={() => setVisibleHeroLogs((prev) => prev + 10)}
                  >
                    베틀 로그 더보기
                  </button>
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
        {renderRules(game.rules) || <div className={styles.emptyCard}>룰 정보가 준비 중입니다.</div>}
      </section>
    </>
  )

  const rankingContent = (
    <div className={styles.rankingPane}>
      {rankingBackdrop ? (
        <div
          className={styles.rankingBackdrop}
          style={{ backgroundImage: `url(${rankingBackdrop})` }}
          aria-hidden
        />
      ) : (
        <div className={styles.rankingBackdropFallback} />
      )}
      <div className={styles.rankingOverlay} />

      <div className={styles.rankingContent}>
        <header className={styles.rankingHeader}>
          <h1 className={styles.rankingTitle}>역할군별 랭킹</h1>
          <p className={styles.rankingSubtitle}>가로 화면에서 상위 참가자들의 순위를 확인하세요.</p>
        </header>

        {topParticipant ? (
          <div className={styles.rankingChampion}>
            <div className={styles.rankingChampionCard}>
              {topParticipant.hero?.image_url ? (
                <img
                  src={topParticipant.hero.image_url}
                  alt={topParticipant.hero?.name || '랭킹 1위 캐릭터'}
                  loading="lazy"
                />
              ) : (
                <div className={styles.rankingChampionFallback}>이미지 없음</div>
              )}
              <div className={styles.rankingChampionMeta}>
                <span className={styles.rankingChampionBadge}>현재 1위</span>
                <strong className={styles.rankingChampionName}>
                  {topParticipant.hero?.name || '이름 없는 영웅'}
                </strong>
                <span className={styles.rankingChampionRole}>{topParticipant.role || '역할 미정'}</span>
                <span className={styles.rankingChampionScore}>
                  점수 {formatNumber(topParticipant.score ?? 0)} · {topParticipant.battles ?? 0}전
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyCard}>랭킹을 표시할 참가자가 없습니다.</div>
        )}

        <div className={styles.rankingBody}>
          <section className={styles.rankingListSection}>
            <h2 className={styles.rankingSectionTitle}>상위 참가자</h2>
            {rankingEntries.length === 0 ? (
              <div className={styles.emptyCard}>참가자가 없습니다.</div>
            ) : (
              <ol className={styles.rankingList}>
                {rankingEntries.map((entry, index) => (
                  <li key={entry.id || `${entry.owner_id}-${index}`} className={styles.rankingRow}>
                    <span className={styles.rankingIndex}>{index + 1}</span>
                    <div className={styles.rankingRowBody}>
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

          <section className={styles.rankingLogSection}>
            <h2 className={styles.rankingSectionTitle}>최근 10게임 로그</h2>
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

  return (
    <div className={`${styles.room} ${orientation === 'landscape' ? styles.landscape : styles.portrait}`}>
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

      {onBack && (
        <button type="button" className={styles.backLink} onClick={onBack}>
          ← 로비로
        </button>
      )}

      <div className={styles.content}>{orientation === 'landscape' ? rankingContent : portraitContent}</div>
    </div>
  )
}
