// components/rank/GameRoomView.js
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import ParticipantCard from './ParticipantCard'
import { TURN_TIMER_OPTIONS, summarizeTurnTimerVotes } from '../../lib/rank/turnTimers'
import styles from './GameRoomView.module.css'
import { getHeroAudioManager } from '../../lib/audio/heroAudioManager'

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

function normalizeHeroAudioProfile(rawHero, { fallbackHeroId = null, fallbackHeroName = '' } = {}) {
  if (!rawHero || typeof rawHero !== 'object') {
    return null
  }

  const bgmUrl = rawHero.bgm_url || rawHero.bgmUrl || null
  if (!bgmUrl) {
    return null
  }

  const rawDuration =
    rawHero.bgm_duration_seconds ?? rawHero.bgmDurationSeconds ?? rawHero.bgmDuration ?? rawHero.duration
  const duration = Number.isFinite(Number(rawDuration)) && Number(rawDuration) > 0
    ? Math.round(Number(rawDuration))
    : null

  return {
    heroId: rawHero.id || fallbackHeroId || null,
    heroName: rawHero.name || fallbackHeroName || '',
    bgmUrl,
    bgmDuration: duration,
  }
}

function formatDurationLabel(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) {
    return null
  }

  const total = Math.max(0, Math.round(Number(seconds)))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function formatVoteSummary(topValues, maxCount) {
  if (!Array.isArray(topValues) || topValues.length === 0 || !maxCount) {
    return '아직 투표한 참가자가 없습니다.'
  }
  const label = topValues.map((value) => `${value}초`).join(', ')
  return `현재 최다 득표: ${label} (${maxCount}표)`
}

function TurnTimerVotePanel({ value, onChange, voteSummary }) {
  const currentValue = Number.isFinite(Number(value)) ? Number(value) : null
  const { normalized = {}, topValues = [], maxCount = 0 } = voteSummary || {}
  const summaryText = formatVoteSummary(topValues, maxCount)

  return (
    <div className={styles.timerVoteCard}>
      <div className={styles.timerVoteHeader}>
        <h3 className={styles.timerVoteTitle}>턴 제한 투표</h3>
        <span className={styles.timerVoteTag}>
          {currentValue ? `${currentValue}초 선택됨` : '선택 대기 중'}
        </span>
      </div>
      <div className={styles.timerVoteOptions}>
        {TURN_TIMER_OPTIONS.map((option) => {
          const active = currentValue === option.value
          const count = normalized[option.value] || 0
          const leading = maxCount > 0 && topValues.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              className={`${styles.timerVoteButton} ${
                active ? styles.timerVoteButtonActive : ''
              } ${leading ? styles.timerVoteButtonLeading : ''}`.trim()}
              onClick={() => onChange?.(option.value)}
            >
              <span>{option.label}</span>
              <span className={styles.timerVoteCount}>{count}표</span>
            </button>
          )
        })}
      </div>
      <p className={styles.timerVoteSummaryText}>{summaryText}</p>
      <p className={styles.timerVoteHint}>동률이 나오면 무작위로 결정됩니다.</p>
    </div>
  )
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

function ensureArray(value) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return []
}

function normalizeSummaryPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const preview = typeof payload.preview === 'string' ? payload.preview.trim() : ''
  const promptPreview =
    typeof payload.promptPreview === 'string' ? payload.promptPreview.trim() : ''
  const role = typeof payload.role === 'string' ? payload.role.trim() : ''
  const actors = Array.isArray(payload.actors)
    ? payload.actors
        .map((actor) => (typeof actor === 'string' ? actor.trim() : ''))
        .filter(Boolean)
    : []
  const outcomeLine =
    typeof payload.outcome?.lastLine === 'string'
      ? payload.outcome.lastLine.trim()
      : ''
  const tagValues = []
  const appendTags = (source) => {
    if (!Array.isArray(source)) return
    source.forEach((tag) => {
      if (typeof tag !== 'string') return
      const trimmed = tag.trim()
      if (!trimmed) return
      tagValues.push(trimmed)
    })
  }
  appendTags(payload.tags)
  if (payload.extra && typeof payload.extra === 'object') {
    appendTags(payload.extra.tags)
    appendTags(payload.extra.labels)
  }
  appendTags(payload.outcome?.variables)
  const tags = Array.from(
    new Map(tagValues.map((tag) => [tag.toLowerCase(), tag])).values(),
  )

  if (!preview && !promptPreview && !role && !actors.length && !outcomeLine && !tags.length) {
    return null
  }

  return {
    preview,
    promptPreview,
    role,
    actors,
    outcomeLine,
    ...(tags.length ? { tags } : {}),
  }
}

function buildHistorySearchText(parts = []) {
  const tokens = []
  parts.forEach((part) => {
    if (part === null || part === undefined) return
    if (Array.isArray(part)) {
      part.forEach((nested) => {
        if (nested === null || nested === undefined) return
        if (typeof nested === 'string') {
          const trimmed = nested.trim()
          if (trimmed) tokens.push(trimmed.toLowerCase())
        } else if (typeof nested === 'number' && Number.isFinite(nested)) {
          tokens.push(String(nested))
        }
      })
      return
    }

    if (typeof part === 'string') {
      const trimmed = part.trim()
      if (trimmed) tokens.push(trimmed.toLowerCase())
      return
    }

    if (typeof part === 'number' && Number.isFinite(part)) {
      tokens.push(String(part))
    }
  })

  return tokens.join(' ')
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

function describeSessionStatus(status) {
  const raw = typeof status === 'string' ? status.trim().toLowerCase() : ''
  if (!raw) {
    return { label: '진행 중', tone: 'active' }
  }

  if (['completed', 'done', 'finished', 'closed', 'victory', 'won'].includes(raw)) {
    return { label: '종료', tone: 'completed' }
  }

  if (['failed', 'error', 'aborted', 'cancelled', 'canceled', 'defeat', 'lost'].includes(raw)) {
    return { label: '중단', tone: 'failed' }
  }

  if (['active', 'running', 'pending', 'open', 'in_progress'].includes(raw)) {
    return { label: '진행 중', tone: 'active' }
  }

  return { label: status || '진행 중', tone: 'active' }
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
  minimumParticipants = 0,
  pickRole,
  onChangeRole,
  alreadyJoined = false,
  canStart = false,
  myHero = null,
  myEntry = null,
  sessionHistory = [],
  sharedSessionHistory = [],
  onBack,
  onJoin,
  onLeave,
  onOpenModeSettings,
  onOpenLeaderboard,
  onDelete,
  isOwner = false,
  deleting = false,
  startDisabled = false,
  startLoading = false,
  startNotice = '',
  startError = '',
  recentBattles = [],
  turnTimerVote = null,
  turnTimerVotes = {},
  onVoteTurnTimer,
  roleOccupancy = [],
  roleLeaderboards = [],
}) {
  const [joinLoading, setJoinLoading] = useState(false)
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [visibleHeroLogs, setVisibleHeroLogs] = useState(10)
  const [activeTab, setActiveTab] = useState(TABS[0].key)
  const touchStartRef = useRef(null)
  const profileCloseRef = useRef(null)
  const profileTitleId = useId()
  const profileDescriptionId = useId()
  const audioManager = useMemo(() => {
    if (typeof window === 'undefined') {
      return null
    }
    return getHeroAudioManager()
  }, [])
  const audioBaselineRef = useRef(null)
  const currentAudioTrackRef = useRef({ url: null, heroId: null })

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

  useEffect(() => {
    if (!audioManager) {
      return undefined
    }

    audioBaselineRef.current = audioManager.getState()

    return () => {
      const baseline = audioBaselineRef.current
      if (!baseline) {
        audioManager.setEqEnabled(false)
        audioManager.setReverbEnabled(false)
        audioManager.setCompressorEnabled(false)
        audioManager.setEnabled(false, { resume: false })
        audioManager.stop()
        return
      }

      audioManager.setLoop(baseline.loop)
      audioManager.setVolume(baseline.volume)
      audioManager.setEqEnabled(baseline.eqEnabled)
      audioManager.setEqualizer(baseline.equalizer)
      audioManager.setReverbEnabled(baseline.reverbEnabled)
      audioManager.setReverbDetail(baseline.reverbDetail)
      audioManager.setCompressorEnabled(baseline.compressorEnabled)
      audioManager.setCompressorDetail(baseline.compressorDetail)
      audioManager.loadHeroTrack({
        heroId: baseline.heroId,
        heroName: baseline.heroName,
        trackUrl: baseline.trackUrl,
        duration: baseline.duration || 0,
        autoPlay: false,
        loop: baseline.loop,
      })
      if (baseline.enabled) {
        audioManager.setEnabled(true, { resume: false })
        if (baseline.isPlaying) {
          audioManager.play().catch(() => {})
        }
      } else {
        audioManager.setEnabled(false, { resume: false })
        audioManager.stop()
      }
    }
  }, [audioManager])

  const normalizedRoles = useMemo(() => {
    if (!Array.isArray(roles)) return []
    const entries = new Map()
    roles.forEach((role) => {
      if (typeof role === 'string') {
        const trimmed = role.trim()
        if (!trimmed) return
        if (!entries.has(trimmed)) {
          entries.set(trimmed, { name: trimmed, capacity: null })
        }
        return
      }
      if (!role || typeof role !== 'object') return
      const name = typeof role.name === 'string' ? role.name.trim() : ''
      if (!name) return
      const rawCapacity = Number(role.slot_count ?? role.slotCount ?? role.capacity)
      const capacity = Number.isFinite(rawCapacity) && rawCapacity >= 0 ? rawCapacity : null
      if (entries.has(name)) {
        if (capacity != null) {
          entries.get(name).capacity = capacity
        }
      } else {
        entries.set(name, { name, capacity })
      }
    })
    return Array.from(entries.values())
  }, [roles])

  const roleOccupancyMap = useMemo(() => {
    const map = new Map()
    if (!Array.isArray(roleOccupancy)) {
      return map
    }
    roleOccupancy.forEach((entry) => {
      const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
      if (!name) return
      map.set(name, entry)
    })
    return map
  }, [roleOccupancy])

  const participantsByRole = useMemo(() => {
    const base = new Map()
    const order = []

    const ensure = (rawName, capacityHint = null) => {
      const name = typeof rawName === 'string' ? rawName.trim() : ''
      if (!name) return null
      if (!base.has(name)) {
        base.set(name, {
          name,
          count: 0,
          capacity: null,
          occupiedSlots: null,
          availableSlots: null,
        })
        order.push(name)
      }
      const entry = base.get(name)
      if (Number.isFinite(Number(capacityHint)) && Number(capacityHint) >= 0) {
        entry.capacity = Number(capacityHint)
      }
      return entry
    }

    normalizedRoles.forEach(({ name, capacity }) => {
      ensure(name, capacity)
    })

    roleOccupancyMap.forEach((occupancy, name) => {
      const entry = ensure(name, occupancy?.totalSlots ?? occupancy?.capacity)
      if (!entry) return
      if (Number.isFinite(Number(occupancy?.totalSlots)) && Number(occupancy.totalSlots) >= 0) {
        entry.capacity = Number(occupancy.totalSlots)
      }
      if (Number.isFinite(Number(occupancy?.occupiedSlots))) {
        entry.occupiedSlots = Number(occupancy.occupiedSlots)
      }
      if (Number.isFinite(Number(occupancy?.availableSlots)) && Number(occupancy.availableSlots) >= 0) {
        entry.availableSlots = Number(occupancy.availableSlots)
      }
    })

    participants.forEach((participant) => {
      const entry = ensure(participant?.role)
      if (!entry) return
      entry.count += 1
    })

    return order
      .map((name) => {
        const entry = base.get(name)
        if (!entry) return null
        const occupancy = roleOccupancyMap.get(name)
        const capacity =
          occupancy?.totalSlots != null
            ? Number(occupancy.totalSlots)
            : Number.isFinite(Number(entry.capacity)) && Number(entry.capacity) >= 0
            ? Number(entry.capacity)
            : null
        const occupied =
          occupancy?.occupiedSlots != null
            ? Number(occupancy.occupiedSlots)
            : entry.occupiedSlots != null
            ? Number(entry.occupiedSlots)
            : entry.count
        const available =
          occupancy?.availableSlots != null
            ? Number(occupancy.availableSlots)
            : capacity != null
            ? Math.max(capacity - entry.count, 0)
            : null

        return {
          name,
          count: entry.count,
          capacity,
          occupiedSlots: occupied,
          availableSlots: available,
        }
      })
      .filter(Boolean)
  }, [normalizedRoles, participants, roleOccupancyMap])

  const fallbackRole = normalizedRoles[0]?.name || (participantsByRole[0]?.name ?? '')
  const currentRole = pickRole || fallbackRole

  useEffect(() => {
    if (!pickRole && fallbackRole) {
      onChangeRole?.(fallbackRole)
    }
  }, [fallbackRole, onChangeRole, pickRole])

  const roster = Array.isArray(participants) ? participants : []
  const readyCount = roster.length

  const capacityCountLabel = useMemo(() => {
    if (minimumParticipants > 0) {
      return `${readyCount}/${minimumParticipants}명 참여`
    }
    return `${readyCount}명 참여`
  }, [minimumParticipants, readyCount])

  const capacityStatusText = useMemo(() => {
    if (canStart) return '매칭 준비 완료'
    if (minimumParticipants > 0) {
      return `${minimumParticipants}명 이상 모이면 시작할 수 있습니다.`
    }
    return '함께할 참가자를 기다리는 중'
  }, [canStart, minimumParticipants])

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

  const resolvedStartNotice = typeof startNotice === 'string' ? startNotice.trim() : ''
  const resolvedStartError = typeof startError === 'string' ? startError.trim() : ''

  const voteSummary = useMemo(
    () => summarizeTurnTimerVotes(turnTimerVotes || {}),
    [turnTimerVotes],
  )

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

  const participantsByOwnerId = useMemo(() => {
    const map = new Map()
    participants.forEach((participant) => {
      const ownerId = participant?.owner_id || participant?.ownerId
      if (!ownerId) return
      if (!map.has(ownerId)) {
        map.set(ownerId, participant)
      }
    })
    return map
  }, [participants])

  const heroAudioProfile = useMemo(() => {
    const viewerProfile = normalizeHeroAudioProfile(myHero)
    if (viewerProfile) {
      return { ...viewerProfile, source: 'viewer' }
    }

    const hostOwnerId = game?.owner_id || null
    if (hostOwnerId) {
      const hostParticipant = participants.find(
        (participant) => participant?.owner_id === hostOwnerId && participant?.hero,
      )
      if (hostParticipant?.hero) {
        const hostProfile = normalizeHeroAudioProfile(hostParticipant.hero, {
          fallbackHeroId: hostParticipant.hero_id || null,
          fallbackHeroName: hostParticipant.hero?.name || '',
        })
        if (hostProfile) {
          return { ...hostProfile, source: 'host' }
        }
      }
    }

    const fallbackParticipant = participants.find(
      (participant) => participant?.hero && (participant.hero.bgm_url || participant.hero.bgmUrl),
    )
    if (fallbackParticipant?.hero) {
      const fallbackProfile = normalizeHeroAudioProfile(fallbackParticipant.hero, {
        fallbackHeroId: fallbackParticipant.hero_id || null,
        fallbackHeroName: fallbackParticipant.hero?.name || '',
      })
      if (fallbackProfile) {
        return { ...fallbackProfile, source: 'participant' }
      }
    }

    return null
  }, [game?.owner_id, myHero, participants])

  const heroAudioSourceLabel = useMemo(() => {
    if (!heroAudioProfile) {
      return ''
    }

    switch (heroAudioProfile.source) {
      case 'viewer':
        return '현재 브금 · 내 캐릭터'
      case 'host':
        return '현재 브금 · 방장 기준'
      case 'participant':
        return '현재 브금 · 참가자 공유'
      default:
        return '현재 브금'
    }
  }, [heroAudioProfile])

  const heroAudioDurationLabel = useMemo(
    () => (heroAudioProfile?.bgmDuration ? formatDurationLabel(heroAudioProfile.bgmDuration) : null),
    [heroAudioProfile?.bgmDuration],
  )

  useEffect(() => {
    if (!audioManager) {
      return
    }

    const nextUrl = heroAudioProfile?.bgmUrl || null

    if (!nextUrl) {
      currentAudioTrackRef.current = { url: null, heroId: null }
      audioManager.setEqEnabled(false)
      audioManager.setReverbEnabled(false)
      audioManager.setCompressorEnabled(false)
      audioManager.setEnabled(false, { resume: false })
      audioManager.stop()
      return
    }

    const current = currentAudioTrackRef.current
    const shouldReload =
      current.url !== nextUrl || current.heroId !== (heroAudioProfile?.heroId || null)

    if (shouldReload) {
      currentAudioTrackRef.current = {
        url: nextUrl,
        heroId: heroAudioProfile?.heroId || null,
      }
      const baselineVolume = audioBaselineRef.current?.volume
      if (Number.isFinite(baselineVolume)) {
        audioManager.setVolume(baselineVolume)
      }
      audioManager.setLoop(true)
      audioManager.setEqEnabled(false)
      audioManager.setEqualizer({ low: 0, mid: 0, high: 0 })
      audioManager.setReverbEnabled(false)
      audioManager.setReverbDetail({ mix: 0.3, decay: 1.8 })
      audioManager.setCompressorEnabled(false)
      audioManager.setCompressorDetail({ threshold: -28, ratio: 2.5, release: 0.25 })
      audioManager.setEnabled(true, { resume: false })
      audioManager
        .loadHeroTrack({
          heroId: heroAudioProfile?.heroId || null,
          heroName: heroAudioProfile?.heroName || '',
          trackUrl: nextUrl,
          duration: heroAudioProfile?.bgmDuration || 0,
          autoPlay: true,
          loop: true,
        })
        .catch(() => {})
      return
    }

    const snapshot = audioManager.getState()
    if (!snapshot.enabled) {
      audioManager.setEnabled(true, { resume: false })
    }
    if (!snapshot.isPlaying) {
      audioManager.play().catch(() => {})
    }
  }, [audioManager, heroAudioProfile])

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

  const myRoleName = typeof myEntry?.role === 'string' ? myEntry.role : ''
  const myHeroDisplayName =
    (myEntry?.hero && myEntry.hero.name) || myHero?.name || ''

  const [historySearch, setHistorySearch] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
  const [historyParticipantFilter, setHistoryParticipantFilter] = useState('all')
  const [historyVisibilityFilter, setHistoryVisibilityFilter] = useState('all')
  const [historyTagFilter, setHistoryTagFilter] = useState('all')
  const [historyDateFrom, setHistoryDateFrom] = useState('')
  const [historyDateTo, setHistoryDateTo] = useState('')

  const historySearchTokens = useMemo(() => {
    if (!historySearch) return []
    return historySearch
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
  }, [historySearch])

  const baseSessionHistory = useMemo(() => {
    if (!Array.isArray(sessionHistory)) return []
    return sessionHistory
      .map((entry) => {
        if (!entry || !entry.sessionId) return null
        const statusInfo = describeSessionStatus(entry.sessionStatus)
        const createdAtValueRaw = entry.sessionCreatedAt ? Date.parse(entry.sessionCreatedAt) : NaN
        const createdAtValue = Number.isFinite(createdAtValueRaw) ? createdAtValueRaw : null
        const createdAt = formatDate(entry.sessionCreatedAt)
        const publicTurns = Array.isArray(entry.publicTurns)
          ? entry.publicTurns.filter((turn) => turn?.is_visible !== false)
          : []
        const shareableTotalRaw = Number(entry.publicTurnCount ?? publicTurns.length)
        const shareableTotal = Number.isFinite(shareableTotalRaw)
          ? Math.max(shareableTotalRaw, 0)
          : publicTurns.length
        const displayTurns = publicTurns.slice(-5)
        const extraPublicWithinLimited = Math.max(publicTurns.length - displayTurns.length, 0)
        const olderShareableCount = Math.max(shareableTotal - publicTurns.length, 0)
        const hiddenCount = Number(entry.hiddenCount) || 0
        const suppressedCount = Number(entry.suppressedCount) || 0
        const trimmedTotal = (() => {
          const trimmed = Number(entry.trimmedCount)
          if (Number.isFinite(trimmed) && trimmed >= 0) {
            return trimmed
          }
          return Math.max(
            Number(entry.turnCount || 0) - Number(entry.displayedTurnCount || 0),
            0,
          )
        })()
        const summary = normalizeSummaryPayload(entry.latestSummary)
        const summaryTags = Array.isArray(summary?.tags)
          ? summary.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
          : []
        const summaryTagKeys = Array.from(
          new Set(summaryTags.map((tag) => tag.toLowerCase())),
        )
        const summaryActors = Array.isArray(summary?.actors)
          ? summary.actors.filter((actor) => typeof actor === 'string' && actor.trim().length > 0)
          : []
        const participants = summaryActors.length ? Array.from(new Set(summaryActors)) : []
        const searchText = buildHistorySearchText([
          statusInfo.label,
          createdAt,
          summary?.role,
          summary?.preview,
          summary?.promptPreview,
          summary?.outcomeLine,
          summaryActors,
          summaryTags,
          displayTurns.map((turn) => `${turn.role} ${turn.content}`),
        ])

        return {
          id: entry.sessionId,
          createdAt,
          createdAtValue,
          statusLabel: statusInfo.label,
          tone: statusInfo.tone,
          turns: displayTurns.map((turn, index) => ({
            id: turn?.id || `${entry.sessionId}-${turn?.idx ?? index}`,
            role: turn?.role || 'system',
            content: turn?.content || '',
          })),
          hiddenCount,
          suppressedCount,
          extraPublicWithinLimited,
          olderShareableCount,
          trimmedTotal,
          summary,
          summaryTags,
          summaryTagKeys,
          participants,
          hasHidden: hiddenCount > 0 || suppressedCount > 0,
          searchText,
        }
      })
      .filter(Boolean)
  }, [sessionHistory])

  const baseSharedHistory = useMemo(() => {
    if (!Array.isArray(sharedSessionHistory)) return []
    return sharedSessionHistory
      .map((entry) => {
        if (!entry || !entry.id) return null
        const statusInfo = describeSessionStatus(entry.status)
        const createdAtValueRaw = entry.created_at ? Date.parse(entry.created_at) : NaN
        const createdAtValue = Number.isFinite(createdAtValueRaw) ? createdAtValueRaw : null
        const createdAt = formatDate(entry.created_at)
        const turns = Array.isArray(entry.turns) ? entry.turns : []
        const visibleTurns = turns.filter((turn) => turn?.is_visible !== false)
        const viewerIsOwner = !!entry.viewer_is_owner
        const ownerId = entry.owner_id || null

        let baseHeroName = '시스템'
        let roleLabel = ''

        if (ownerId) {
          if (viewerIsOwner) {
            baseHeroName = myHeroDisplayName || '내 캐릭터'
            roleLabel = myRoleName || ''
            if (!myHeroDisplayName) {
              const participant = participantsByOwnerId.get(ownerId)
              if (participant) {
                baseHeroName =
                  (participant.hero && participant.hero.name) ||
                  (participant.hero_id ? `#${participant.hero_id}` : '참가자')
                roleLabel = roleLabel || participant.role || ''
              }
            }
          } else {
            const participant = participantsByOwnerId.get(ownerId)
            if (participant) {
              baseHeroName =
                (participant.hero && participant.hero.name) ||
                (participant.hero_id ? `#${participant.hero_id}` : '참가자')
              roleLabel = participant.role || ''
            } else {
              baseHeroName = '참가자'
              roleLabel = ''
            }
          }
        }

        const ownerName = baseHeroName
        const ownerLine = [roleLabel, baseHeroName].filter(Boolean).join(' · ')
        const displayTurns = visibleTurns.map((turn, index) => ({
          id: turn?.id || `${entry.id}-${turn?.idx ?? index}`,
          role: turn?.role || 'system',
          content: turn?.content || '',
        }))
        const hiddenPrivateCount = Number(entry.hidden_private_count) || 0
        const trimmedCount = Number(entry.trimmed_count) || 0
        const totalVisible = Number(entry.total_visible_turns) || visibleTurns.length
        const summary = normalizeSummaryPayload(entry.latest_summary)
        const summaryTags = Array.isArray(summary?.tags)
          ? summary.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
          : []
        const summaryTagKeys = Array.from(
          new Set(summaryTags.map((tag) => tag.toLowerCase())),
        )
        const summaryActors = Array.isArray(summary?.actors)
          ? summary.actors.filter((actor) => typeof actor === 'string' && actor.trim().length > 0)
          : []
        const participantsSet = new Set(summaryActors)
        if (ownerName) {
          participantsSet.add(ownerName)
        }
        if (viewerIsOwner) {
          participantsSet.add('내 세션')
        }
        const participantList = Array.from(participantsSet)

        const searchText = buildHistorySearchText([
          statusInfo.label,
          createdAt,
          ownerName,
          ownerLine,
          summary?.role,
          summary?.preview,
          summary?.promptPreview,
          summary?.outcomeLine,
          summaryActors,
          summaryTags,
          displayTurns.map((turn) => `${turn.role} ${turn.content}`),
        ])

        return {
          id: entry.id,
          createdAt,
          createdAtValue,
          statusLabel: statusInfo.label,
          tone: statusInfo.tone,
          ownerName,
          ownerLine,
          viewerIsOwner,
          turns: displayTurns,
          hiddenPrivateCount,
          trimmedCount,
          totalVisible,
          summary,
          summaryTags,
          summaryTagKeys,
          participants: participantList,
          hasHidden: visibleTurns.length < turns.length,
          searchText,
        }
      })
      .filter(Boolean)
  }, [sharedSessionHistory, participantsByOwnerId, myHeroDisplayName, myRoleName])

  const historyDateFromValue = useMemo(() => {
    if (!historyDateFrom) return null
    const parsed = Date.parse(historyDateFrom)
    return Number.isFinite(parsed) ? parsed : null
  }, [historyDateFrom])

  const historyDateToValue = useMemo(() => {
    if (!historyDateTo) return null
    const parsed = Date.parse(historyDateTo)
    if (!Number.isFinite(parsed)) {
      return null
    }
    return parsed + 24 * 60 * 60 * 1000 - 1
  }, [historyDateTo])

  const historyParticipantOptions = useMemo(() => {
    const values = new Set()
    baseSessionHistory.forEach((entry) => {
      if (!entry?.participants) return
      entry.participants.forEach((name) => {
        if (typeof name === 'string' && name.trim().length > 0) {
          values.add(name.trim())
        }
      })
    })
    baseSharedHistory.forEach((entry) => {
      if (!entry?.participants) return
      entry.participants.forEach((name) => {
        if (typeof name === 'string' && name.trim().length > 0) {
          values.add(name.trim())
        }
      })
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [baseSessionHistory, baseSharedHistory])

  const historyTagOptions = useMemo(() => {
    const map = new Map()
    const collect = (entry) => {
      if (!entry?.summaryTags) return
      entry.summaryTags.forEach((tag) => {
        if (typeof tag !== 'string') return
        const trimmed = tag.trim()
        if (!trimmed) return
        const key = trimmed.toLowerCase()
        if (!map.has(key)) {
          map.set(key, trimmed)
        }
      })
    }
    baseSessionHistory.forEach(collect)
    baseSharedHistory.forEach(collect)
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [baseSessionHistory, baseSharedHistory])

  useEffect(() => {
    if (historyTagFilter === 'all') return
    const lower = historyTagFilter.toLowerCase()
    const hasTag = historyTagOptions.some((tag) => tag.toLowerCase() === lower)
    if (!hasTag) {
      setHistoryTagFilter('all')
    }
  }, [historyTagFilter, historyTagOptions])

  const historyFiltersActive =
    historySearchTokens.length > 0 ||
    historyStatusFilter !== 'all' ||
    historyParticipantFilter !== 'all' ||
    historyVisibilityFilter !== 'all' ||
    historyTagFilter !== 'all' ||
    !!historyDateFromValue ||
    !!historyDateToValue

  const normalizedSessionHistory = useMemo(() => {
    if (!baseSessionHistory.length) return baseSessionHistory
    return baseSessionHistory.filter((entry) => {
      if (historyStatusFilter !== 'all' && entry.tone !== historyStatusFilter) {
        return false
      }
      if (historyParticipantFilter !== 'all') {
        if (!entry.participants || !entry.participants.includes(historyParticipantFilter)) {
          return false
        }
      }
      if (historyVisibilityFilter === 'with-hidden' && !entry.hasHidden) {
        return false
      }
      if (historyVisibilityFilter === 'without-hidden' && entry.hasHidden) {
        return false
      }
      if (historyTagFilter !== 'all') {
        if (!entry.summaryTagKeys || !entry.summaryTagKeys.includes(historyTagFilter.toLowerCase())) {
          return false
        }
      }
      if (historyDateFromValue && (!entry.createdAtValue || entry.createdAtValue < historyDateFromValue)) {
        return false
      }
      if (historyDateToValue && (!entry.createdAtValue || entry.createdAtValue > historyDateToValue)) {
        return false
      }
      if (!historySearchTokens.length) return true
      if (!entry.searchText) return false
      return historySearchTokens.every((token) => entry.searchText.includes(token))
    })
  }, [
    baseSessionHistory,
    historySearchTokens,
    historyStatusFilter,
    historyParticipantFilter,
    historyVisibilityFilter,
    historyTagFilter,
    historyDateFromValue,
    historyDateToValue,
  ])

  const normalizedSharedHistory = useMemo(() => {
    if (!baseSharedHistory.length) return baseSharedHistory
    return baseSharedHistory.filter((entry) => {
      if (historyStatusFilter !== 'all' && entry.tone !== historyStatusFilter) {
        return false
      }
      if (historyParticipantFilter !== 'all') {
        if (!entry.participants || !entry.participants.includes(historyParticipantFilter)) {
          return false
        }
      }
      if (historyVisibilityFilter === 'with-hidden' && !entry.hasHidden) {
        return false
      }
      if (historyVisibilityFilter === 'without-hidden' && entry.hasHidden) {
        return false
      }
      if (historyTagFilter !== 'all') {
        if (!entry.summaryTagKeys || !entry.summaryTagKeys.includes(historyTagFilter.toLowerCase())) {
          return false
        }
      }
      if (historyDateFromValue && (!entry.createdAtValue || entry.createdAtValue < historyDateFromValue)) {
        return false
      }
      if (historyDateToValue && (!entry.createdAtValue || entry.createdAtValue > historyDateToValue)) {
        return false
      }
      if (!historySearchTokens.length) return true
      if (!entry.searchText) return false
      return historySearchTokens.every((token) => entry.searchText.includes(token))
    })
  }, [
    baseSharedHistory,
    historySearchTokens,
    historyStatusFilter,
    historyParticipantFilter,
    historyVisibilityFilter,
    historyTagFilter,
    historyDateFromValue,
    historyDateToValue,
  ])

  const handleHistorySearchChange = useCallback((event) => {
    const value = event?.target?.value ?? ''
    setHistorySearch(value)
  }, [])

  const handleHistoryStatusChange = useCallback((event) => {
    const value = event?.target?.value ?? 'all'
    setHistoryStatusFilter(value || 'all')
  }, [])

  const handleHistoryParticipantChange = useCallback((event) => {
    const value = event?.target?.value ?? 'all'
    setHistoryParticipantFilter(value || 'all')
  }, [])

  const handleHistoryVisibilityChange = useCallback((event) => {
    const value = event?.target?.value ?? 'all'
    setHistoryVisibilityFilter(value || 'all')
  }, [])

  const handleHistoryTagChange = useCallback((event) => {
    const value = event?.target?.value ?? 'all'
    setHistoryTagFilter(value || 'all')
  }, [])

  const handleHistoryDateFromChange = useCallback((event) => {
    const value = event?.target?.value ?? ''
    setHistoryDateFrom(value)
  }, [])

  const handleHistoryDateToChange = useCallback((event) => {
    const value = event?.target?.value ?? ''
    setHistoryDateTo(value)
  }, [])

  const handleHistoryFilterReset = useCallback(() => {
    setHistorySearch('')
    setHistoryStatusFilter('all')
    setHistoryParticipantFilter('all')
    setHistoryVisibilityFilter('all')
    setHistoryTagFilter('all')
    setHistoryDateFrom('')
    setHistoryDateTo('')
  }, [])

  const sharedHistoryBadgeValue = baseSharedHistory.length
    ? historyFiltersActive
      ? `${normalizedSharedHistory.length}/${baseSharedHistory.length}`
      : `${baseSharedHistory.length}`
    : null

  const sessionHistoryBadgeValue = baseSessionHistory.length
    ? historyFiltersActive
      ? `${normalizedSessionHistory.length}/${baseSessionHistory.length}`
      : `${baseSessionHistory.length}`
    : null

  const sharedHistoryEmptyMessage = baseSharedHistory.length
    ? '조건에 맞는 기록이 없습니다.'
    : '아직 공유 히스토리가 없습니다.'

  const sessionHistoryEmptyMessage = baseSessionHistory.length
    ? '조건에 맞는 기록이 없습니다.'
    : '매칭을 시작하면 최근 세션 기록이 이곳에 표시됩니다.'

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

  const [rankingMode, setRankingMode] = useState('overall')
  const [selectedRole, setSelectedRole] = useState('')
  const [activeProfileEntry, setActiveProfileEntry] = useState(null)

  useEffect(() => {
    if (!roleRankings.length) {
      setSelectedRole('')
      if (rankingMode === 'role') {
        setRankingMode('overall')
      }
      return
    }

    setSelectedRole((current) => {
      if (current) return current
      return roleRankings[0]?.role || ''
    })
  }, [rankingMode, roleRankings])

  const selectedRoleGroup = useMemo(() => {
    if (!selectedRole) return null
    return roleRankings.find((group) => group.role === selectedRole) || null
  }, [roleRankings, selectedRole])

  const handleRankingModeChange = useCallback((mode) => {
    setRankingMode(mode)
  }, [])

  const handleRoleModeClick = useCallback(() => {
    if (!roleRankings.length) return
    setRankingMode('role')
    setSelectedRole((current) => current || roleRankings[0]?.role || '')
  }, [roleRankings])

  const handleRoleSelectChange = useCallback((event) => {
    const value = event?.target?.value || ''
    setSelectedRole(value)
    if (value) {
      setRankingMode('role')
    }
  }, [])

  const handleOpenProfile = useCallback((entry, rankPosition) => {
    if (!entry?.hero) return
    setActiveProfileEntry({ entry, hero: entry.hero, rankPosition })
  }, [])

  const handleCloseProfile = useCallback(() => {
    setActiveProfileEntry(null)
  }, [])

  useEffect(() => {
    if (!activeProfileEntry) return

    if (profileCloseRef.current) {
      profileCloseRef.current.focus()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleCloseProfile()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeProfileEntry, handleCloseProfile])

  const profileHero = activeProfileEntry?.hero || null

  const profileStats = useMemo(() => {
    if (!activeProfileEntry) return []
    const { entry, rankPosition } = activeProfileEntry
    const stats = [
      { label: '역할', value: entry.role || '미정' },
      { label: '점수', value: formatNumber(entry.score ?? entry.rating ?? 0) },
      { label: '랭킹', value: rankPosition ? `${rankPosition}위` : '순위 정보 없음' },
      { label: '게임 수', value: formatNumber(entry.battles ?? 0) },
      { label: '승률', value: formatWinRate(entry.win_rate) },
    ]
    return stats
  }, [activeProfileEntry])

  const profileAbilities = useMemo(() => {
    if (!profileHero) return []
    return [profileHero.ability1, profileHero.ability2, profileHero.ability3, profileHero.ability4].filter(Boolean)
  }, [profileHero])

  const handleProfileBackdropClick = useCallback(
    (event) => {
      if (event.target === event.currentTarget) {
        handleCloseProfile()
      }
    },
    [handleCloseProfile]
  )

  const profileDialogDescribedBy = profileHero?.description ? profileDescriptionId : undefined

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

  const handleJoinClick = useCallback(async () => {
    if (!onJoin || alreadyJoined || joinLoading) return
    setJoinLoading(true)
    try {
      await onJoin()
    } finally {
      setJoinLoading(false)
    }
  }, [alreadyJoined, joinLoading, onJoin])

  const handleLeaveClick = useCallback(async () => {
    if (!onLeave || leaveLoading) return
    setLeaveLoading(true)
    try {
      await onLeave()
    } finally {
      setLeaveLoading(false)
    }
  }, [leaveLoading, onLeave])

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
        {Array.isArray(roleOccupancy) && roleOccupancy.length > 0 ? (
          <div className={styles.roleOccupancyList}>
            {roleOccupancy.map((entry) => {
              const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
              if (!name) return null
              const total = Number.isFinite(Number(entry?.totalSlots)) && Number(entry.totalSlots) >= 0
                ? Number(entry.totalSlots)
                : null
              const participantCount = Number.isFinite(Number(entry?.participantCount))
                ? Number(entry.participantCount)
                : 0
              let occupied = Number.isFinite(Number(entry?.occupiedSlots))
                ? Number(entry.occupiedSlots)
                : participantCount
              if (total != null && occupied > total) {
                occupied = total
              }
              const available = Number.isFinite(Number(entry?.availableSlots)) && Number(entry.availableSlots) >= 0
                ? Number(entry.availableSlots)
                : null
              const countLabel = total != null ? `${occupied}/${total}` : `${occupied}`
              const availabilityText =
                available != null ? (available > 0 ? `남은 슬롯 ${available}` : '정원 가득') : null
              const itemClasses = [styles.roleOccupancyItem]
              if (available === 0) {
                itemClasses.push(styles.roleOccupancyItemFull)
              }
              return (
                <div key={name} className={itemClasses.join(' ')}>
                  <div className={styles.roleOccupancyMeta}>
                    <span className={styles.roleOccupancyName}>{name}</span>
                    <span className={styles.roleOccupancyCount}>{countLabel}</span>
                  </div>
                  {availabilityText ? (
                    <span className={styles.roleOccupancyAvailability}>{availabilityText}</span>
                  ) : null}
                </div>
              )
            }).filter(Boolean)}
          </div>
        ) : null}

        {Array.isArray(roleLeaderboards) && roleLeaderboards.length > 0 ? (
          <div className={styles.roleLeaderboardSection}>
            <h3 className={styles.roleLeaderboardTitle}>역할별 리더보드</h3>
            <div className={styles.roleLeaderboardGrid}>
              {roleLeaderboards.map((group) => {
                const roleName = typeof group?.role === 'string' ? group.role : ''
                if (!roleName) return null
                const totalCount = Number.isFinite(Number(group?.totalParticipants))
                  ? Number(group.totalParticipants)
                  : group?.entries?.length || 0
                return (
                  <div key={roleName} className={styles.roleLeaderboardGroup}>
                    <div className={styles.roleLeaderboardHeader}>
                      <span className={styles.roleLeaderboardRole}>{roleName}</span>
                      <span className={styles.roleLeaderboardCount}>
                        참가 {totalCount}명
                      </span>
                    </div>
                    {Array.isArray(group?.entries) && group.entries.length > 0 ? (
                      <ul className={styles.roleLeaderboardList}>
                        {group.entries.map((entry, idx) => {
                          const key = entry?.id || `${roleName}-${idx}`
                          const heroName =
                            typeof entry?.heroName === 'string' && entry.heroName.trim()
                              ? entry.heroName.trim()
                              : '미지정'
                          const rating = Number.isFinite(Number(entry?.rating))
                            ? Number(entry.rating)
                            : null
                          const score = Number.isFinite(Number(entry?.score))
                            ? Number(entry.score)
                            : null
                          const winRateValue = Number.isFinite(Number(entry?.winRate))
                            ? Number(entry.winRate)
                            : null
                          const battlesValue = Number.isFinite(Number(entry?.battles))
                            ? Number(entry.battles)
                            : null
                          const statParts = []
                          if (rating != null) {
                            statParts.push(`레이팅 ${rating}`)
                          }
                          if (score != null) {
                            statParts.push(`점수 ${score}`)
                          }
                          if (winRateValue != null) {
                            const formattedWinRate = Math.round(winRateValue * 10) / 10
                            if (battlesValue != null) {
                              statParts.push(`승률 ${formattedWinRate}% · ${battlesValue}전`)
                            } else {
                              statParts.push(`승률 ${formattedWinRate}%`)
                            }
                          } else if (battlesValue != null) {
                            statParts.push(`${battlesValue}전 기록`)
                          }

                          return (
                            <li key={key} className={styles.roleLeaderboardItem}>
                              <span className={styles.roleLeaderboardRank}>{idx + 1}</span>
                              <div className={styles.roleLeaderboardAvatar}>
                                {entry?.hero?.image_url ? (
                                  <img src={entry.hero.image_url} alt="" />
                                ) : (
                                  <span className={styles.roleLeaderboardAvatarFallback}>
                                    {heroName.slice(0, 2)}
                                  </span>
                                )}
                              </div>
                              <div className={styles.roleLeaderboardMeta}>
                                <span className={styles.roleLeaderboardName}>{heroName}</span>
                                {statParts.length > 0 ? (
                                  <span className={styles.roleLeaderboardStats}>
                                    {statParts.join(' · ')}
                                  </span>
                                ) : null}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className={styles.roleLeaderboardEmpty}>아직 기록이 없습니다.</p>
                    )}
                  </div>
                )
              }).filter(Boolean)}
            </div>
          </div>
        ) : null}

        <div className={styles.capacityRow}>
          <span className={styles.capacityCount}>{capacityCountLabel}</span>
          <div className={styles.capacityLabels}>
            {minimumParticipants > 0 ? (
              <span className={styles.capacityHint}>최소 필요 인원 {minimumParticipants}명</span>
            ) : null}
            <span className={`${styles.capacityStatus} ${canStart ? styles.capacityReady : ''}`}>
              {capacityStatusText}
            </span>
          </div>
        </div>

        {participantsByRole.length > 0 ? (
          <div className={styles.roleList}>
            {participantsByRole.map(({ name, count, capacity, occupiedSlots, availableSlots }) => {
              const isPicked = currentRole === name
              const isMine = myEntry?.role === name
              const highlight = isPicked || isMine
              const capacityValue =
                Number.isFinite(Number(capacity)) && Number(capacity) >= 0 ? Number(capacity) : null
              const occupiedValue =
                Number.isFinite(Number(occupiedSlots)) && Number(occupiedSlots) >= 0
                  ? Number(occupiedSlots)
                  : count
              const remaining =
                Number.isFinite(Number(availableSlots)) && Number(availableSlots) >= 0
                  ? Number(availableSlots)
                  : null
              const full = capacityValue != null && occupiedValue >= capacityValue
              const label =
                capacityValue != null ? `${occupiedValue}/${capacityValue}명` : `${count}명 참여 중`
              const classes = [styles.roleChip]
              if (highlight) classes.push(styles.roleChipActive)
              if (alreadyJoined && !isMine) classes.push(styles.roleChipDisabled)
              if (full && !isMine) classes.push(styles.roleChipFull)
              const disabled = (alreadyJoined && !isMine) || (full && !isMine)
              return (
                <button
                  key={name}
                  type="button"
                  className={classes.join(' ')}
                  onClick={() => onChangeRole?.(name)}
                  disabled={disabled}
                >
                  <span className={styles.roleName}>{name}</span>
                  <span className={styles.roleCount}>{label}</span>
                  {remaining != null ? (
                    <span className={styles.roleAvailability}>
                      {remaining > 0 ? `남은 슬롯 ${remaining}` : '정원 가득'}
                    </span>
                  ) : full && !isMine ? (
                    <span className={styles.roleFullTag}>정원 마감</span>
                  ) : null}
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
          {alreadyJoined && onLeave ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleLeaveClick}
              disabled={leaveLoading}
            >
              {leaveLoading ? '슬롯 비우는 중…' : '슬롯 비우기'}
            </button>
          ) : null}
          {onOpenModeSettings ? (
            <button
              type="button"
              className={styles.modeButton}
              onClick={onOpenModeSettings}
              disabled={startDisabled || startLoading}
            >
              {startLoading ? '매칭 준비 중…' : '모드 선택 열기'}
            </button>
          ) : null}
        </div>

        {resolvedStartNotice ? (
          <p className={styles.startNotice}>{resolvedStartNotice}</p>
        ) : null}
        {resolvedStartError ? (
          <p className={styles.startError}>{resolvedStartError}</p>
        ) : null}

        <p className={styles.capacityHint}>
          {canStart
            ? '게임을 시작하면 비슷한 점수의 참가자들이 자동으로 선발됩니다.'
            : '최소 두 명 이상이 모이면 비슷한 점수대끼리 경기 준비가 완료됩니다.'}
        </p>
        <p className={styles.capacitySubHint}>
          준비가 완료되면 모드 선택 창이 열리며 매칭이 자동으로 진행됩니다.
        </p>

        <TurnTimerVotePanel
          value={turnTimerVote}
          onChange={onVoteTurnTimer}
          voteSummary={voteSummary}
        />

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
          <h2 className={styles.sectionTitle}>공용 히스토리</h2>
          {sharedHistoryBadgeValue ? (
            <span className={styles.sectionBadge}>{sharedHistoryBadgeValue}</span>
          ) : null}
        </div>
        <div className={styles.sessionHistoryControls}>
          <div className={styles.sessionHistoryControlRow}>
            <input
              type="search"
              className={styles.sessionHistorySearch}
              placeholder="요약·참여자·문장 검색"
              value={historySearch}
              onChange={handleHistorySearchChange}
              aria-label="세션 요약 검색"
              autoComplete="off"
            />
            <select
              className={styles.sessionHistoryFilter}
              value={historyStatusFilter}
              onChange={handleHistoryStatusChange}
              aria-label="세션 상태 필터"
            >
              <option value="all">전체 상태</option>
              <option value="completed">종료된 세션</option>
              <option value="active">진행 중</option>
              <option value="failed">중단됨</option>
            </select>
            {historyParticipantOptions.length ? (
              <select
                className={styles.sessionHistoryFilter}
                value={historyParticipantFilter}
                onChange={handleHistoryParticipantChange}
                aria-label="참여자 필터"
              >
                <option value="all">전체 참여자</option>
                {historyParticipantOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              className={styles.sessionHistoryFilter}
              value={historyVisibilityFilter}
              onChange={handleHistoryVisibilityChange}
              aria-label="숨김 여부 필터"
            >
              <option value="all">숨김 포함 여부</option>
              <option value="with-hidden">숨김 기록 포함</option>
              <option value="without-hidden">숨김 없는 세션</option>
            </select>
            {historyFiltersActive ? (
              <button type="button" className={styles.sessionHistoryClear} onClick={handleHistoryFilterReset}>
                필터 초기화
              </button>
            ) : null}
          </div>
          <div className={styles.sessionHistoryControlRow}>
            {historyTagOptions.length ? (
              <select
                className={styles.sessionHistoryFilter}
                value={historyTagFilter}
                onChange={handleHistoryTagChange}
                aria-label="요약 태그 필터"
              >
                <option value="all">전체 태그</option>
                {historyTagOptions.map((option) => (
                  <option key={option} value={option}>
                    #{option}
                  </option>
                ))}
              </select>
            ) : null}
            <label className={styles.sessionHistoryDateLabel}>
              <span className={styles.sessionHistoryDateText}>시작일</span>
              <input
                type="date"
                className={`${styles.sessionHistoryFilter} ${styles.sessionHistoryDateInput}`}
                value={historyDateFrom}
                onChange={handleHistoryDateFromChange}
                aria-label="시작일 필터"
              />
            </label>
            <label className={styles.sessionHistoryDateLabel}>
              <span className={styles.sessionHistoryDateText}>종료일</span>
              <input
                type="date"
                className={`${styles.sessionHistoryFilter} ${styles.sessionHistoryDateInput}`}
                value={historyDateTo}
                onChange={handleHistoryDateToChange}
                aria-label="종료일 필터"
                min={historyDateFrom || undefined}
              />
            </label>
          </div>
        </div>
        {normalizedSharedHistory.length ? (
          <ul className={styles.sessionHistoryList}>
            {normalizedSharedHistory.map((entry) => {
              const statusClass =
                entry.tone === 'completed'
                  ? styles.sessionHistoryStatusCompleted
                  : entry.tone === 'failed'
                    ? styles.sessionHistoryStatusFailed
                    : styles.sessionHistoryStatusActive

              return (
                <li key={entry.id} className={styles.sessionHistoryItem}>
                  <div className={styles.sessionHistoryHeader}>
                    <span className={`${styles.sessionHistoryStatus} ${statusClass}`}>
                      {entry.statusLabel}
                    </span>
                    {entry.createdAt ? (
                      <span className={styles.sessionHistoryTimestamp}>{entry.createdAt}</span>
                    ) : null}
                  </div>
                  <div className={styles.sessionHistoryMeta}>
                    <span
                      className={`${styles.sessionHistoryOwner} ${
                        entry.viewerIsOwner ? styles.sessionHistoryOwnerSelf : ''
                      }`}
                    >
                      {entry.viewerIsOwner ? '내 세션' : entry.ownerName}
                    </span>
                    {entry.ownerLine ? (
                      <span className={styles.sessionHistoryOwnerDetail}>{entry.ownerLine}</span>
                    ) : null}
                    <span className={styles.sessionHistoryTurnCount}>
                      공개 기록 {entry.totalVisible}개
                    </span>
                  </div>
                  {entry.summary ? (
                    <div className={styles.sessionHistorySummary}>
                      <div className={styles.sessionHistorySummaryHeader}>
                        <span
                          className={`${styles.sessionHistoryBadge} ${styles.sessionHistoryBadgeSummary}`}
                        >
                          요약
                        </span>
                        {entry.summary.role ? (
                          <span className={styles.sessionHistorySummaryRole}>{entry.summary.role}</span>
                        ) : null}
                        {entry.summary.actors && entry.summary.actors.length ? (
                          <span className={styles.sessionHistorySummaryActors}>
                            {entry.summary.actors.join(', ')}
                          </span>
                        ) : null}
                      </div>
                      {entry.summary.preview ? (
                        <p className={styles.sessionHistorySummaryText}>{entry.summary.preview}</p>
                      ) : null}
                      {entry.summary.promptPreview ? (
                        <p className={styles.sessionHistorySummaryHint}>
                          프롬프트: {entry.summary.promptPreview}
                        </p>
                      ) : null}
                      {entry.summary.outcomeLine ? (
                        <p className={styles.sessionHistorySummaryHint}>
                          결론: {entry.summary.outcomeLine}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {entry.summaryTags && entry.summaryTags.length ? (
                    <div className={styles.sessionHistoryTagRow}>
                      {entry.summaryTags.map((tag, index) => (
                        <span key={`${entry.id}-tag-${index}`} className={styles.sessionHistoryTag}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {entry.hiddenPrivateCount > 0 || entry.trimmedCount > 0 ? (
                    <div className={styles.sessionHistoryBadgeRow}>
                      {entry.hiddenPrivateCount > 0 ? (
                        <span
                          className={`${styles.sessionHistoryBadge} ${styles.sessionHistoryBadgePrivate}`}
                        >
                          비공개 {entry.hiddenPrivateCount}
                        </span>
                      ) : null}
                      {entry.trimmedCount > 0 ? (
                        <span
                          className={`${styles.sessionHistoryBadge} ${styles.sessionHistoryBadgeArchive}`}
                        >
                          축약 {entry.trimmedCount}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <ul className={styles.sessionHistoryTurns}>
                    {entry.turns.length ? (
                      entry.turns.map((turn) => (
                        <li key={turn.id} className={styles.sessionHistoryTurn}>
                          <span className={styles.sessionHistoryTurnRole}>{turn.role}</span>
                          <p className={styles.sessionHistoryTurnContent}>{turn.content}</p>
                        </li>
                      ))
                    ) : (
                      <li className={styles.sessionHistoryNotice}>공유 가능한 기록이 아직 없습니다.</li>
                    )}
                  </ul>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className={styles.emptyCard}>{sharedHistoryEmptyMessage}</div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>내 세션 히스토리</h2>
          {sessionHistoryBadgeValue ? (
            <span className={styles.sectionBadge}>{sessionHistoryBadgeValue}</span>
          ) : null}
        </div>
        {normalizedSessionHistory.length ? (
          <ul className={styles.sessionHistoryList}>
            {normalizedSessionHistory.map((entry) => {
              const statusClass =
                entry.tone === 'completed'
                  ? styles.sessionHistoryStatusCompleted
                  : entry.tone === 'failed'
                    ? styles.sessionHistoryStatusFailed
                    : styles.sessionHistoryStatusActive
              return (
                <li key={entry.id} className={styles.sessionHistoryItem}>
                  <div className={styles.sessionHistoryHeader}>
                    <span className={`${styles.sessionHistoryStatus} ${statusClass}`}>
                      {entry.statusLabel}
                    </span>
                    {entry.createdAt ? (
                      <span className={styles.sessionHistoryTimestamp}>{entry.createdAt}</span>
                    ) : null}
                  </div>
                  {entry.summary ? (
                    <div className={styles.sessionHistorySummary}>
                      <div className={styles.sessionHistorySummaryHeader}>
                        <span
                          className={`${styles.sessionHistoryBadge} ${styles.sessionHistoryBadgeSummary}`}
                        >
                          요약
                        </span>
                        {entry.summary.role ? (
                          <span className={styles.sessionHistorySummaryRole}>{entry.summary.role}</span>
                        ) : null}
                        {entry.summary.actors && entry.summary.actors.length ? (
                          <span className={styles.sessionHistorySummaryActors}>
                            {entry.summary.actors.join(', ')}
                          </span>
                        ) : null}
                      </div>
                      {entry.summary.preview ? (
                        <p className={styles.sessionHistorySummaryText}>{entry.summary.preview}</p>
                      ) : null}
                      {entry.summary.promptPreview ? (
                        <p className={styles.sessionHistorySummaryHint}>
                          프롬프트: {entry.summary.promptPreview}
                        </p>
                      ) : null}
                      {entry.summary.outcomeLine ? (
                        <p className={styles.sessionHistorySummaryHint}>
                          결론: {entry.summary.outcomeLine}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {entry.summaryTags && entry.summaryTags.length ? (
                    <div className={styles.sessionHistoryTagRow}>
                      {entry.summaryTags.map((tag, index) => (
                        <span key={`${entry.id}-tag-${index}`} className={styles.sessionHistoryTag}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {entry.hiddenCount > 0 || entry.suppressedCount > 0 || entry.trimmedTotal > 0 ||
                  entry.extraPublicWithinLimited > 0 || entry.olderShareableCount > 0 ? (
                    <div className={styles.sessionHistoryBadgeRow}>
                      {entry.hiddenCount > 0 ? (
                        <span
                          className={`${styles.sessionHistoryBadge} ${styles.sessionHistoryBadgePrivate}`}
                        >
                          비공개 {entry.hiddenCount}
                        </span>
                      ) : null}
                      {entry.suppressedCount > 0 ? (
                        <span
                          className={`${styles.sessionHistoryBadge} ${styles.sessionHistoryBadgeSuppressed}`}
                        >
                          숨김 {entry.suppressedCount}
                        </span>
                      ) : null}
                      {entry.extraPublicWithinLimited > 0 ? (
                        <span
                          className={`${styles.sessionHistoryBadge} ${styles.sessionHistoryBadgeOverflow}`}
                        >
                          최근 +{entry.extraPublicWithinLimited}
                        </span>
                      ) : null}
                      {entry.olderShareableCount > 0 ? (
                        <span
                          className={`${styles.sessionHistoryBadge} ${styles.sessionHistoryBadgeQueue}`}
                        >
                          과거 +{entry.olderShareableCount}
                        </span>
                      ) : null}
                      {entry.trimmedTotal > 0 ? (
                        <span
                          className={`${styles.sessionHistoryBadge} ${styles.sessionHistoryBadgeArchive}`}
                        >
                          보관 {entry.trimmedTotal}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <ul className={styles.sessionHistoryTurns}>
                    {entry.turns.length ? (
                      entry.turns.map((turn) => (
                        <li key={turn.id} className={styles.sessionHistoryTurn}>
                          <span className={styles.sessionHistoryTurnRole}>{turn.role}</span>
                          <p className={styles.sessionHistoryTurnContent}>{turn.content}</p>
                        </li>
                      ))
                    ) : (
                      <li className={styles.sessionHistoryNotice}>공개된 기록이 아직 없습니다.</li>
                    )}
                  </ul>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className={styles.emptyCard}>{sessionHistoryEmptyMessage}</div>
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

                {heroAudioProfile && (
                  <div className={styles.heroAudioStatus}>
                    <span className={styles.heroAudioLabel}>{heroAudioSourceLabel}</span>
                    <p className={styles.heroAudioTrack}>
                      {heroAudioProfile.heroName
                        ? `${heroAudioProfile.heroName} 테마`
                        : '브금 트랙'}
                      {heroAudioDurationLabel ? (
                        <span className={styles.heroAudioDuration}>{heroAudioDurationLabel}</span>
                      ) : null}
                    </p>
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

          <div className={styles.rankingControls} role="group" aria-label="랭킹 보기 전환">
            <button
              type="button"
              className={`${styles.rankingModeButton} ${
                rankingMode === 'overall' ? styles.rankingModeButtonActive : ''
              }`}
              onClick={() => handleRankingModeChange('overall')}
            >
              전체 랭킹
            </button>

            <div className={styles.roleSelectGroup}>
              <button
                type="button"
                className={`${styles.rankingModeButton} ${
                  rankingMode === 'role' ? styles.rankingModeButtonActive : ''
                }`}
                onClick={handleRoleModeClick}
                disabled={!roleRankings.length}
              >
                역할군별 랭킹
              </button>
              <label className={styles.roleSelectLabel}>
                <span className={styles.visuallyHidden}>역할 선택</span>
                <select
                  className={styles.roleSelect}
                  value={selectedRole}
                  onChange={handleRoleSelectChange}
                  disabled={!roleRankings.length}
                  aria-label="역할군 선택"
                >
                  {roleRankings.length === 0 ? (
                    <option value="">역할 없음</option>
                  ) : (
                    roleRankings.map(({ role }) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          </div>

          <section className={styles.rankingSection}>
            <h3 className={styles.rankingSectionTitle}>
              {rankingMode === 'overall'
                ? '종합 랭킹 상위 10명'
                : `${selectedRole || '역할군'} 상위 10명`}
            </h3>
            {rankingMode === 'overall' && (
              overallRanking.length === 0 ? (
                <div className={styles.emptyCard}>참가자가 없습니다.</div>
              ) : (
                <ol className={styles.rankingList}>
                  {overallRanking.slice(0, 10).map((entry, index) => {
                    const rankPosition = index + 1
                    const isClickable = Boolean(entry.hero)
                    return (
                      <li key={entry.id || `${entry.owner_id}-${index}`} className={styles.rankingRow}>
                        <button
                          type="button"
                          className={`${styles.rankingRowButton} ${
                            isClickable ? '' : styles.rankingRowButtonDisabled
                          }`}
                          onClick={() => handleOpenProfile(entry, rankPosition)}
                          disabled={!isClickable}
                        >
                          <span className={styles.rankingIndex}>{rankPosition}</span>
                          <div>
                            <strong className={styles.rankingRowName}>
                              {entry.hero?.name || entry.owner_id?.slice(0, 8) || '알 수 없음'}
                            </strong>
                            <span className={styles.rankingRowMeta}>
                              역할 {entry.role || '미정'} · 점수 {formatNumber(entry.score ?? 0)} · {entry.battles ?? 0}전
                            </span>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              )
            )}

            {rankingMode === 'role' && (
              !selectedRoleGroup || selectedRoleGroup.members.length === 0 ? (
                <div className={styles.emptyCard}>해당 역할군 참가자가 없습니다.</div>
              ) : (
                <ol className={styles.rankingList}>
                  {selectedRoleGroup.members.slice(0, 10).map((entry, index) => {
                    const rankPosition = index + 1
                    const isClickable = Boolean(entry.hero)
                    return (
                      <li key={entry.id || `${entry.owner_id}-${index}`} className={styles.rankingRow}>
                        <button
                          type="button"
                          className={`${styles.rankingRowButton} ${
                            isClickable ? '' : styles.rankingRowButtonDisabled
                          }`}
                          onClick={() => handleOpenProfile(entry, rankPosition)}
                          disabled={!isClickable}
                        >
                          <span className={styles.rankingIndex}>{rankPosition}</span>
                          <div>
                            <strong className={styles.rankingRowName}>
                              {entry.hero?.name || entry.owner_id?.slice(0, 8) || '알 수 없음'}
                            </strong>
                            <span className={styles.rankingRowMeta}>
                              점수 {formatNumber(entry.score ?? 0)} · {entry.battles ?? 0}전
                            </span>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              )
            )}
          </section>

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

      {activeProfileEntry && (
        <div
          className={styles.profileOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby={profileTitleId}
          aria-describedby={profileDialogDescribedBy}
          onClick={handleProfileBackdropClick}
        >
          <div className={styles.profileCard} role="document">
            <button
              type="button"
              ref={profileCloseRef}
              className={styles.profileCloseButton}
              onClick={handleCloseProfile}
            >
              닫기
            </button>

            <div className={styles.profileHeroHeader}>
              {profileHero?.image_url ? (
                <img
                  className={styles.profileHeroImage}
                  src={profileHero.image_url}
                  alt={profileHero?.name || '캐릭터 이미지'}
                  loading="lazy"
                />
              ) : (
                <div className={styles.profileHeroImageFallback}>이미지가 없습니다.</div>
              )}

              <div className={styles.profileHeroSummary}>
                <h3 id={profileTitleId} className={styles.profileHeroName}>
                  {profileHero?.name || '알 수 없는 캐릭터'}
                </h3>
                {profileHero?.description && (
                  <p id={profileDescriptionId} className={styles.profileHeroDescription}>
                    {profileHero.description}
                  </p>
                )}
              </div>
            </div>

            <div className={styles.profileBody}>
              <div className={styles.profileStats}>
                <h4 className={styles.profileSectionTitle}>전적</h4>
                <ul className={styles.profileStatList}>
                  {profileStats.map((stat) => (
                    <li key={stat.label} className={styles.profileStatItem}>
                      <span className={styles.profileStatLabel}>{stat.label}</span>
                      <span className={styles.profileStatValue}>{stat.value}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {profileAbilities.length > 0 && (
                <div className={styles.profileAbilities}>
                  <h4 className={styles.profileSectionTitle}>능력</h4>
                  <ul className={styles.profileAbilityList}>
                    {profileAbilities.map((ability, index) => (
                      <li key={`${ability}-${index}`} className={styles.profileAbilityItem}>
                        {ability}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
