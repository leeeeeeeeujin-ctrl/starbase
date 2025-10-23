import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import {
  TURN_TIMER_OPTIONS,
  TURN_TIMER_VALUES,
  pickTurnTimer,
} from '../../lib/rank/turnTimers'
import {
  START_SESSION_KEYS,
  readStartSessionValue,
  writeStartSessionValue,
} from '../../lib/rank/startSessionChannel'
import { buildMatchMetaPayload, storeStartMatchMeta } from './startConfig'
import { clearMatchConfirmation, saveMatchConfirmation } from './matchStorage'
import { MATCH_DEBUG_HOLD_ENABLED, buildDebugHoldSnapshot } from './matchDebugUtils'

import useMatchQueue from './hooks/useMatchQueue'
import useLocalMatchPlanner from './hooks/useLocalMatchPlanner'
import styles from './MatchQueueClient.module.css'
import { buildRoleSummaries } from './queueSummaryUtils'
import { emitQueueLeaveBeacon } from '../../lib/rank/matchmakingService'
import {
  registerMatchConnections,
  removeConnectionEntries,
} from '../../lib/rank/startConnectionRegistry'
import {
  hydrateGameMatchData,
  setGameMatchConfirmation,
  setGameMatchHeroSelection,
  setGameMatchParticipation,
  setGameMatchPostCheck,
  setGameMatchSnapshot,
} from '../../modules/rank/matchDataStore'

function groupQueue(queue) {
  const map = new Map()
  queue.forEach((entry) => {
    const role = entry.role || '역할 미지정'
    if (!map.has(role)) {
      map.set(role, [])
    }
    map.get(role).push(entry)
  })
  return Array.from(map.entries())
}

function resolveHero(heroMap, heroId) {
  if (!heroId) return null
  if (heroMap instanceof Map) {
    return heroMap.get(heroId) || heroMap.get(String(heroId)) || null
  }
  if (heroMap && typeof heroMap === 'object') {
    return heroMap[heroId] || heroMap[String(heroId)] || null
  }
  return null
}

function normaliseRoleKey(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim().toLowerCase()
  return ''
}

function pickAutoHeroCandidate({ heroOptions = [], viewerRoster = [], targetRole }) {
  const normalizedRole = normaliseRoleKey(targetRole)
  const optionList = Array.isArray(heroOptions) ? heroOptions : []
  const rosterList = Array.isArray(viewerRoster) ? viewerRoster : []

  if (optionList.length) {
    const roleMatch = optionList.find((option) => {
      if (!option || !option.heroId) return false
      const optionRole = normaliseRoleKey(option.role)
      if (normalizedRole) {
        return optionRole === normalizedRole
      }
      return false
    })
    if (roleMatch?.heroId) {
      return String(roleMatch.heroId)
    }

    const anyMatch = optionList.find((option) => option?.heroId)
    if (anyMatch?.heroId) {
      return String(anyMatch.heroId)
    }
  }

  let fallback = ''
  for (const entry of rosterList) {
    if (!entry) continue
    const heroId = entry.heroId ? String(entry.heroId) : ''
    if (!heroId) continue
    const entryRole = normaliseRoleKey(entry.role)
    if (normalizedRole && entryRole === normalizedRole) {
      return heroId
    }
    if (!fallback) {
      fallback = heroId
    }
  }

  return fallback || ''
}

function toSlotIndex(value) {
  if (value == null) return null
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null
}

function buildSlotEntries(assignment) {
  if (!assignment || typeof assignment !== 'object') {
    return []
  }

  const fallbackRole =
    typeof assignment.role === 'string' && assignment.role.trim()
      ? assignment.role.trim()
      : '역할 미지정'

  const roleSlots = Array.isArray(assignment.roleSlots)
    ? assignment.roleSlots
    : Array.isArray(assignment.slots)
    ? assignment.slots
    : []

  if (roleSlots.length) {
    return roleSlots
      .map((slot, ordinal) => {
        if (!slot || typeof slot !== 'object') {
          return null
        }

        const slotIndex =
          toSlotIndex(slot.slotIndex ?? slot.slot_index ?? slot.slotNo ?? slot.slot_no ?? slot.index) ?? null
        const displayIndex = slotIndex != null ? slotIndex : ordinal
        const slotRole =
          typeof slot.role === 'string' && slot.role.trim() ? slot.role.trim() : fallbackRole
        const members = Array.isArray(slot.members)
          ? slot.members.filter(Boolean)
          : slot.member
          ? [slot.member].filter(Boolean)
          : []

        return {
          key:
            slot.slot_id ||
            slot.slotId ||
            (slotIndex != null ? `slot-${slotIndex}` : `slot-ordinal-${ordinal}`),
          slotIndex,
          displayIndex,
          role: slotRole,
          members,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.slotIndex != null && b.slotIndex != null) {
          return a.slotIndex - b.slotIndex
        }
        if (a.slotIndex != null) return -1
        if (b.slotIndex != null) return 1
        return a.displayIndex - b.displayIndex
      })
      .map((entry, order) => ({ ...entry, order }))
  }

  const members = Array.isArray(assignment.members) ? assignment.members.filter(Boolean) : []
  if (!members.length) {
    return []
  }

  return [
    {
      key: 'fallback-slot',
      slotIndex: null,
      displayIndex: 0,
      role: fallbackRole,
      members,
      order: 0,
    },
  ]
}

function MemberList({ assignment, heroMap }) {
  const slots = buildSlotEntries(assignment)
  if (!slots.length) return null

  return (
    <div className={styles.slotList}>
      {slots.map((slot) => {
        const displayNumber = (slot.slotIndex != null ? slot.slotIndex : slot.order) + 1
        const slotLabel = `${displayNumber}슬롯`
        const slotMembers = slot.members || []
        return (
          <div key={`${slot.key}-${slot.order}`} className={styles.slotItem}>
            <div className={styles.slotHeader}>
              <span className={styles.slotIndexLabel}>{slotLabel}</span>
              <span className={styles.slotRoleLabel}>{slot.role || '역할 미지정'}</span>
            </div>
            {slotMembers.length ? (
              <ul className={styles.memberList}>
                {slotMembers.map((member, memberIndex) => {
                  if (!member || typeof member !== 'object') {
                    return null
                  }
                  const key =
                    member.id ||
                    `${member.owner_id || member.ownerId}-${member.hero_id || member.heroId}-${memberIndex}`
                  const heroId = member.hero_id || member.heroId
                  const hero = resolveHero(heroMap, heroId)
                  const label = hero?.name || member.name || member.hero_name || '미지정 영웅'
                  const score = member.score ?? member.rating ?? member.mmr
                  const source =
                    member.match_source || (member.standin ? 'participant_pool' : 'realtime_queue')
                  const sourceLabel =
                    source === 'participant_pool' ? '대역' : source === 'realtime_queue' ? '실시간' : '기타'
                  const sourceClass =
                    source === 'participant_pool'
                      ? styles.memberSourceStandin
                      : source === 'realtime_queue'
                      ? styles.memberSourceRealtime
                      : styles.memberSourceUnknown
                  return (
                    <li key={key} className={styles.memberItem}>
                      {hero?.image_url ? (
                        <img
                          className={styles.memberAvatar}
                          src={hero.image_url}
                          alt={label}
                        />
                      ) : (
                        <div className={styles.memberAvatarPlaceholder} />
                      )}
                      <div className={styles.memberMeta}>
                        <span className={styles.memberName}>{label}</span>
                        <span className={`${styles.memberSourceBadge} ${sourceClass}`}>{sourceLabel}</span>
                        {Number.isFinite(score) ? (
                          <span className={styles.memberScore}>{score}</span>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className={styles.emptySlot}>현재 비어 있습니다.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RosterHeroPicker({
  entries = [],
  heroMap = new Map(),
  selectedHeroId,
  onSelect,
  disabled,
}) {
  const cards = useMemo(() => {
    if (!Array.isArray(entries)) return []
    return entries
      .map((entry) => {
        if (!entry) return null
        const heroId = entry.heroId ? String(entry.heroId) : ''
        if (!heroId) return null
        const meta = heroMap instanceof Map ? heroMap.get(heroId) || heroMap.get(String(heroId)) : null
        const name =
          meta?.name ||
          meta?.hero_name ||
          entry.raw?.name ||
          entry.raw?.hero_name ||
          entry.name ||
          `ID ${heroId}`
        const role = entry.role || meta?.role || ''
        const score =
          Number.isFinite(Number(entry.score))
            ? Number(entry.score)
            : Number.isFinite(Number(meta?.score))
            ? Number(meta.score)
            : null
        const avatarUrl = meta?.image_url || meta?.avatar_url || entry.raw?.hero_avatar_url || null
        const status = entry.status || meta?.status || ''
        return {
          heroId,
          name,
          role,
          score,
          avatarUrl,
          status,
        }
      })
      .filter(Boolean)
  }, [entries, heroMap])

  if (!cards.length) return null

  return (
    <div className={styles.rosterPicker}>
      <div className={styles.rosterPickerHeader}>
        <h3 className={styles.rosterPickerTitle}>내 캐릭터</h3>
        <p className={styles.rosterPickerHint}>방에 들어갈 캐릭터를 선택하세요.</p>
      </div>
      <div className={styles.rosterPickerGrid}>
        {cards.map((card) => {
          const active = Boolean(selectedHeroId) && selectedHeroId === card.heroId
          return (
            <button
              key={card.heroId}
              type="button"
              className={`${styles.rosterPickerCard} ${active ? styles.rosterPickerCardActive : ''}`}
              onClick={() => (disabled ? null : onSelect?.(card.heroId))}
              disabled={disabled}
            >
              {card.avatarUrl ? (
                <img src={card.avatarUrl} alt={card.name} className={styles.rosterPickerAvatar} />
              ) : (
                <div className={styles.rosterPickerAvatarPlaceholder} />
              )}
              <div className={styles.rosterPickerMeta}>
                <span className={styles.rosterPickerName}>{card.name}</span>
                <span className={styles.rosterPickerRole}>{card.role || '역할 미지정'}</span>
                {Number.isFinite(card.score) ? (
                  <span className={styles.rosterPickerScore}>{card.score}</span>
                ) : null}
                {card.status ? (
                  <span className={styles.rosterPickerStatus}>{card.status}</span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimerVotePanel({ remaining, selected, onSelect, finalTimer }) {
  const normalized = Number(selected)
  const showOptions = remaining == null || remaining > 0
  return (
    <div className={styles.votePanel}>
      <div className={styles.voteHeader}>
        <h3 className={styles.voteTitle}>턴 제한 투표</h3>
        {showOptions && Number.isFinite(remaining) ? (
          <span className={styles.voteCountdown}>남은 선택 시간 {Math.max(0, remaining)}초</span>
        ) : null}
      </div>
      {showOptions ? (
        <div className={styles.voteOptions}>
          {TURN_TIMER_OPTIONS.map((option) => {
            const value = Number(option.value)
            const active = normalized === value
            return (
              <button
                key={option.value}
                type="button"
                className={`${styles.voteButton} ${active ? styles.voteButtonActive : ''}`}
                onClick={() => onSelect(value)}
                disabled={remaining != null && remaining <= 0}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      ) : (
        <p className={styles.voteResult}>
          선택된 제한: <strong>{finalTimer}초</strong>
        </p>
      )}
      <p className={styles.voteHint}>
        {showOptions
          ? '15초 안에 선택하지 않으면 이전 설정을 그대로 사용합니다. 선택한 값은 즉시 메인 게임에 전달됩니다.'
          : '선택한 턴 제한이 메인 게임에 적용되었습니다. 매칭이 완료되면 곧바로 전투 화면으로 이동합니다.'}
      </p>
    </div>
  )
}

function describeStatus(status) {
  switch (status) {
    case 'queued':
      return '매칭 대기 중'
    case 'matched':
      return '매칭 완료'
    default:
      return '자동 참가 준비 중'
  }
}

function resolveFlowSteps(status) {
  const steps = [
    { key: 'prepare', label: '참가 정보 확인', state: 'pending' },
    { key: 'queue', label: '대기열 합류', state: 'pending' },
    { key: 'match', label: '매칭 완료 대기', state: 'pending' },
  ]

  if (status === 'matched') {
    steps[0].state = 'done'
    steps[1].state = 'done'
    steps[2].state = 'active'
    return steps
  }

  if (status === 'queued') {
    steps[0].state = 'done'
    steps[1].state = 'active'
    steps[2].state = 'pending'
    return steps
  }

  steps[0].state = 'active'
  steps[1].state = 'pending'
  steps[2].state = 'pending'
  return steps
}

function resolveDefaultRoleName(roles) {
  if (!Array.isArray(roles)) return ''
  for (const role of roles) {
    if (!role) continue
    if (typeof role === 'string') {
      const trimmed = role.trim()
      if (trimmed) return trimmed
      continue
    }
    if (typeof role === 'object' && typeof role.name === 'string') {
      const trimmed = role.name.trim()
      if (trimmed) return trimmed
    }
  }
  return ''
}

function describeSampleType(sampleType) {
  switch (sampleType) {
    case 'participant_pool':
      return '참가자 풀 기준'
    case 'participant_pool_fallback_queue':
      return '참가자 풀(큐 대체) 기준'
    case 'realtime_queue_waiting':
      return '실시간 대기열 대기 중'
    case 'realtime_queue_with_standins':
      return '실시간 대기열 + 대역 보강'
    case 'realtime_queue_fallback_pool':
      return '실시간 대기열 없음(참가자 풀 사용)'
    case 'realtime_queue':
    default:
      return '실시간 대기열 기준'
  }
}

const PARTICIPANT_STATUS_LABELS = {
  alive: '',
  engaged: '전투 중',
  engaged_offense: '전투 중',
  engaged_defense: '전투 중',
  locked: '전투 예약',
  pending_battle: '전투 예약',
  defeated: '탈락',
  lost: '탈락',
  out: '관전자',
  retired: '관전자',
  eliminated: '탈락',
  dead: '탈락',
}

function formatParticipantStatus(status) {
  if (!status) return ''
  const normalized = status.trim().toLowerCase()
  return PARTICIPANT_STATUS_LABELS[normalized] || normalized
}

export default function MatchQueueClient({
  gameId,
  mode,
  title,
  description,
  emptyHint,
  autoJoin = false,
  autoStart = false,
}) {
  const router = useRouter()
  const [autoJoinError, setAutoJoinError] = useState('')
  const apiKeyExpiredHandledRef = useRef(false)
  useEffect(() => {
    apiKeyExpiredHandledRef.current = false
  }, [gameId])
  const handleApiKeyExpired = useCallback(
    () => {
      if (apiKeyExpiredHandledRef.current) return
      apiKeyExpiredHandledRef.current = true
      const notice = 'API 키가 만료되었습니다. 새 API 키를 사용해주세요.'
      setAutoJoinError(notice)
      try {
        if (typeof window !== 'undefined') {
          window.alert(notice)
        }
      } catch (alertError) {
        console.warn('[MatchQueue] API 키 만료 알림 표시 실패:', alertError)
      }
      router.replace(`/rank/${gameId}`)
    },
    [router, gameId],
  )
  const { state, actions } = useMatchQueue({
    gameId,
    mode,
    enabled: true,
    onApiKeyExpired: handleApiKeyExpired,
  })
  useEffect(() => {
    if (!gameId) return
    hydrateGameMatchData(gameId)
  }, [gameId])
  const clearConnectionRegistry = useCallback(() => {
    if (!gameId) return
    try {
      removeConnectionEntries({ gameId, source: 'match-queue-client' })
    } catch (error) {
      console.warn('[MatchQueue] 연결 정보 초기화 실패:', error)
    }
  }, [gameId])
  const {
    loading: plannerLoading,
    error: plannerError,
    plan: plannerPlan,
    meta: plannerMeta,
    queue: plannerQueue,
    participantPool: plannerParticipantPool,
    sampleType: plannerSampleType,
    realtimeEnabled: plannerRealtimeEnabled,
    lastUpdated: plannerUpdatedAt,
    refresh: refreshPlanner,
    exportPlan: exportPlanner,
  } = useLocalMatchPlanner({ gameId, mode, enabled: true })
  const [countdown, setCountdown] = useState(null)
  const [debugHold, setDebugHold] = useState(null)
  const countdownTimerRef = useRef(null)
  const navigationLockRef = useRef(false)
  const matchMetaSignatureRef = useRef('')
  const latestStatusRef = useRef('idle')
  const matchRedirectedRef = useRef(false)
  const queueByRole = useMemo(() => groupQueue(state.queue), [state.queue])
  const roomSummaries = useMemo(
    () =>
      buildRoleSummaries({
        match: state.match,
        pendingMatch: state.pendingMatch,
      }),
    [state.match, state.pendingMatch],
  )
  const [plannerExportNotice, setPlannerExportNotice] = useState('')
  const autoJoinSignatureRef = useRef('')
  const autoJoinRetryTimerRef = useRef(null)
  const heroMissingRedirectRef = useRef(false)
  const heroMissingTimerRef = useRef(null)
  const dropInRedirectTimerRef = useRef(null)
  const dropInMatchSignatureRef = useRef('')
  const autoStartHandledRef = useRef(false)
  const [refreshing, setRefreshing] = useState(false)

  const [voteRemaining, setVoteRemaining] = useState(null)
  const voteTimerRef = useRef(null)
  const [voteValue, setVoteValue] = useState(() => {
    if (typeof window === 'undefined') return null
    const stored = Number(readStartSessionValue(START_SESSION_KEYS.TURN_TIMER_VOTE))
    return TURN_TIMER_VALUES.includes(stored) ? stored : null
  })
  const [finalTimer, setFinalTimer] = useState(null)
  const finalTimerResolvedRef = useRef(null)
  const [dropInRedirectRemaining, setDropInRedirectRemaining] = useState(null)
  const matchType = state.match?.matchType || 'standard'
  const isBrawlMatch = matchType === 'brawl'
  const isDropInMatch = matchType === 'drop_in'
  const dropInTarget = state.match?.dropInTarget || null
  const pendingMatch = state.pendingMatch || null
  const pendingPostCheck = pendingMatch?.postCheck
  const activePostCheck = state.match?.postCheck
  const queuedSampleMeta = state.sampleMeta || null
  const heroOptions = Array.isArray(state.heroOptions) ? state.heroOptions : []
  const viewerRoster = Array.isArray(state.viewerRoster) ? state.viewerRoster : []
  const [manualHeroId, setManualHeroId] = useState(() => state.heroId || '')
  useEffect(() => {
    setManualHeroId(state.heroId || '')
  }, [state.heroId])
  useEffect(() => {
    if (!gameId) return
    setGameMatchParticipation(gameId, {
      roster: viewerRoster,
      heroOptions,
      participantPool: plannerParticipantPool,
      heroMap: state.heroMap,
    })
  }, [gameId, heroOptions, plannerParticipantPool, state.heroMap, viewerRoster])
  useEffect(() => {
    if (!gameId) return
    setGameMatchHeroSelection(gameId, {
      heroId: state.heroId || '',
      viewerId: state.viewerId || '',
      role: state.lockedRole || targetRoleName || '',
      heroMeta: state.heroMeta || null,
    })
  }, [gameId, state.heroId, state.heroMeta, state.lockedRole, state.viewerId, targetRoleName])
  useEffect(() => {
    if (!gameId) return
    const payload = pendingPostCheck || activePostCheck
    if (!payload) return
    setGameMatchPostCheck(gameId, payload)
  }, [activePostCheck, gameId, pendingPostCheck])
  const handleHeroOptionSelect = useCallback(
    (value) => {
      if (value == null) return
      const normalized = String(value).trim()
      if (!normalized) return
      if (state.heroId === normalized) return
      actions.setHero(normalized)
    },
    [actions, state.heroId],
  )
  const handleManualHeroInput = useCallback((event) => {
    setManualHeroId(event.target.value)
  }, [])
  const handleManualHeroSubmit = useCallback(
    (event) => {
      event.preventDefault()
      const trimmed = (manualHeroId || '').trim()
      actions.setHero(trimmed)
    },
    [actions, manualHeroId],
  )
  const brawlSummary = useMemo(() => {
    if (!isBrawlMatch) return ''
    const vacancies = Array.isArray(state.match?.brawlVacancies)
      ? state.match.brawlVacancies
      : []
    if (!vacancies.length) return ''
    return vacancies
      .map((entry) => {
        const role = entry?.name || entry?.role || '역할'
        const count = Number(entry?.slot_count || entry?.slots || 0)
        if (!Number.isFinite(count) || count <= 0) return role
        return `${role} ${count}명`
      })
      .filter(Boolean)
      .join(', ')
  }, [isBrawlMatch, state.match])

  const dropInSummary = useMemo(() => {
    if (!isDropInMatch || !dropInTarget) return ''
    const parts = []
    if (typeof dropInTarget.roomCode === 'string' && dropInTarget.roomCode.trim()) {
      parts.push(`룸 코드 ${dropInTarget.roomCode.trim()}`)
    }
    if (typeof dropInTarget.role === 'string' && dropInTarget.role.trim()) {
      parts.push(`${dropInTarget.role.trim()} 슬롯`)
    }
    if (Number.isFinite(Number(dropInTarget.scoreDifference))) {
      const window = Math.round(Math.abs(Number(dropInTarget.scoreDifference)))
      if (window > 0) {
        parts.push(`점수 차이 ±${window}`)
      }
    }
    return parts.join(' · ')
  }, [isDropInMatch, dropInTarget])

  const sampleSummary = useMemo(() => {
    if (!state.match || !state.match.sampleMeta) return ''
    if (isDropInMatch || isBrawlMatch) return ''
    const meta = state.match.sampleMeta
    const parts = []
    const sampleType = meta.sampleType || (meta.realtime ? 'realtime_queue' : 'participant_pool')
    const queueSampled = Number(meta.queueSampled)
    const queueCount = Number(meta.queueCount)
    const poolCount = Number(meta.participantPoolCount)
    const standinSampled = Number(meta.standinSampled)
    const waitSeconds = Number(meta.queueWaitSeconds)
    const waitThreshold = Number(meta.queueWaitThresholdSeconds)

    if (sampleType.startsWith('realtime_queue')) {
      if (Number.isFinite(queueSampled)) {
        parts.push(`대기열 ${queueSampled}명 기준`)
      } else if (Number.isFinite(queueCount)) {
        parts.push(`대기열 ${queueCount}명`)
      }
      if (Number.isFinite(waitSeconds)) {
        if (sampleType === 'realtime_queue_waiting' && Number.isFinite(waitThreshold)) {
          parts.push(`대기 ${Math.max(0, Math.round(waitSeconds))}초 (최소 ${Math.round(waitThreshold)}초)`)
        } else if (waitSeconds >= 0) {
          parts.push(`대기 ${Math.max(0, Math.round(waitSeconds))}초 경과`)
        }
      }
      if (sampleType === 'realtime_queue_with_standins' && Number.isFinite(standinSampled) && standinSampled > 0) {
        parts.push(`대역 ${standinSampled}명 보강`)
      }
      if (sampleType === 'realtime_queue_fallback_pool' && Number.isFinite(poolCount)) {
        parts.push(`참가자 풀 ${poolCount}명 대체`)
      }
    } else {
      if (Number.isFinite(queueSampled) && queueSampled > 0) {
        parts.push(`대기열 ${queueSampled}명 포함`)
      }
      if (Number.isFinite(poolCount)) {
        parts.push(`참가자 풀 ${poolCount}명`)
      }
      if (Number.isFinite(standinSampled) && standinSampled > 0) {
        parts.push(`대역 ${standinSampled}명 사용`)
      }
    }
    if (Number.isFinite(Number(meta.simulatedSelected))) {
      const selected = Number(meta.simulatedSelected)
      if (selected > 0) {
        parts.push(`후보 ${selected}명 보강`)
      } else {
        parts.push('추가 후보 없이 구성')
      }
    }
    if (Number.isFinite(Number(meta.scoreWindow)) && Number(meta.scoreWindow) > 0) {
      parts.push(`점수 윈도우 ±${Math.round(Number(meta.scoreWindow))}`)
    }
    if (Number.isFinite(Number(meta.simulatedFiltered)) && Number(meta.simulatedFiltered) > 0) {
      parts.push(`필터 제외 ${Number(meta.simulatedFiltered)}명`)
    }
    return parts.join(' · ')
  }, [isBrawlMatch, isDropInMatch, state.match])

  const queuedSampleSummary = useMemo(() => {
    if (!queuedSampleMeta) return ''
    const parts = []
    const sampleType =
      queuedSampleMeta.sampleType || (queuedSampleMeta.realtime ? 'realtime_queue' : 'participant_pool')
    const queueSampled = Number(queuedSampleMeta.queueSampled)
    const queueCount = Number(queuedSampleMeta.queueCount)
    const poolCount = Number(queuedSampleMeta.participantPoolCount)
    const standinSampled = Number(queuedSampleMeta.standinSampled)
    const waitSeconds = Number(queuedSampleMeta.queueWaitSeconds)
    const waitThreshold = Number(queuedSampleMeta.queueWaitThresholdSeconds)

    if (sampleType.startsWith('realtime_queue')) {
      if (Number.isFinite(queueSampled)) {
        parts.push(`대기열 ${queueSampled}명 기준`)
      } else if (Number.isFinite(queueCount)) {
        parts.push(`대기열 ${queueCount}명 기준`)
      }
      if (Number.isFinite(waitSeconds)) {
        if (sampleType === 'realtime_queue_waiting' && Number.isFinite(waitThreshold)) {
          parts.push(`대기 ${Math.max(0, Math.round(waitSeconds))}초 (최소 ${Math.round(waitThreshold)}초)`)
        } else if (waitSeconds >= 0) {
          parts.push(`대기 ${Math.max(0, Math.round(waitSeconds))}초 경과`)
        }
      }
      if (sampleType === 'realtime_queue_with_standins' && Number.isFinite(standinSampled) && standinSampled > 0) {
        parts.push(`대역 ${standinSampled}명 보강`)
      }
      if (sampleType === 'realtime_queue_fallback_pool' && Number.isFinite(poolCount)) {
        parts.push(`참가자 풀 ${poolCount}명 대체`)
      }
    } else {
      if (Number.isFinite(queueSampled) && queueSampled > 0) {
        parts.push(`대기열 ${queueSampled}명 포함`)
      }
      if (Number.isFinite(poolCount)) {
        parts.push(`참가자 풀 ${poolCount}명`)
      }
      if (Number.isFinite(standinSampled) && standinSampled > 0) {
        parts.push(`대역 ${standinSampled}명 사용`)
      }
    }
    const simulatedSelected = Number(queuedSampleMeta.simulatedSelected)
    if (Number.isFinite(simulatedSelected)) {
      if (simulatedSelected > 0) {
        parts.push(`보강 후보 ${simulatedSelected}명 추가 검토`)
      } else {
        parts.push('보강 후보 없이 구성 시도')
      }
    }
    const scoreWindow = Number(queuedSampleMeta.scoreWindow)
    if (Number.isFinite(scoreWindow) && scoreWindow > 0) {
      parts.push(`점수 윈도우 ±${Math.round(scoreWindow)}`)
    }
    return parts.join(' · ')
  }, [queuedSampleMeta])

  const queuedSampleWarnings = useMemo(() => {
    if (!queuedSampleMeta) return []
    const warnings = []
    const filtered = Number(queuedSampleMeta.simulatedFiltered)
    if (Number.isFinite(filtered) && filtered > 0) {
      const windowLabel = Number.isFinite(Number(queuedSampleMeta.scoreWindow))
        ? ` (점수 윈도우 ±${Math.round(Number(queuedSampleMeta.scoreWindow))})`
        : ''
      warnings.push(`점수 차이${windowLabel} 때문에 제외된 후보 ${filtered}명이 있습니다.`)
    }
    const eligible = Number(queuedSampleMeta.simulatedEligible)
    if (Number.isFinite(eligible) && eligible === 0 && Number(queuedSampleMeta.participantPoolCount) > 0) {
      warnings.push('참가자 풀에서는 조건을 충족하는 후보를 찾지 못했습니다.')
    }
    const perRoleLimit = Number(queuedSampleMeta.perRoleLimit)
    if (Number.isFinite(perRoleLimit) && perRoleLimit >= 0) {
      warnings.push(`역할별 보강은 최대 ${perRoleLimit}명까지 허용됩니다.`)
    }
    const totalLimit = Number(queuedSampleMeta.totalLimit)
    if (Number.isFinite(totalLimit) && totalLimit >= 0) {
      warnings.push(`비실시간 보강은 총 ${totalLimit}명까지만 추가할 수 있습니다.`)
    }
    return warnings
  }, [queuedSampleMeta])

  const pendingReason = useMemo(() => {
    if (!pendingMatch || !pendingMatch.error) return ''
    const error = pendingMatch.error
    if (typeof error === 'string') {
      return error
    }
    if (typeof error === 'object') {
      const roleName = error.role ? String(error.role).trim() : ''
      const missing = Number(error.missing)
      switch (error.type) {
        case 'no_candidates':
          return roleName
            ? `${roleName} 역할에 합류할 플레이어가 없어 매칭을 완료하지 못했습니다.`
            : '선택한 역할에 합류할 플레이어가 없어 매칭을 완료하지 못했습니다.'
        case 'insufficient_candidates':
          if (roleName && Number.isFinite(missing) && missing > 0) {
            return `${roleName} 역할이 ${missing}명 부족해 매칭을 잠시 대기 중입니다.`
          }
          if (roleName) {
            return `${roleName} 역할의 인원이 부족해 매칭을 잠시 대기 중입니다.`
          }
          return '필요 인원을 모두 채우지 못해 매칭을 잠시 대기 중입니다.'
        case 'slot_missing_hero':
          return '참가자 중 사용 영웅이 비어 있는 슬롯이 있어 매칭을 다시 확인하고 있습니다.'
        default:
          if (error.type) {
            return `매칭이 완료되기까지 조금 더 대기해 주세요. (원인: ${error.type})`
          }
          break
      }
    }
    return '매칭이 완료되기까지 조금 더 대기해 주세요.'
  }, [pendingMatch])

  useEffect(() => {
    if (state.status !== 'queued' && refreshing) {
      setRefreshing(false)
    }
  }, [state.status, refreshing])

  const showDiagnosticsCard = state.status === 'queued' && Boolean(
    pendingReason || queuedSampleSummary || queuedSampleWarnings.length,
  )

  useEffect(() => {
    const previous = latestStatusRef.current
    latestStatusRef.current = state.status
    if ((previous === 'queued' || previous === 'matched') && state.status === 'idle') {
      autoJoinSignatureRef.current = ''
    }
  }, [state.status])

  const targetRoleName = useMemo(() => {
    if (state.lockedRole) return state.lockedRole
    if (!state.roleReady) return ''
    return resolveDefaultRoleName(state.roles)
  }, [state.lockedRole, state.roleReady, state.roles])

  const autoHeroCandidate = useMemo(
    () =>
      state.heroId
        ? ''
        : pickAutoHeroCandidate({
            heroOptions,
            viewerRoster,
            targetRole: targetRoleName,
          }),
    [state.heroId, heroOptions, viewerRoster, targetRoleName],
  )

  const joinBlockers = useMemo(() => {
    if (state.status !== 'idle') return []

    const blockers = []
    if (!state.viewerId) {
      blockers.push('로그인이 필요합니다.')
    }
    if (!state.roleReady || !targetRoleName) {
      blockers.push('참가할 역할 정보를 불러오는 중입니다.')
    }
    if (!state.heroId && !autoHeroCandidate) {
      blockers.push('사용할 캐릭터를 선택해 주세요.')
    }
    return blockers
  }, [
    state.status,
    state.viewerId,
    state.roleReady,
    targetRoleName,
    state.heroId,
    autoHeroCandidate,
  ])

  const joinDisabled =
    state.loading || state.status !== 'idle' || joinBlockers.length > 0

  const handleJoinClick = useCallback(async () => {
    if (state.loading) return
    if (state.status === 'queued' || state.status === 'matched') return
    let heroId = state.heroId
    if (!heroId && autoHeroCandidate) {
      heroId = autoHeroCandidate
      actions.setHero(heroId)
    }
    if (!heroId) {
      alert('먼저 사용할 캐릭터를 선택해 주세요.')
      return
    }
    if (!targetRoleName) {
      alert('참가할 역할 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.')
      return
    }

    const result = await actions.joinQueue(targetRoleName)
    if (!result?.ok && result?.error) {
      alert(result.error)
    }
  }, [
    state.loading,
    state.status,
    state.heroId,
    autoHeroCandidate,
    targetRoleName,
    actions,
  ])

  const roleLabel = useMemo(() => {
    if (state.lockedRole) return state.lockedRole
    if (!state.roleReady) return '역할 정보를 불러오는 중'
    if (targetRoleName) return targetRoleName
    return '선택된 역할 없음'
  }, [state.lockedRole, state.roleReady, targetRoleName])

  const autoJoinBlockers = useMemo(() => {
    if (!autoJoin) return []
    if (state.status === 'queued' || state.status === 'matched') return []

    const blockers = []
    if (!state.viewerId) {
      blockers.push('로그인 세션을 확인하는 중입니다.')
    }
    if (!state.lockedRole && !state.roleReady) {
      blockers.push('참가할 역할 정보를 불러오고 있습니다.')
    } else if (!targetRoleName) {
      blockers.push('참가할 역할 정보를 불러오고 있습니다.')
    }
    if (!state.heroId && !autoHeroCandidate) {
      blockers.push('사용할 캐릭터를 선택해 주세요.')
    }
    return blockers
  }, [
    autoJoin,
    state.status,
    state.viewerId,
    state.lockedRole,
    state.roleReady,
    targetRoleName,
    state.heroId,
    autoHeroCandidate,
  ])

  useEffect(() => {
    if (!autoJoin) return
    if (!autoJoinBlockers.length) {
      console.debug('[MatchQueueClient] 자동 참가 준비 완료')
      return
    }
    console.debug('[MatchQueueClient] 자동 참가 대기 사유:', autoJoinBlockers)
  }, [autoJoin, autoJoinBlockers])

  useEffect(() => {
    if (!autoJoin) return
    if (state.status === 'queued' || state.status === 'matched') return
    if (!state.viewerId) return
    if (!targetRoleName) return
    let activeHeroId = state.heroId || ''
    if (!activeHeroId && autoHeroCandidate) {
      activeHeroId = autoHeroCandidate
      actions.setHero(activeHeroId)
    }
    if (!activeHeroId) return

    const signature = `${state.viewerId}::${targetRoleName}::${activeHeroId}`
    if (autoJoinSignatureRef.current === signature) return

    autoJoinSignatureRef.current = signature
    actions.joinQueue(targetRoleName).then((result) => {
      if (!result?.ok && result?.error) {
        setAutoJoinError(result.error)
        if (autoJoinRetryTimerRef.current) {
          clearTimeout(autoJoinRetryTimerRef.current)
        }
        autoJoinRetryTimerRef.current = setTimeout(() => {
          autoJoinSignatureRef.current = ''
          autoJoinRetryTimerRef.current = null
        }, 1500)
      } else {
        setAutoJoinError('')
        if (autoJoinRetryTimerRef.current) {
          clearTimeout(autoJoinRetryTimerRef.current)
          autoJoinRetryTimerRef.current = null
        }
      }
    })
  // NOTE: auto-suppressed by codemod. This suppression was added by automated
  // tooling to reduce noise. Please review the surrounding effect body and
  // either add the minimal safe dependencies or keep the suppression with
  // an explanatory comment before removing this note.
// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
  }, [
    autoJoin,
    state.status,
    state.viewerId,
    targetRoleName,
    state.heroId,
    actions,
  ])

  useEffect(() => {
    if (state.status === 'queued' || state.status === 'matched') {
      setAutoJoinError('')
      if (autoJoinRetryTimerRef.current) {
        clearTimeout(autoJoinRetryTimerRef.current)
        autoJoinRetryTimerRef.current = null
      }
    }
  }, [state.status])

  const handleCancel = async () => {
    const result = await actions.cancelQueue()
    if (!result?.ok && result?.error) {
      alert(result.error)
    }
  }

  const handleManualRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await actions.refresh()
    } finally {
      setRefreshing(false)
    }
  }, [actions, refreshing])

  const handleStart = useCallback(() => {
    if (autoStart) return
    if (navigationLockRef.current) return
    navigationLockRef.current = true
    setCountdown(null)
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    if (state.status === 'matched' && state.match) {
      const viewerRoleName = state.lockedRole || targetRoleName || ''
      const turnTimerValue =
        Number.isFinite(Number(finalTimer)) && Number(finalTimer) > 0
          ? Number(finalTimer)
          : null
      const payload = buildMatchMetaPayload(state.match, {
        mode: mode || null,
        gameId: gameId || null,
        turnTimer: turnTimerValue,
        source: 'match_queue_client_handle_start',
        viewerId: state.viewerId || null,
        viewerRole: viewerRoleName || null,
        viewerHeroId: state.heroId || null,
        viewerHeroName: state.heroMeta?.name || null,
        autoStart: Boolean(autoStart),
      })
      if (payload) {
        storeStartMatchMeta(payload)
        try {
          const assignmentStamp = Array.isArray(state.match.assignments)
            ? state.match.assignments
                .map((assignment) => {
                  if (!assignment) return ''
                  const role = assignment.role || ''
                  const members = Array.isArray(assignment.members)
                    ? assignment.members
                        .map((member) => {
                          if (!member) return ''
                          const owner = member.owner_id ?? member.ownerId ?? ''
                          const hero = member.hero_id ?? member.heroId ?? ''
                          return `${owner}:${hero}`
                        })
                        .join(',')
                    : ''
                  return `${role}|${members}`
                })
                .join(';')
            : ''
          matchMetaSignatureRef.current = JSON.stringify({
            matchCode: state.match.matchCode || '',
            turnTimer: turnTimerValue,
            viewerHeroId: state.heroId || '',
            viewerRole: viewerRoleName,
            assignmentStamp,
          })
        } catch (signatureError) {
          console.debug('[MatchQueueClient] 매치 메타 서명 생성 실패', signatureError)
        }
      } else {
        storeStartMatchMeta(null)
        matchMetaSignatureRef.current = ''
      }
    }
    router.push({ pathname: `/rank/${gameId}/start`, query: { mode } })
  }, [
    router,
    gameId,
    mode,
    state.status,
    state.match,
    state.lockedRole,
    targetRoleName,
    finalTimer,
    state.viewerId,
    state.heroId,
    state.heroMeta?.name,
    autoStart,
  ])

  const handleBackToRoom = () => {
    clearConnectionRegistry()
    router.push(`/rank/${gameId}`)
  }

  useEffect(() => {
    return () => {
      if (heroMissingTimerRef.current) {
        clearTimeout(heroMissingTimerRef.current)
        heroMissingTimerRef.current = null
      }
      if (autoJoinRetryTimerRef.current) {
        clearTimeout(autoJoinRetryTimerRef.current)
        autoJoinRetryTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!autoJoin) return
    if (state.status !== 'idle') return

    if (state.heroId) {
      if (heroMissingTimerRef.current) {
        clearTimeout(heroMissingTimerRef.current)
        heroMissingTimerRef.current = null
      }
      heroMissingRedirectRef.current = false
      if (autoJoinError?.includes('캐릭터를 선택')) {
        setAutoJoinError('')
      }
      return
    }

    if (heroMissingRedirectRef.current) return

    heroMissingRedirectRef.current = true
    setAutoJoinError('자동 참가를 위해 사용할 캐릭터가 필요합니다. 메인 룸으로 돌아갑니다.')
    heroMissingTimerRef.current = setTimeout(() => {
      navigationLockRef.current = true
      router.replace(`/rank/${gameId}`)
    }, 4000)
  }, [autoJoin, state.status, state.heroId, router, gameId, autoJoinError])

  useEffect(() => {
    if (state.status === 'matched' && state.match) {
      if (isDropInMatch) {
        setVoteRemaining(null)
        setFinalTimer(null)
        finalTimerResolvedRef.current = null
        if (voteTimerRef.current) {
          clearInterval(voteTimerRef.current)
          voteTimerRef.current = null
        }
        return () => {}
      }

      finalTimerResolvedRef.current = null
      setFinalTimer(null)
      const initialVote = autoStart ? 0 : 15
      setVoteRemaining(initialVote)
      setCountdown(null)
      if (voteTimerRef.current) {
        clearInterval(voteTimerRef.current)
      }
      if (!autoStart) {
        voteTimerRef.current = setInterval(() => {
          setVoteRemaining((prev) => {
            if (prev == null) return prev
            if (prev <= 0) return 0
            return prev - 1
          })
        }, 1000)
      } else {
        voteTimerRef.current = null
      }
      return () => {
        if (voteTimerRef.current) {
          clearInterval(voteTimerRef.current)
          voteTimerRef.current = null
        }
      }
    }

    setVoteRemaining(null)
    setFinalTimer(null)
    finalTimerResolvedRef.current = null
    autoStartHandledRef.current = false
    if (voteTimerRef.current) {
      clearInterval(voteTimerRef.current)
      voteTimerRef.current = null
    }
    return () => {}
  }, [state.status, state.match, isDropInMatch, autoStart])

  useEffect(() => {
    if (state.status !== 'matched') {
      autoStartHandledRef.current = false
    }
  }, [state.status])

  const resolveTurnTimer = useCallback(() => {
    let fallback = 60
    if (typeof window !== 'undefined') {
      const stored = Number(readStartSessionValue(START_SESSION_KEYS.TURN_TIMER))
      if (TURN_TIMER_VALUES.includes(stored)) {
        fallback = stored
      }
    }

    const voteMap = {}
    const numericVote = Number(voteValue)
    if (TURN_TIMER_VALUES.includes(numericVote)) {
      voteMap[numericVote] = 1
    }

    return pickTurnTimer(voteMap, fallback)
  }, [voteValue])

  useEffect(() => {
    if (state.status !== 'matched' || !state.match || isDropInMatch) {
      if (finalTimerResolvedRef.current != null || finalTimer != null) {
        finalTimerResolvedRef.current = null
        setFinalTimer(null)
      }
      return
    }

    const resolved = resolveTurnTimer()
    if (!Number.isFinite(resolved)) {
      return
    }

    if (finalTimerResolvedRef.current === resolved && finalTimer === resolved) {
      return
    }

    finalTimerResolvedRef.current = resolved
    setFinalTimer(resolved)

    if (typeof window !== 'undefined') {
      writeStartSessionValue(START_SESSION_KEYS.TURN_TIMER, String(resolved), {
        source: 'match-queue',
      })
      const voteToStore = TURN_TIMER_VALUES.includes(Number(voteValue))
        ? Number(voteValue)
        : resolved
      writeStartSessionValue(START_SESSION_KEYS.TURN_TIMER_VOTE, String(voteToStore), {
        source: 'match-queue',
      })
    }
  }, [
    state.status,
    state.match,
    isDropInMatch,
    resolveTurnTimer,
    finalTimer,
    voteValue,
  ])

  useEffect(() => {
    if (!gameId || !mode) return

    if (state.status !== 'matched' || !state.match) {
      if (latestStatusRef.current === 'matched') {
        clearMatchConfirmation()
        clearConnectionRegistry()
      }
      matchRedirectedRef.current = false
      return
    }

    const match = state.match

    try {
      registerMatchConnections({
        gameId,
        match,
        viewerId: state.viewerId || '',
        source: 'match-queue-client',
      })
    } catch (error) {
      console.warn('[MatchQueue] 연결 정보 등록 실패:', error)
    }

    const plainHeroMap =
      match.heroMap instanceof Map
        ? Object.fromEntries(match.heroMap)
        : match.heroMap || null

    const sanitizedMatch = {
      assignments: Array.isArray(match.assignments) ? match.assignments : [],
      maxWindow: match.maxWindow ?? null,
      heroMap: plainHeroMap,
      matchCode: match.matchCode || '',
      matchType: match.matchType || 'standard',
      brawlVacancies: Array.isArray(match.brawlVacancies) ? match.brawlVacancies : [],
      roleStatus: match.roleStatus || null,
      sampleMeta: match.sampleMeta || state.sampleMeta || null,
      dropInTarget: match.dropInTarget || null,
      turnTimer: match.turnTimer ?? match.turn_timer ?? null,
      rooms: Array.isArray(match.rooms) ? match.rooms : [],
      roles: Array.isArray(match.roles)
        ? match.roles
        : Array.isArray(state.roles)
        ? state.roles
        : [],
      slotLayout: Array.isArray(match.slotLayout) ? match.slotLayout : [],
    }

    const viewerRoleName = state.lockedRole || targetRoleName || ''
    const resolvedTurnTimer = Number.isFinite(Number(finalTimer)) && Number(finalTimer) > 0
      ? Number(finalTimer)
      : Number.isFinite(Number(sanitizedMatch.turnTimer)) && Number(sanitizedMatch.turnTimer) > 0
      ? Number(sanitizedMatch.turnTimer)
      : null

    const createdAt = Date.now()
    setGameMatchSnapshot(gameId, {
      match: sanitizedMatch,
      pendingMatch,
      viewerId: state.viewerId || '',
      heroId: state.heroId || '',
      role: viewerRoleName,
      mode,
      createdAt,
    })
    const confirmationPayload = {
      gameId,
      mode,
      roleName: viewerRoleName,
      requiresManualConfirmation: true,
      turnTimer: resolvedTurnTimer,
      roles: sanitizedMatch.roles,
      viewerId: state.viewerId || '',
      heroId: state.heroId || '',
      match: sanitizedMatch,
      createdAt,
    }
    setGameMatchConfirmation(gameId, confirmationPayload)

    clearMatchConfirmation()
    const saved = saveMatchConfirmation(confirmationPayload)

    if (!saved) {
      console.warn('[MatchQueue] 매칭 확인 정보를 저장하지 못했습니다.')
      return
    }

    if (!matchRedirectedRef.current) {
      matchRedirectedRef.current = true
      navigationLockRef.current = true
      router.replace({ pathname: `/rank/${gameId}/match-ready`, query: { mode } })
    }
  }, [
    gameId,
    mode,
    state.status,
    state.match,
    state.viewerId,
    state.heroId,
    state.lockedRole,
    state.roles,
    state.sampleMeta,
    targetRoleName,
    finalTimer,
    clearConnectionRegistry,
    router,
    pendingMatch,
  ])

  useEffect(() => {
    if (autoStart) {
      if (debugHold) setDebugHold(null)
      return
    }
    if (state.status !== 'matched' || !state.match || isDropInMatch) {
      if (debugHold) setDebugHold(null)
      return
    }
    if (finalTimer == null) {
      if (debugHold) setDebugHold(null)
      return
    }
    if (voteRemaining != null && voteRemaining > 0) {
      if (debugHold) setDebugHold(null)
      return
    }
    if (MATCH_DEBUG_HOLD_ENABLED) {
      setCountdown(null)
      const holdSnapshot = buildDebugHoldSnapshot({
        queueMode: mode || null,
        sessionId: state.match?.sessionId || null,
        matchCode: state.match?.matchCode || state.match?.match_code || null,
        assignments: state.match?.assignments || [],
        participants: state.match?.assignments || [],
      })
      const signature = `${holdSnapshot.queueMode || ''}-${holdSnapshot.sessionId || ''}-${holdSnapshot.matchCode || ''}`
      const previousSignature = debugHold
        ? `${debugHold.queueMode || ''}-${debugHold.sessionId || ''}-${debugHold.matchCode || ''}`
        : ''
      if (!debugHold || signature !== previousSignature) {
        setDebugHold(holdSnapshot)
        try {
          console.info('[MatchQueue] 디버그 홀드 활성화', holdSnapshot)
        } catch (error) {
           
          console.log('[MatchQueue] 디버그 홀드 활성화', holdSnapshot)
        }
      }
      return
    }

    if (debugHold) setDebugHold(null)
    if (countdown != null) return
    setCountdown(5)
  }, [
    autoStart,
    state.status,
    state.match,
    isDropInMatch,
    finalTimer,
    voteRemaining,
    countdown,
    debugHold,
    mode,
  ])

  useEffect(() => {
    if (state.status === 'matched' && state.match && finalTimer != null) {
      return
    }
    if (debugHold) setDebugHold(null)
    setCountdown(null)
    navigationLockRef.current = false
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [state.status, state.match, finalTimer, debugHold])

  useEffect(() => {
    if (countdown == null) return
    if (MATCH_DEBUG_HOLD_ENABLED) return

    if (countdown === 0) {
      setCountdown(null)
      handleStart()
      return
    }

    countdownTimerRef.current = setTimeout(() => {
      setCountdown((prev) => {
        if (prev == null) return prev
        return prev > 0 ? prev - 1 : 0
      })
    }, 1000)

    return () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
    }
  }, [countdown, handleStart])

  useEffect(() => {
    if (state.status === 'matched' && state.match) {
      const viewerRoleName = state.lockedRole || targetRoleName || ''
      const turnTimerValue =
        Number.isFinite(Number(finalTimer)) && Number(finalTimer) > 0
          ? Number(finalTimer)
          : null
      let assignmentStamp = ''
      try {
        assignmentStamp = Array.isArray(state.match.assignments)
          ? state.match.assignments
              .map((assignment) => {
                if (!assignment) return ''
                const role = assignment.role || ''
                const members = Array.isArray(assignment.members)
                  ? assignment.members
                      .map((member) => {
                        if (!member) return ''
                        const owner = member.owner_id ?? member.ownerId ?? ''
                        const hero = member.hero_id ?? member.heroId ?? ''
                        return `${owner}:${hero}`
                      })
                      .join(',')
                  : ''
                return `${role}|${members}`
              })
              .join(';')
          : ''
      } catch (stampError) {
        console.debug('[MatchQueueClient] 매치 메타 stamp 생성 실패', stampError)
      }

      const holdSignature =
        MATCH_DEBUG_HOLD_ENABLED && debugHold
          ? `${debugHold.queueMode || ''}-${debugHold.sessionId || ''}-${debugHold.matchCode || ''}-${debugHold.generatedAt || ''}`
          : ''
      const signature = JSON.stringify({
        matchCode: state.match.matchCode || '',
        turnTimer: turnTimerValue,
        viewerHeroId: state.heroId || '',
        viewerRole: viewerRoleName,
        assignmentStamp,
        holdSignature,
      })

      if (matchMetaSignatureRef.current !== signature) {
        matchMetaSignatureRef.current = signature
        const payload = buildMatchMetaPayload(state.match, {
          mode: mode || null,
          turnTimer: turnTimerValue,
          source: 'match_queue_client_ready',
          viewerId: state.viewerId || null,
          viewerRole: viewerRoleName || null,
          viewerHeroId: state.heroId || null,
          viewerHeroName: state.heroMeta?.name || null,
          autoStart: Boolean(autoStart),
          debugHold: MATCH_DEBUG_HOLD_ENABLED && debugHold ? debugHold : undefined,
        })
        if (payload) {
          storeStartMatchMeta(payload)
        } else {
          storeStartMatchMeta(null)
          matchMetaSignatureRef.current = ''
        }
      }
      return
    }

    if (matchMetaSignatureRef.current) {
      matchMetaSignatureRef.current = ''
      storeStartMatchMeta(null)
    }
  }, [
    state.status,
    state.match,
    state.lockedRole,
    targetRoleName,
    finalTimer,
    mode,
    state.viewerId,
    state.heroId,
    state.heroMeta?.name,
    autoStart,
    debugHold,
  ])

  useEffect(() => {
    if (!autoStart) return
    if (isDropInMatch) return
    if (state.status !== 'matched' || !state.match) return
    if (finalTimer == null) return

    if (!autoStartHandledRef.current) {
      autoStartHandledRef.current = true
    }
    if (voteTimerRef.current) {
      clearInterval(voteTimerRef.current)
      voteTimerRef.current = null
    }
    setVoteRemaining(null)
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setCountdown(null)
  }, [autoStart, state.status, state.match, finalTimer, isDropInMatch])

  const cancelQueue = actions.cancelQueue

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handlePageLeave = () => {
      if (navigationLockRef.current) return
      if (latestStatusRef.current !== 'queued' && latestStatusRef.current !== 'matched') {
        return
      }
      if (state.viewerId) {
        emitQueueLeaveBeacon({
          gameId,
          mode,
          ownerId: state.viewerId,
          heroId: state.heroId || null,
        })
      }
      cancelQueue().catch((error) => {
        console.warn('[MatchQueue] 페이지 이탈 시 대기열 취소 실패:', error)
      })
    }

    window.addEventListener('pagehide', handlePageLeave)
    window.addEventListener('beforeunload', handlePageLeave)

    return () => {
      window.removeEventListener('pagehide', handlePageLeave)
      window.removeEventListener('beforeunload', handlePageLeave)
    }
  }, [cancelQueue, gameId, mode, state.heroId, state.viewerId])

  useEffect(
    () => () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
      if (voteTimerRef.current) {
        clearInterval(voteTimerRef.current)
        voteTimerRef.current = null
      }
      if (dropInRedirectTimerRef.current) {
        clearInterval(dropInRedirectTimerRef.current)
        dropInRedirectTimerRef.current = null
      }
      clearConnectionRegistry()
      if (latestStatusRef.current === 'queued') {
        cancelQueue()
      }
    },
    [cancelQueue, clearConnectionRegistry],
  )

  useEffect(() => {
    if (!isDropInMatch || state.status !== 'matched' || !state.match) {
      setDropInRedirectRemaining(null)
      dropInMatchSignatureRef.current = ''
      if (dropInRedirectTimerRef.current) {
        clearInterval(dropInRedirectTimerRef.current)
        dropInRedirectTimerRef.current = null
      }
      return
    }

    const signature = state.match.matchCode || JSON.stringify(state.match.assignments || [])
    if (dropInMatchSignatureRef.current === signature && dropInRedirectTimerRef.current) {
      return
    }

    if (dropInRedirectTimerRef.current) {
      clearInterval(dropInRedirectTimerRef.current)
      dropInRedirectTimerRef.current = null
    }

    dropInMatchSignatureRef.current = signature
    setDropInRedirectRemaining(5)

    dropInRedirectTimerRef.current = setInterval(() => {
      setDropInRedirectRemaining((prev) => {
        if (prev == null) return prev
        if (prev <= 1) {
          if (dropInRedirectTimerRef.current) {
            clearInterval(dropInRedirectTimerRef.current)
            dropInRedirectTimerRef.current = null
          }
          if (!navigationLockRef.current) {
            navigationLockRef.current = true
            router.replace(`/rank/${gameId}`)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (dropInRedirectTimerRef.current) {
        clearInterval(dropInRedirectTimerRef.current)
        dropInRedirectTimerRef.current = null
      }
    }
  }, [isDropInMatch, state.status, state.match, router, gameId])

  const handleTimerVote = (value) => {
    const numeric = Number(value)
    if (!TURN_TIMER_VALUES.includes(numeric)) return
    setVoteValue(numeric)
    if (typeof window !== 'undefined') {
      writeStartSessionValue(START_SESSION_KEYS.TURN_TIMER_VOTE, String(numeric), {
        source: 'match-queue',
      })
    }
  }

  const statusLabel = describeStatus(state.status)
  const flowSteps = useMemo(() => resolveFlowSteps(state.status), [state.status])

  const heroLabel = useMemo(() => {
    if (!state.heroId) return '선택된 캐릭터 없음'
    if (state.heroMeta?.name) return state.heroMeta.name
    const matched = heroOptions.find((option) => option.heroId === state.heroId)
    if (matched?.name) return matched.name
    return state.heroId
  }, [state.heroId, state.heroMeta?.name, heroOptions])

  const plannerSummary = useMemo(() => {
    if (!plannerPlan) return ''
    const parts = []
    const summarySampleType = plannerMeta?.sampleType || plannerSampleType || 'realtime_queue'
    const queueCount = Number(plannerMeta?.queueCount)
    const queueSampled = Number(plannerMeta?.queueSampled)
    const poolCount = Number(plannerMeta?.participantPoolCount)
    const sampleCount = Number(plannerMeta?.sampleCount)
    if (summarySampleType === 'realtime_queue') {
      const resolvedQueue = Number.isFinite(queueSampled)
        ? queueSampled
        : Number.isFinite(queueCount)
        ? queueCount
        : plannerQueue?.length || 0
      if (resolvedQueue) {
        parts.push(`실시간 대기열 ${resolvedQueue}명 기준`)
      }
    } else {
      const resolvedPool = Number.isFinite(poolCount)
        ? poolCount
        : plannerParticipantPool?.length || 0
      if (resolvedPool) {
        parts.push(`참가자 풀 ${resolvedPool}명 기준`)
      }
      if (Number.isFinite(queueSampled) && queueSampled > 0) {
        parts.push(`대기열 ${queueSampled}명 포함`)
      }
      if (!Number.isFinite(queueSampled) && plannerQueue?.length) {
        parts.push(`대기열 ${plannerQueue.length}명 참고`)
      }
    }
    if (Number.isFinite(sampleCount) && sampleCount >= 0 && summarySampleType !== 'realtime_queue') {
      parts.push(`후보 ${sampleCount}명 추출`)
    }
    if (Number.isFinite(plannerPlan.memberCount)) {
      parts.push(`배정 ${plannerPlan.memberCount}명`)
    }
    if (Number.isFinite(plannerPlan.totalSlots)) {
      parts.push(`필요 슬롯 ${plannerPlan.totalSlots}개`)
    }
    const filtered = Number(plannerMeta?.simulatedFiltered)
    if (Number.isFinite(filtered) && filtered > 0) {
      parts.push(`점수 초과 제외 ${filtered}명`)
    }
    const windowValue = Number.isFinite(Number(plannerPlan.maxWindow))
      ? Number(plannerPlan.maxWindow)
      : Number(plannerMeta?.scoreWindow)
    if (Number.isFinite(windowValue) && windowValue > 0) {
      parts.push(`점수 윈도우 ±${Math.round(windowValue)}`)
    }
    if (plannerRealtimeEnabled != null) {
      parts.push(describeSampleType(summarySampleType))
    }
    parts.push(plannerPlan.ready ? '모든 슬롯 충족' : '슬롯 부족')
    return parts.join(' · ')
  }, [
    plannerPlan,
    plannerMeta,
    plannerQueue?.length,
    plannerParticipantPool?.length,
    plannerSampleType,
    plannerRealtimeEnabled,
  ])

  const plannerUpdatedLabel = useMemo(() => {
    if (plannerMeta?.generatedAt) {
      try {
        return new Intl.DateTimeFormat('ko-KR', {
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(new Date(plannerMeta.generatedAt))
      } catch (error) {
        console.debug('시간 포맷 실패:', error)
        return plannerMeta.generatedAt
      }
    }
    if (!plannerUpdatedAt) return ''
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(plannerUpdatedAt)
    } catch (error) {
      console.debug('시간 포맷 실패:', error)
      return plannerUpdatedAt.toISOString()
    }
  }, [plannerMeta?.generatedAt, plannerUpdatedAt])

  const handlePlannerRefresh = useCallback(() => {
    refreshPlanner()
      .then((result) => {
        if (!result?.ok && result?.error) {
          setPlannerExportNotice(result.error)
        } else {
          setPlannerExportNotice('로컬 매칭 데이터를 새로 불러왔습니다.')
        }
      })
      .catch((cause) => {
        console.error('로컬 매칭 새로고침 실패:', cause)
        setPlannerExportNotice('로컬 매칭 데이터를 새로 불러오지 못했습니다.')
      })
  }, [refreshPlanner])

  const handlePlannerExport = useCallback(() => {
    const result = exportPlanner()
    if (result?.ok) {
      setPlannerExportNotice('로컬 매칭 결과를 JSON으로 저장했습니다.')
    } else if (result?.error) {
      setPlannerExportNotice(result.error)
    } else {
      setPlannerExportNotice('매칭 결과를 내보내지 못했습니다.')
    }
  }, [exportPlanner])

  useEffect(() => {
    if (!plannerExportNotice) return undefined
    const timer = setTimeout(() => {
      setPlannerExportNotice('')
    }, 4000)
    return () => {
      clearTimeout(timer)
    }
  }, [plannerExportNotice])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={handleBackToRoom}>
          ← 메인 룸으로 돌아가기
        </button>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{description}</p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>사용할 캐릭터 선택</h2>
        <p className={styles.sectionHint}>
          매칭 대기열에 합류하기 전에 이 게임에서 사용할 캐릭터를 직접 선택해 주세요.
        </p>
        <RosterHeroPicker
          entries={viewerRoster}
          heroMap={state.heroMap}
          selectedHeroId={state.heroId}
          onSelect={handleHeroOptionSelect}
          disabled={state.loading || state.status === 'queued'}
        />
        {heroOptions.length ? (
          <div className={styles.heroOptionList}>
            {heroOptions.map((option) => {
              const checked = Boolean(state.heroId) && state.heroId === option.heroId
              const detailParts = []
              if (option.role) {
                detailParts.push(option.role)
              }
              if (Number.isFinite(Number(option.score))) {
                detailParts.push(`점수 ${Math.round(Number(option.score))}`)
              }
              const detailLabel = detailParts.join(' · ')
              const statusLabel = formatParticipantStatus(option.status)
              return (
                <label
                  key={option.heroId}
                  className={`${styles.heroOptionItem} ${checked ? styles.heroOptionItemActive : ''}`}
                >
                  <input
                    type="radio"
                    name="match-hero-option"
                    value={option.heroId}
                    checked={checked}
                    onChange={() => handleHeroOptionSelect(option.heroId)}
                    className={styles.heroOptionRadio}
                  />
                  <div className={styles.heroOptionContent}>
                    {option.avatarUrl ? (
                      <img
                        src={option.avatarUrl}
                        alt={option.name || option.heroId}
                        className={styles.heroOptionAvatar}
                      />
                    ) : (
                      <div className={styles.heroOptionAvatarPlaceholder} />
                    )}
                    <div className={styles.heroOptionMeta}>
                      <span className={styles.heroOptionName}>{option.name || option.heroId}</span>
                      {detailLabel ? (
                        <span className={styles.heroOptionDetail}>{detailLabel}</span>
                      ) : null}
                      {statusLabel ? (
                        <span className={styles.heroOptionStatus}>{statusLabel}</span>
                      ) : null}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        ) : (
          <p className={styles.emptyHint}>
            이 게임에 등록된 캐릭터 정보를 찾지 못했습니다. 아래 입력란에 캐릭터 ID를 직접 입력해 주세요.
          </p>
        )}
        <form className={styles.heroManualForm} onSubmit={handleManualHeroSubmit}>
          <label className={styles.heroManualLabel} htmlFor="manual-hero-id">
            직접 캐릭터 ID 입력
          </label>
          <div className={styles.heroManualControls}>
            <input
              id="manual-hero-id"
              type="text"
              className={styles.heroManualInput}
              placeholder="예: 12345"
              value={manualHeroId}
              onChange={handleManualHeroInput}
            />
            <button type="submit" className={styles.heroManualButton}>
              ID 적용
            </button>
          </div>
          <p className={styles.heroManualHint}>ID를 비워 두면 선택한 캐릭터가 초기화됩니다.</p>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.statusRow}>
          <span className={styles.statusBadge}>{statusLabel}</span>
          <span className={styles.heroBadge}>선택한 캐릭터: {heroLabel}</span>
          <span className={styles.roleBadge}>참가 역할: {roleLabel}</span>
        </div>

        {autoJoin ? (
          <div className={styles.autoFlow}>
            <div className={styles.autoJoinNotice}>
              <p className={styles.sectionHint}>
                매칭 화면에 진입하는 즉시 대기열에 합류합니다. 필요한 경우 언제든지 취소할 수
                있어요.
              </p>
              {state.lockedRole ? (
                <p className={styles.sectionHint}>
                  현재 역할은 <strong>{state.lockedRole}</strong>로 고정되어 있습니다.
                </p>
              ) : null}
              {autoJoinBlockers.length ? (
                <div className={styles.autoJoinDebug}>
                  <p className={styles.autoJoinDebugTitle}>아직 대기 중인 조건</p>
                  <ul className={styles.autoJoinDebugList}>
                    {autoJoinBlockers.map((message, index) => (
                      <li key={`${message}-${index}`} className={styles.autoJoinDebugItem}>
                        {message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <ol className={styles.autoSteps}>
              {flowSteps.map((step) => (
                <li
                  key={step.key}
                  className={`${styles.autoStep} ${
                    step.state === 'done'
                      ? styles.autoStepDone
                      : step.state === 'active'
                      ? styles.autoStepActive
                      : styles.autoStepPending
                  }`}
                >
                  <span className={styles.autoStepIndicator} />
                  <span className={styles.autoStepLabel}>{step.label}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              className={styles.cancelLink}
              onClick={handleCancel}
              disabled={state.loading || state.status !== 'queued'}
            >
              대기열 나가고 메인 룸으로 돌아가기
            </button>
          </div>
        ) : (
          <div className={styles.manualActions}>
            {state.status === 'idle' ? (
              <>
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleJoinClick}
                    disabled={joinDisabled}
                  >
                    매칭 참가
                  </button>
                </div>
                {joinBlockers.length ? (
                  <>
                    <p className={styles.sectionHint}>
                      매칭 버튼을 활성화하려면 다음 항목을 먼저 확인해 주세요.
                    </p>
                    <ul className={styles.blockerList}>
                      {joinBlockers.map((message, index) => (
                        <li key={`${message}-${index}`} className={styles.blockerListItem}>
                          {message}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className={styles.sectionHint}>
                    선택한 캐릭터와 역할로 점수 ±200 범위의 방을 찾거나 새로 만듭니다. 빈 자리가
                    없다면 자동으로 새 방을 만들고 기다립니다.
                  </p>
                )}
              </>
            ) : null}

            {state.status === 'queued' ? (
              <>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.primaryButton} disabled>
                    대기열 확인 중…
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleCancel}
                    disabled={state.loading}
                  >
                    대기열 나가기
                  </button>
                </div>
                <p className={styles.sectionHint}>
                  비슷한 점수의 같은 역할 방을 찾는 중입니다. 모든 슬롯이 채워지면 자동으로 다음
                  단계로 이동합니다.
                </p>
              </>
            ) : null}

            {state.status === 'matched' ? (
              <p className={styles.sectionHint}>
                매칭이 완료되었습니다. 아래 팀 구성을 확인하고 전투를 준비해 주세요.
              </p>
            ) : null}
          </div>
        )}

        {state.error || autoJoinError ? (
          <p className={styles.errorText}>{state.error || autoJoinError}</p>
        ) : null}
        {autoJoin &&
        (state.error?.includes('캐릭터') || autoJoinError?.includes('캐릭터')) ? (
          <p className={styles.sectionHint}>
            메인 룸에서 사용할 캐릭터를 선택하면 자동으로 다시 대기열에 합류합니다.
          </p>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>대기열 현황</h2>
        {roomSummaries.length > 0 ? (
          <div className={styles.queueGrid}>
            {roomSummaries.map((room) => (
              <div key={room.role} className={styles.queueColumn}>
                <h3 className={styles.queueRole}>{room.role}</h3>
                <p className={styles.queueCount}>
                  {room.filled}/{room.total}명 준비
                </p>
                {room.ready ? (
                  <p className={styles.queueReady}>대기 완료</p>
                ) : (
                  <p className={styles.queuePending}>남은 슬롯 {Math.max(0, room.missing)}</p>
                )}
              </div>
            ))}
          </div>
        ) : queueByRole.length === 0 ? (
          <p className={styles.emptyHint}>{emptyHint}</p>
        ) : (
          <div className={styles.queueGrid}>
            {queueByRole.map(([role, entries]) => (
              <div key={role} className={styles.queueColumn}>
                <h3 className={styles.queueRole}>{role}</h3>
                <p className={styles.queueCount}>{entries.length}명 대기 중</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.plannerHeader}>
          <div>
            <h2 className={styles.sectionTitle}>로컬 매칭 시뮬레이터</h2>
            <p className={styles.sectionHint}>
              게임 슬롯과 대기열 데이터를 직접 불러와 점수·역할 기준으로 구성한 미리보기입니다.
            </p>
          </div>
          <div className={styles.plannerActions}>
            <button
              type="button"
              className={styles.plannerButton}
              onClick={handlePlannerRefresh}
              disabled={plannerLoading}
            >
              {plannerLoading ? '불러오는 중…' : '새로 고침'}
            </button>
            <button
              type="button"
              className={`${styles.plannerButton} ${styles.exportButton}`}
              onClick={handlePlannerExport}
              disabled={plannerLoading || !plannerPlan}
            >
              JSON 내보내기
            </button>
          </div>
        </div>
        {plannerUpdatedLabel ? (
          <p className={styles.plannerTimestamp}>최근 갱신: {plannerUpdatedLabel}</p>
        ) : null}
        {plannerExportNotice ? (
          <p className={styles.successText}>{plannerExportNotice}</p>
        ) : null}
        {plannerError ? <p className={styles.errorText}>{plannerError}</p> : null}
        {!plannerPlan && !plannerLoading && !plannerError ? (
          <p className={styles.sectionHint}>대기열 데이터를 불러와 로컬 매칭을 구성합니다.</p>
        ) : null}
        {plannerPlan ? (
          <>
            {plannerSummary ? (
              <p className={styles.sectionHint}>{plannerSummary}</p>
            ) : null}
            {plannerPlan.warnings?.length ? (
              <ul className={styles.diagnosticList}>
                {plannerPlan.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`} className={styles.diagnosticItem}>
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={styles.matchGrid}>
              {plannerPlan.assignments.map((assignment, index) => (
                <div key={`${assignment.role}-${index}`} className={styles.matchColumn}>
                  <h3 className={styles.queueRole}>{assignment.role}</h3>
                  <MemberList assignment={assignment} heroMap={plannerPlan.heroMap} />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      {showDiagnosticsCard ? (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>매칭 상황</h2>
          {pendingReason ? <p className={styles.sectionHint}>{pendingReason}</p> : null}
          {queuedSampleSummary ? (
            <p className={styles.sectionHint}>{queuedSampleSummary}</p>
          ) : null}
          {queuedSampleWarnings.length ? (
            <ul className={styles.diagnosticList}>
              {queuedSampleWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`} className={styles.diagnosticItem}>
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
          <div className={styles.retryRow}>
            <button
              type="button"
              className={styles.retryButton}
              onClick={handleManualRefresh}
              disabled={refreshing || state.loading || state.status !== 'queued'}
            >
              {refreshing ? '재확인 중…' : '즉시 다시 확인'}
            </button>
            <span className={styles.retryHint}>대기열 정보는 4초마다 자동 갱신됩니다.</span>
          </div>
        </section>
      ) : null}

      {state.status === 'matched' && state.match ? (
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>
          {isDropInMatch
            ? '실시간 난입 확정'
            : isBrawlMatch
            ? '난입 슬롯 충원 완료'
            : '매칭 완료'}
        </h2>
        <p className={styles.sectionHint}>
          {isDropInMatch
            ? dropInSummary
              ? `진행 중인 전투에 합류합니다. ${dropInSummary}`
              : '진행 중인 전투에 합류합니다. 메인 룸으로 돌아가 방에 입장해 주세요.'
            : isBrawlMatch
            ? brawlSummary
              ? `탈락한 역할군을 대신할 ${brawlSummary}이(가) 합류합니다.`
              : '탈락한 역할군을 대신할 참가자가 합류합니다.'
            : `허용 점수 폭 ±${state.match.maxWindow || 0} 내에서 팀이 구성되었습니다.`}
        </p>
        {!isDropInMatch && !isBrawlMatch && sampleSummary ? (
          <p className={styles.sectionHint}>{sampleSummary}</p>
        ) : null}
        {isBrawlMatch ? (
          <p className={styles.sectionHint}>
            허용 점수 폭 ±{state.match.maxWindow || 0}을 유지한 채 난입이 진행됩니다.
          </p>
        ) : null}
        {isDropInMatch ? (
          <p className={styles.sectionHint}>
            메인 룸에서 방을 열어둔 상태라면 즉시 입장해 전투를 시작할 수 있습니다.
          </p>
        ) : null}
        {debugHold ? (
          <div className={styles.debugHoldBox}>
            <p className={styles.debugHoldTitle}>디버그 모드: 자동 시작이 보류 중입니다.</p>
            <p className={styles.debugHoldText}>
              전투 화면을 열기 전에 구성된 로스터와 큐 정렬 결과를 확인하세요. 매치 준비 페이지에서도 동일한 로그를
              확인할 수 있습니다.
            </p>
            <div className={styles.debugHoldMeta}>
              {debugHold.queueMode ? (
                <span className={styles.debugHoldMetaItem}>
                  모드: {debugHold.queueMode === 'realtime' ? '실시간' : '비실시간'}
                </span>
              ) : null}
              {debugHold.matchCode ? (
                <span className={styles.debugHoldMetaItem}>매치 코드: {debugHold.matchCode}</span>
              ) : null}
              {debugHold.sessionId ? (
                <span className={styles.debugHoldMetaItem}>세션: {debugHold.sessionId}</span>
              ) : null}
              {Number.isFinite(debugHold.reconciled) ? (
                <span className={styles.debugHoldMetaItem}>재정렬 {debugHold.reconciled}명</span>
              ) : null}
              {Number.isFinite(debugHold.inserted) ? (
                <span className={styles.debugHoldMetaItem}>재삽입 {debugHold.inserted}명</span>
              ) : null}
              {Number.isFinite(debugHold.removed) ? (
                <span className={styles.debugHoldMetaItem}>제거 {debugHold.removed}명</span>
              ) : null}
            </div>
            {debugHold.issues?.length ? (
              <ul className={styles.debugHoldIssues}>
                {debugHold.issues.map((issue, index) => (
                  <li key={`queue-hold-issue-${index}`} className={styles.debugHoldIssue}>
                    {issue}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.debugHoldHint}>중복 배정이 감지되지 않았습니다.</p>
            )}
          </div>
        ) : null}
        <div className={styles.matchGrid}>
          {state.match.assignments.map((assignment, index) => (
            <div key={`${assignment.role}-${index}`} className={styles.matchColumn}>
              <h3 className={styles.queueRole}>{assignment.role}</h3>
              <MemberList assignment={assignment} heroMap={state.match.heroMap} />
              </div>
            ))}
          </div>

          {!isDropInMatch ? (
            <TimerVotePanel
              remaining={voteRemaining}
              selected={voteValue}
              onSelect={handleTimerVote}
              finalTimer={finalTimer}
            />
          ) : null}

          {isDropInMatch && dropInRedirectRemaining != null ? (
            <p className={styles.dropInCountdown}>
              {dropInRedirectRemaining > 0
                ? `${dropInRedirectRemaining}초 후 메인 룸으로 이동합니다.`
                : '메인 룸으로 이동합니다…'}
            </p>
          ) : null}

          {countdown != null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownCircle}>
                <span className={styles.countdownNumber}>
                  {countdown > 0 ? countdown : '시작'}
                </span>
              </div>
              <p className={styles.countdownHint}>
                {finalTimer != null
                  ? `턴 제한 ${finalTimer}초로 시작합니다.`
                  : '곧 전투 화면으로 이동합니다…'}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
