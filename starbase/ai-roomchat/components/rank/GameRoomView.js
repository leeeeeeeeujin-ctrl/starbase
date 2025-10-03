// components/rank/GameRoomView.js
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import styles from './GameRoomView.module.css'
import { getHeroAudioManager } from '../../lib/audio/heroAudioManager'
import { normalizeTurnSummaryPayload } from '../../lib/rank/turnSummary'
import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'

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

const DEFAULT_EQ_SETTINGS = { enabled: false, low: 0, mid: 0, high: 0 }
const DEFAULT_REVERB_SETTINGS = { enabled: false, mix: 0.3, decay: 1.8 }
const DEFAULT_COMPRESSOR_SETTINGS = { enabled: false, threshold: -28, ratio: 2.5, release: 0.25 }

function compareParticipantsByScore(a, b) {
  const scoreA = Number.isFinite(Number(a?.score)) ? Number(a.score) : -Infinity
  const scoreB = Number.isFinite(Number(b?.score)) ? Number(b.score) : -Infinity
  if (scoreA === scoreB) {
    return (a?.created_at || '').localeCompare(b?.created_at || '')
  }
  return scoreB - scoreA
}

const TABS = [
  { key: 'main', label: '메인 룸' },
  { key: 'hero', label: '캐릭터 정보' },
  { key: 'ranking', label: '랭킹' },
]

function clamp(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return Number.isFinite(fallback) ? fallback : min
  }
  return Math.min(Math.max(number, min), max)
}

function normalizeEqSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_EQ_SETTINGS }
  }

  const enabled = Boolean(
    typeof raw.enabled === 'boolean'
      ? raw.enabled
      : typeof raw.eqEnabled === 'boolean'
      ? raw.eqEnabled
      : raw.active,
  )

  return {
    enabled,
    low: clamp(raw.low ?? raw.bass ?? 0, -12, 12, 0),
    mid: clamp(raw.mid ?? raw.middle ?? 0, -12, 12, 0),
    high: clamp(raw.high ?? raw.treble ?? 0, -12, 12, 0),
  }
}

function normalizeReverbSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_REVERB_SETTINGS }
  }

  const enabled = Boolean(
    typeof raw.enabled === 'boolean'
      ? raw.enabled
      : typeof raw.reverbEnabled === 'boolean'
      ? raw.reverbEnabled
      : raw.active,
  )

  return {
    enabled,
    mix: clamp(raw.mix ?? raw.wet ?? 0.3, 0, 1, 0.3),
    decay: clamp(raw.decay ?? raw.duration ?? 1.8, 0.1, 6, 1.8),
  }
}

function normalizeCompressorSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_COMPRESSOR_SETTINGS }
  }

  const enabled = Boolean(
    typeof raw.enabled === 'boolean'
      ? raw.enabled
      : typeof raw.compressorEnabled === 'boolean'
      ? raw.compressorEnabled
      : raw.active,
  )

  return {
    enabled,
    threshold: clamp(raw.threshold ?? raw.level ?? -28, -60, 0, -28),
    ratio: clamp(raw.ratio ?? raw.amount ?? 2.5, 1, 20, 2.5),
    release: clamp(raw.release ?? raw.tail ?? 0.25, 0.05, 2, 0.25),
  }
}

function eqSettingsAreEqual(a, b) {
  const first = normalizeEqSettings(a)
  const second = normalizeEqSettings(b)
  const lowDelta = Math.abs((first.low ?? 0) - (second.low ?? 0))
  const midDelta = Math.abs((first.mid ?? 0) - (second.mid ?? 0))
  const highDelta = Math.abs((first.high ?? 0) - (second.high ?? 0))
  return first.enabled === second.enabled && lowDelta < 0.001 && midDelta < 0.001 && highDelta < 0.001
}

function reverbSettingsAreEqual(a, b) {
  const first = normalizeReverbSettings(a)
  const second = normalizeReverbSettings(b)
  const mixDelta = Math.abs((first.mix ?? 0) - (second.mix ?? 0))
  const decayDelta = Math.abs((first.decay ?? 0) - (second.decay ?? 0))
  return first.enabled === second.enabled && mixDelta < 0.001 && decayDelta < 0.001
}

function compressorSettingsAreEqual(a, b) {
  const first = normalizeCompressorSettings(a)
  const second = normalizeCompressorSettings(b)
  const thresholdDelta = Math.abs((first.threshold ?? 0) - (second.threshold ?? 0))
  const ratioDelta = Math.abs((first.ratio ?? 0) - (second.ratio ?? 0))
  const releaseDelta = Math.abs((first.release ?? 0) - (second.release ?? 0))
  return (
    first.enabled === second.enabled &&
    thresholdDelta < 0.001 &&
    ratioDelta < 0.001 &&
    releaseDelta < 0.001
  )
}

function buildHeroAudioProfileKey(profile) {
  if (!profile) return null
  const source = typeof profile.source === 'string' && profile.source ? profile.source : 'unknown'
  if (profile.heroId) {
    return `${source}:${profile.heroId}`
  }
  const label = typeof profile.heroName === 'string' ? profile.heroName.trim().toLowerCase() : ''
  if (label) {
    return `${source}:${label}`
  }
  return source
}

function normalizeAudioPreferenceRecord(record) {
  if (!record || typeof record !== 'object') {
    return null
  }

  return {
    trackId: record.track_id || record.trackId || null,
    presetId: record.preset_id || record.presetId || null,
    manualOverride: Boolean(record.manual_override ?? record.manualOverride ?? false),
    eq: normalizeEqSettings(record.eq_settings || record.eqSettings),
    reverb: normalizeReverbSettings(record.reverb_settings || record.reverbSettings),
    compressor: normalizeCompressorSettings(record.compressor_settings || record.compressorSettings),
  }
}

function extractHeroAudioEffectSnapshot(state) {
  if (!state) return null

  return {
    eq: {
      enabled: Boolean(state.eqEnabled),
      low: clamp(state.equalizer?.low ?? 0, -12, 12, 0),
      mid: clamp(state.equalizer?.mid ?? 0, -12, 12, 0),
      high: clamp(state.equalizer?.high ?? 0, -12, 12, 0),
    },
    reverb: {
      enabled: Boolean(state.reverbEnabled),
      mix: clamp(state.reverbDetail?.mix ?? 0.3, 0, 1, 0.3),
      decay: clamp(state.reverbDetail?.decay ?? 1.8, 0.1, 6, 1.8),
    },
    compressor: {
      enabled: Boolean(state.compressorEnabled),
      threshold: clamp(state.compressorDetail?.threshold ?? -28, -60, 0, -28),
      ratio: clamp(state.compressorDetail?.ratio ?? 2.5, 1, 20, 2.5),
      release: clamp(state.compressorDetail?.release ?? 0.25, 0.05, 2, 0.25),
    },
  }
}

function diffAudioPreferenceChanges(prev, next) {
  if (!next) return []
  const changes = []
  if (!prev) {
    changes.push('initial')
  }

  if ((prev?.trackId || null) !== (next.trackId || null)) {
    if (next.trackId || prev?.trackId) {
      changes.push('trackId')
    }
  }

  if ((prev?.presetId || null) !== (next.presetId || null)) {
    if (next.presetId || prev?.presetId) {
      changes.push('presetId')
    }
  }

  if (Boolean(prev?.manualOverride) !== Boolean(next.manualOverride)) {
    changes.push('manualOverride')
  }

  const prevEq = prev?.eq || null
  const nextEq = next.eq || null
  if (
    !prevEq ||
    !nextEq ||
    Boolean(prevEq.enabled) !== Boolean(nextEq.enabled) ||
    prevEq.low !== nextEq.low ||
    prevEq.mid !== nextEq.mid ||
    prevEq.high !== nextEq.high
  ) {
    changes.push('eq')
  }

  const prevReverb = prev?.reverb || null
  const nextReverb = next.reverb || null
  if (
    !prevReverb ||
    !nextReverb ||
    Boolean(prevReverb.enabled) !== Boolean(nextReverb.enabled) ||
    prevReverb.mix !== nextReverb.mix ||
    prevReverb.decay !== nextReverb.decay
  ) {
    changes.push('reverb')
  }

  const prevCompressor = prev?.compressor || null
  const nextCompressor = next.compressor || null
  if (
    !prevCompressor ||
    !nextCompressor ||
    Boolean(prevCompressor.enabled) !== Boolean(nextCompressor.enabled) ||
    prevCompressor.threshold !== nextCompressor.threshold ||
    prevCompressor.ratio !== nextCompressor.ratio ||
    prevCompressor.release !== nextCompressor.release
  ) {
    changes.push('compressor')
  }

  return Array.from(new Set(changes))
}

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

  const audioProfile = rawHero.audio_profile || rawHero.audioProfile || null
  const trackSources = []

  if (audioProfile) {
    const playlists = []
    if (Array.isArray(audioProfile.playlist)) {
      playlists.push(...audioProfile.playlist)
    }
    if (Array.isArray(audioProfile.tracks)) {
      playlists.push(...audioProfile.tracks)
    }
    if (Array.isArray(audioProfile.bgms)) {
      playlists.push(...audioProfile.bgms)
    }
    playlists.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return
      trackSources.push(entry)
    })
  }

  const heroBgms = rawHero.hero_bgms || rawHero.heroBgms
  if (Array.isArray(heroBgms)) {
    heroBgms.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return
      trackSources.push(entry)
    })
  }

  const sanitizedTracks = []
  const seenUrls = new Set()

  trackSources.forEach((entry, index) => {
    const url = entry.url || entry.src || entry.href || null
    if (!url || typeof url !== 'string') {
      return
    }
    if (seenUrls.has(url)) {
      return
    }
    seenUrls.add(url)

    const trackId =
      entry.id || entry.key || entry.slug || (typeof entry.label === 'string' && entry.label.trim())
        || `track-${index}`

    const durationValue =
      entry.duration_seconds ?? entry.durationSeconds ?? entry.duration ?? entry.length ?? null

    sanitizedTracks.push({
      id: trackId,
      label:
        entry.label || entry.name || entry.title || entry.displayName || `${fallbackHeroName || '브금'} 트랙`,
      url,
      duration: Number.isFinite(Number(durationValue)) ? Math.max(0, Math.round(Number(durationValue))) : null,
      type: entry.type || entry.kind || entry.mood || null,
      presetId: entry.preset_id || entry.presetId || entry.preset || null,
      sortOrder: Number.isFinite(Number(entry.sort_order || entry.sortOrder))
        ? Number(entry.sort_order || entry.sortOrder)
        : index,
    })
  })

  if (bgmUrl && !seenUrls.has(bgmUrl)) {
    sanitizedTracks.push({
      id: 'primary-track',
      label: `${fallbackHeroName || rawHero.name || '대표'} 테마`,
      url: bgmUrl,
      duration,
      type: '대표',
      presetId: null,
      sortOrder: -1,
    })
  }

  sanitizedTracks.sort((a, b) => {
    if (a.sortOrder === b.sortOrder) {
      return a.label.localeCompare(b.label)
    }
    return a.sortOrder - b.sortOrder
  })

  const defaultTrackIdRaw =
    audioProfile?.defaultTrackId || audioProfile?.defaultTrack || audioProfile?.initialTrack || null

  const defaultTrack = sanitizedTracks.find((track) => track.id === defaultTrackIdRaw) || sanitizedTracks[0] || null

  const eqSettings = normalizeEqSettings(
    audioProfile?.eq || audioProfile?.equalizer || rawHero.audio_eq || rawHero.audioEq,
  )
  const reverbSettings = normalizeReverbSettings(
    audioProfile?.reverb || rawHero.audio_reverb || rawHero.audioReverb,
  )
  const compressorSettings = normalizeCompressorSettings(
    audioProfile?.compressor || rawHero.audio_compressor || rawHero.audioCompressor,
  )

  const rawPresets = []
  if (audioProfile?.presets && Array.isArray(audioProfile.presets)) {
    rawPresets.push(...audioProfile.presets)
  } else if (audioProfile?.presetMap && typeof audioProfile.presetMap === 'object') {
    Object.entries(audioProfile.presetMap).forEach(([key, value]) => {
      rawPresets.push({ id: key, ...(value || {}) })
    })
  }

  const presets = rawPresets
    .map((preset, index) => {
      if (!preset || typeof preset !== 'object') return null
      const id = preset.id || preset.key || preset.slug || `preset-${index}`
      const label = preset.label || preset.name || preset.title || `프리셋 ${index + 1}`
      return {
        id,
        label,
        description: preset.description || preset.summary || '',
        eq: preset.eq || preset.equalizer ? normalizeEqSettings(preset.eq || preset.equalizer) : null,
        reverb: preset.reverb ? normalizeReverbSettings(preset.reverb) : null,
        compressor: preset.compressor ? normalizeCompressorSettings(preset.compressor) : null,
        tags: Array.isArray(preset.tags)
          ? preset.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim())
          : [],
      }
    })
    .filter(Boolean)

  const defaultPresetIdRaw =
    audioProfile?.defaultPresetId || audioProfile?.defaultPreset || audioProfile?.initialPreset || null

  const defaultPreset = presets.find((preset) => preset.id === defaultPresetIdRaw) || null

  return {
    heroId: rawHero.id || fallbackHeroId || null,
    heroName: rawHero.name || fallbackHeroName || '',
    bgmUrl,
    bgmDuration: duration,
    tracks: sanitizedTracks,
    defaultTrackId: defaultTrack?.id || null,
    eq: eqSettings,
    reverb: reverbSettings,
    compressor: compressorSettings,
    presets,
    defaultPresetId: defaultPreset?.id || null,
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

function formatDbLabel(value) {
  if (!Number.isFinite(value)) return '0dB'
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)}dB`
}

function formatPercentLabel(value) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`
}

function formatSecondsLabel(value) {
  if (!Number.isFinite(value)) return '0.0s'
  return `${(Math.round(Math.max(value, 0) * 10) / 10).toFixed(1)}s`
}

function formatMillisecondsLabel(value) {
  if (!Number.isFinite(value)) return '0ms'
  return `${Math.round(Math.max(value, 0) * 1000)}ms`
}

function formatRatioLabel(value) {
  if (!Number.isFinite(value)) return '1.0:1'
  return `${(Math.round(Math.max(value, 0) * 10) / 10).toFixed(1)}:1`
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
  const currentAudioTrackRef = useRef({ url: null, heroId: null, trackId: null })
  const heroAudioVolumeMemoryRef = useRef(audioManager?.getState()?.volume ?? 0.72)
  const [heroAudioState, setHeroAudioState] = useState(() =>
    audioManager ? audioManager.getState() : null,
  )
  const heroAudioVolumeInputId = useId()
  const [selectedHeroAudioTrackId, setSelectedHeroAudioTrackId] = useState(null)
  const [selectedHeroAudioPresetId, setSelectedHeroAudioPresetId] = useState(null)
  const [heroAudioManualOverride, setHeroAudioManualOverride] = useState(false)
  const [viewerId, setViewerId] = useState(null)
  const [audioPreferenceLoadedKey, setAudioPreferenceLoadedKey] = useState(null)
  const audioPreferenceSaveTimeoutRef = useRef(null)
  const heroAudioPreferenceDirtyRef = useRef(false)
  const lastPersistedSignatureRef = useRef(null)
  const lastPersistedPayloadRef = useRef(null)
  const previousAudioProfileKeyRef = useRef(null)
  const audioBaselineEffectsRef = useRef(null)
  const baselineEffectAppliedRef = useRef(false)

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

    const unsubscribe = audioManager.subscribe((snapshot) => {
      setHeroAudioState(snapshot)
      if (snapshot && Number.isFinite(snapshot.volume) && snapshot.volume > 0) {
        heroAudioVolumeMemoryRef.current = snapshot.volume
      }
    })

    return () => {
      unsubscribe()
    }
  }, [audioManager])

  useEffect(() => {
    if (!audioManager) {
      return undefined
    }

    const baselineSnapshot = audioManager.getState()
    audioBaselineRef.current = baselineSnapshot
    audioBaselineEffectsRef.current = extractHeroAudioEffectSnapshot(baselineSnapshot)
    baselineEffectAppliedRef.current = false

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
        const baselineReady =
          occupancy?.occupiedSlots != null
            ? Math.max(Number(occupancy.occupiedSlots), 0)
            : capacity != null
            ? Math.min(entry.count, capacity)
            : entry.count
        const stillNeeded =
          capacity != null ? Math.max(capacity - baselineReady, 0) : null
        const overflowCount =
          capacity != null ? Math.max(entry.count - baselineReady, 0) : 0

        return {
          name,
          count: entry.count,
          minimumRequired: capacity,
          baselineReady,
          overflowCount,
          neededForStart: stillNeeded,
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

  const baselineSummary = useMemo(() => {
    if (!participantsByRole.length) {
      return { totalMinimum: 0, shortfall: 0 }
    }
    return participantsByRole.reduce(
      (acc, entry) => {
        const minimumValue =
          Number.isFinite(Number(entry.minimumRequired)) && Number(entry.minimumRequired) >= 0
            ? Number(entry.minimumRequired)
            : 0
        const shortfallValue =
          Number.isFinite(Number(entry.neededForStart)) && Number(entry.neededForStart) >= 0
            ? Number(entry.neededForStart)
            : 0
        return {
          totalMinimum: acc.totalMinimum + minimumValue,
          shortfall: acc.shortfall + shortfallValue,
        }
      },
      { totalMinimum: 0, shortfall: 0 },
    )
  }, [participantsByRole])

  const capacityCountLabel = useMemo(() => {
    if (minimumParticipants > 0) {
      return `${readyCount}/${minimumParticipants}명 참여`
    }
    return `${readyCount}명 참여`
  }, [minimumParticipants, readyCount])

  const capacityStatusText = useMemo(() => {
    if (canStart) return '기본 역할 최소 인원이 모두 충족되었습니다.'
    if (baselineSummary.shortfall > 0 && baselineSummary.totalMinimum > 0) {
      return `시작까지 기본 슬롯 ${baselineSummary.shortfall}명 충원 필요`
    }
    if (minimumParticipants > 0) {
      return `${minimumParticipants}명 이상 모이면 시작할 수 있습니다.`
    }
    return '함께할 참가자를 기다리는 중'
  }, [baselineSummary.shortfall, baselineSummary.totalMinimum, canStart, minimumParticipants])

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

  const baseHeroAudioProfile = useMemo(() => {
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

  const rankingHeroAudioProfile = useMemo(() => {
    const candidates = Array.isArray(participants)
      ? participants
          .filter(
            (participant) =>
              participant?.hero && (participant.hero.bgm_url || participant.hero.bgmUrl),
          )
          .slice()
          .sort(compareParticipantsByScore)
      : []

    const top = candidates[0] || null
    if (!top?.hero) {
      return null
    }

    const rankingProfile = normalizeHeroAudioProfile(top.hero, {
      fallbackHeroId: top.hero_id || null,
      fallbackHeroName: top.hero?.name || '',
    })

    if (!rankingProfile) {
      return null
    }

    return { ...rankingProfile, source: 'ranking' }
  }, [participants])

  const heroAudioProfile = useMemo(() => {
    if (activeTab === 'ranking' && rankingHeroAudioProfile) {
      return rankingHeroAudioProfile
    }

    if (baseHeroAudioProfile) {
      return baseHeroAudioProfile
    }

    return null
  }, [activeTab, baseHeroAudioProfile, rankingHeroAudioProfile])

  const heroAudioProfileKey = useMemo(
    () => buildHeroAudioProfileKey(heroAudioProfile),
    [heroAudioProfile?.heroId, heroAudioProfile?.heroName, heroAudioProfile?.source],
  )

  useEffect(() => {
    if (previousAudioProfileKeyRef.current === heroAudioProfileKey) {
      return
    }
    previousAudioProfileKeyRef.current = heroAudioProfileKey
    if (audioPreferenceSaveTimeoutRef.current) {
      clearTimeout(audioPreferenceSaveTimeoutRef.current)
      audioPreferenceSaveTimeoutRef.current = null
    }
    heroAudioPreferenceDirtyRef.current = false
    lastPersistedSignatureRef.current = null
    lastPersistedPayloadRef.current = null
    setAudioPreferenceLoadedKey(null)
    baselineEffectAppliedRef.current = false
  }, [heroAudioProfileKey])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    let cancelled = false

    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Failed to resolve viewer for audio preferences', error)
          setViewerId(null)
          return
        }
        setViewerId(data?.user?.id || null)
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to resolve viewer for audio preferences', error)
          setViewerId(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!heroAudioProfile) {
      setSelectedHeroAudioTrackId(null)
      setSelectedHeroAudioPresetId(null)
      setHeroAudioManualOverride(false)
      return
    }

    setSelectedHeroAudioTrackId((prev) => {
      if (prev && heroAudioProfile.tracks?.some((track) => track.id === prev)) {
        return prev
      }
      return heroAudioProfile.defaultTrackId || heroAudioProfile.tracks?.[0]?.id || null
    })

    setSelectedHeroAudioPresetId((prev) => {
      if (prev && heroAudioProfile.presets?.some((preset) => preset.id === prev)) {
        return prev
      }
      return heroAudioProfile.defaultPresetId || heroAudioProfile.presets?.[0]?.id || null
    })

    setHeroAudioManualOverride(false)
  }, [
    heroAudioProfile?.heroId,
    heroAudioProfile?.defaultTrackId,
    heroAudioProfile?.defaultPresetId,
    heroAudioProfile?.tracks?.length,
    heroAudioProfile?.presets?.length,
  ])

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
      case 'ranking':
        return '현재 브금 · 랭킹 1위'
      default:
        return '현재 브금'
    }
  }, [heroAudioProfile])

  const heroAudioActiveTrack = useMemo(() => {
    if (!heroAudioProfile) {
      return null
    }

    if (heroAudioProfile.tracks?.length) {
      const selectedTrack = heroAudioProfile.tracks.find((track) => track.id === selectedHeroAudioTrackId)
      return selectedTrack || heroAudioProfile.tracks[0]
    }

    if (heroAudioProfile.bgmUrl) {
      return {
        id: heroAudioProfile.defaultTrackId || 'primary-track',
        label: `${heroAudioProfile.heroName || '브금'} 테마`,
        url: heroAudioProfile.bgmUrl,
        duration: heroAudioProfile.bgmDuration || null,
        type: null,
        presetId: null,
      }
    }

    return null
  }, [heroAudioProfile, selectedHeroAudioTrackId])

  const heroAudioDurationLabel = useMemo(
    () => (Number.isFinite(heroAudioActiveTrack?.duration) ? formatDurationLabel(heroAudioActiveTrack.duration) : null),
    [heroAudioActiveTrack?.duration],
  )

  const heroAudioTracks = heroAudioProfile?.tracks ?? []
  const heroAudioPresets = heroAudioProfile?.presets ?? []
  const heroAudioActivePreset = heroAudioPresets.find((preset) => preset.id === selectedHeroAudioPresetId) || null

  const heroAudioEffectSnapshot = useMemo(
    () => extractHeroAudioEffectSnapshot(heroAudioState),
    [
      heroAudioState?.eqEnabled,
      heroAudioState?.equalizer?.high,
      heroAudioState?.equalizer?.low,
      heroAudioState?.equalizer?.mid,
      heroAudioState?.reverbEnabled,
      heroAudioState?.reverbDetail?.decay,
      heroAudioState?.reverbDetail?.mix,
      heroAudioState?.compressorEnabled,
      heroAudioState?.compressorDetail?.ratio,
      heroAudioState?.compressorDetail?.release,
      heroAudioState?.compressorDetail?.threshold,
    ],
  )

  const currentHeroAudioPreference = useMemo(() => {
    if (!heroAudioEffectSnapshot) return null
    return {
      trackId: selectedHeroAudioTrackId || heroAudioActiveTrack?.id || null,
      presetId: heroAudioManualOverride ? null : selectedHeroAudioPresetId || null,
      manualOverride: heroAudioManualOverride,
      eq: { ...heroAudioEffectSnapshot.eq },
      reverb: { ...heroAudioEffectSnapshot.reverb },
      compressor: { ...heroAudioEffectSnapshot.compressor },
    }
  }, [
    heroAudioActiveTrack?.id,
    heroAudioEffectSnapshot,
    heroAudioManualOverride,
    selectedHeroAudioPresetId,
    selectedHeroAudioTrackId,
  ])

  const currentHeroAudioPreferenceSignature = useMemo(
    () => (currentHeroAudioPreference ? JSON.stringify(currentHeroAudioPreference) : null),
    [currentHeroAudioPreference],
  )

  const heroAudioEqSummary = useMemo(() => {
    if (!heroAudioState?.equalizer) {
      return '저 0dB · 중 0dB · 고 0dB'
    }
    return `저 ${formatDbLabel(heroAudioState.equalizer.low)} · 중 ${formatDbLabel(heroAudioState.equalizer.mid)} · 고 ${formatDbLabel(heroAudioState.equalizer.high)}`
  }, [heroAudioState?.equalizer?.high, heroAudioState?.equalizer?.low, heroAudioState?.equalizer?.mid])

  const heroAudioReverbSummary = useMemo(() => {
    if (!heroAudioState?.reverbDetail) {
      return '믹스 0% · 잔향 0.0s'
    }
    return `믹스 ${formatPercentLabel(heroAudioState.reverbDetail.mix)} · 잔향 ${formatSecondsLabel(heroAudioState.reverbDetail.decay)}`
  }, [heroAudioState?.reverbDetail?.decay, heroAudioState?.reverbDetail?.mix])

  const heroAudioCompressorSummary = useMemo(() => {
    if (!heroAudioState?.compressorDetail) {
      return '임계값 0dB · 비율 1.0:1 · 릴리즈 0ms'
    }
    return `임계값 ${formatDbLabel(heroAudioState.compressorDetail.threshold)} · 비율 ${formatRatioLabel(heroAudioState.compressorDetail.ratio)} · 릴리즈 ${formatMillisecondsLabel(heroAudioState.compressorDetail.release)}`
  }, [
    heroAudioState?.compressorDetail?.ratio,
    heroAudioState?.compressorDetail?.release,
    heroAudioState?.compressorDetail?.threshold,
  ])

  const applyLoadedHeroAudioPreference = useCallback(
    (preference) => {
      if (!heroAudioProfile || heroAudioProfile.source === 'ranking') {
        return { hadAdjustments: false, normalized: null }
      }

      const normalized = {
        trackId: preference?.trackId || null,
        presetId: preference?.presetId || null,
        manualOverride: Boolean(preference?.manualOverride),
        eq: normalizeEqSettings(preference?.eq),
        reverb: normalizeReverbSettings(preference?.reverb),
        compressor: normalizeCompressorSettings(preference?.compressor),
      }

      let hadAdjustments = false

      if (normalized.trackId) {
        if (heroAudioTracks.some((track) => track.id === normalized.trackId)) {
          setSelectedHeroAudioTrackId(normalized.trackId)
        } else {
          hadAdjustments = true
          const fallbackTrackId = heroAudioProfile.defaultTrackId || heroAudioTracks[0]?.id || null
          setSelectedHeroAudioTrackId(fallbackTrackId || null)
        }
      }

      const manualOverride = Boolean(normalized.manualOverride)
      setHeroAudioManualOverride(manualOverride)

      if (!manualOverride) {
        if (normalized.presetId) {
          if (heroAudioPresets.some((preset) => preset.id === normalized.presetId)) {
            setSelectedHeroAudioPresetId(normalized.presetId)
          } else {
            hadAdjustments = true
            if (
              heroAudioProfile.defaultPresetId &&
              heroAudioPresets.some((preset) => preset.id === heroAudioProfile.defaultPresetId)
            ) {
              setSelectedHeroAudioPresetId(heroAudioProfile.defaultPresetId)
            } else if (heroAudioPresets.length) {
              setSelectedHeroAudioPresetId(heroAudioPresets[0].id)
            } else {
              setSelectedHeroAudioPresetId(null)
            }
          }
        } else if (!heroAudioPresets.length) {
          setSelectedHeroAudioPresetId(null)
        }
      } else {
        setSelectedHeroAudioPresetId(null)
        if (audioManager) {
          const eqSettings = normalizeEqSettings(normalized.eq)
          audioManager.setEqEnabled(Boolean(eqSettings.enabled))
          audioManager.setEqualizer({
            low: eqSettings.low,
            mid: eqSettings.mid,
            high: eqSettings.high,
          })

          const reverbSettings = normalizeReverbSettings(normalized.reverb)
          audioManager.setReverbEnabled(Boolean(reverbSettings.enabled))
          audioManager.setReverbDetail({
            mix: reverbSettings.mix,
            decay: reverbSettings.decay,
          })

          const compressorSettings = normalizeCompressorSettings(normalized.compressor)
          audioManager.setCompressorEnabled(Boolean(compressorSettings.enabled))
          audioManager.setCompressorDetail({
            threshold: compressorSettings.threshold,
            ratio: compressorSettings.ratio,
            release: compressorSettings.release,
          })
        }
      }

      return { hadAdjustments, normalized }
    },
    [audioManager, heroAudioPresets, heroAudioProfile, heroAudioTracks],
  )

  useEffect(() => {
    if (!viewerId || !heroAudioProfileKey || !heroAudioProfile) {
      return undefined
    }
    if (heroAudioProfile.source === 'ranking') {
      return undefined
    }
    if (audioPreferenceLoadedKey === heroAudioProfileKey) {
      return undefined
    }

    let cancelled = false

    const loadPreference = async () => {
      try {
        const { data, error } = await withTable(supabase, 'rank_audio_preferences', (table) =>
          supabase
            .from(table)
            .select(
              'track_id, preset_id, manual_override, eq_settings, reverb_settings, compressor_settings',
            )
            .eq('owner_id', viewerId)
            .eq('profile_key', heroAudioProfileKey)
            .maybeSingle(),
        )

        if (cancelled) {
          return
        }

        if (error && error.code !== 'PGRST116') {
          console.error('Failed to load hero audio preference', error)
        }

        if (data) {
          const normalizedRecord = normalizeAudioPreferenceRecord(data)
          const { hadAdjustments, normalized } = applyLoadedHeroAudioPreference(normalizedRecord)
          lastPersistedPayloadRef.current = normalized
          lastPersistedSignatureRef.current = normalized ? JSON.stringify(normalized) : null
          heroAudioPreferenceDirtyRef.current = Boolean(hadAdjustments)
        } else {
          lastPersistedPayloadRef.current = null
          lastPersistedSignatureRef.current = null
          heroAudioPreferenceDirtyRef.current = false
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load hero audio preference', error)
        }
      } finally {
        if (!cancelled) {
          setAudioPreferenceLoadedKey(heroAudioProfileKey)
        }
      }
    }

    loadPreference()

    return () => {
      cancelled = true
    }
  }, [
    applyLoadedHeroAudioPreference,
    audioPreferenceLoadedKey,
    heroAudioProfile,
    heroAudioProfileKey,
    viewerId,
  ])

  useEffect(() => {
    if (!viewerId || !heroAudioProfileKey || !heroAudioProfile) {
      return undefined
    }
    if (heroAudioProfile.source === 'ranking') {
      return undefined
    }
    if (audioPreferenceLoadedKey !== heroAudioProfileKey) {
      return undefined
    }
    if (!currentHeroAudioPreference || !currentHeroAudioPreferenceSignature) {
      return undefined
    }
    if (!heroAudioPreferenceDirtyRef.current && !lastPersistedSignatureRef.current) {
      return undefined
    }
    if (
      !heroAudioPreferenceDirtyRef.current &&
      lastPersistedSignatureRef.current === currentHeroAudioPreferenceSignature
    ) {
      return undefined
    }

    if (audioPreferenceSaveTimeoutRef.current) {
      clearTimeout(audioPreferenceSaveTimeoutRef.current)
      audioPreferenceSaveTimeoutRef.current = null
    }

    const payload = {
      trackId: currentHeroAudioPreference.trackId || null,
      presetId: currentHeroAudioPreference.presetId || null,
      manualOverride: Boolean(currentHeroAudioPreference.manualOverride),
      eq: { ...currentHeroAudioPreference.eq },
      reverb: { ...currentHeroAudioPreference.reverb },
      compressor: { ...currentHeroAudioPreference.compressor },
    }

    audioPreferenceSaveTimeoutRef.current = setTimeout(() => {
      audioPreferenceSaveTimeoutRef.current = null
      ;(async () => {
        try {
          const { error } = await withTable(supabase, 'rank_audio_preferences', (table) =>
            supabase
              .from(table)
              .upsert(
                {
                  owner_id: viewerId,
                  profile_key: heroAudioProfileKey,
                  hero_id: heroAudioProfile.heroId,
                  hero_name: heroAudioProfile.heroName || '',
                  hero_source: heroAudioProfile.source || '',
                  track_id: payload.trackId,
                  preset_id: payload.presetId,
                  manual_override: payload.manualOverride,
                  eq_settings: payload.eq,
                  reverb_settings: payload.reverb,
                  compressor_settings: payload.compressor,
                },
                { onConflict: 'owner_id,profile_key' },
              )
              .select('id')
              .maybeSingle(),
          )

          if (error) {
            console.error('Failed to persist hero audio preference', error)
            return
          }

          const previous = lastPersistedPayloadRef.current
          const changedFields = diffAudioPreferenceChanges(previous, payload)
          lastPersistedPayloadRef.current = payload
          lastPersistedSignatureRef.current = currentHeroAudioPreferenceSignature
          heroAudioPreferenceDirtyRef.current = false

          if (changedFields.length) {
            const eventResult = await withTable(supabase, 'rank_audio_events', (table) =>
              supabase.from(table).insert({
                owner_id: viewerId,
                profile_key: heroAudioProfileKey,
                hero_id: heroAudioProfile.heroId,
                hero_name: heroAudioProfile.heroName || '',
                hero_source: heroAudioProfile.source || '',
                event_type: 'preference.updated',
                details: {
                  changedFields,
                  preference: payload,
                },
              }),
            )
            if (eventResult?.error) {
              console.error('Failed to record hero audio preference event', eventResult.error)
            }
          }
        } catch (error) {
          console.error('Failed to persist hero audio preference', error)
        }
      })()
    }, 360)

    return () => {
      if (audioPreferenceSaveTimeoutRef.current) {
        clearTimeout(audioPreferenceSaveTimeoutRef.current)
        audioPreferenceSaveTimeoutRef.current = null
      }
    }
  }, [
    audioPreferenceLoadedKey,
    currentHeroAudioPreference,
    currentHeroAudioPreferenceSignature,
    heroAudioManualOverride,
    heroAudioProfile,
    heroAudioProfileKey,
    viewerId,
  ])

  const heroAudioPresetLabel = heroAudioManualOverride
    ? '커스텀'
    : heroAudioActivePreset?.label || (heroAudioPresets.length ? '기본 프리셋' : '기본 설정')

  const heroAudioVolumePercent = useMemo(() => {
    const fromState = Number.isFinite(Number(heroAudioState?.volume))
      ? Number(heroAudioState.volume)
      : null
    const baselineVolume = Number.isFinite(Number(audioBaselineRef.current?.volume))
      ? Number(audioBaselineRef.current.volume)
      : null
    const resolved = fromState ?? baselineVolume ?? 0.72
    return Math.round(Math.min(Math.max(resolved, 0), 1) * 100)
  }, [heroAudioState?.volume])

  const heroAudioIsMuted = heroAudioVolumePercent <= 0

  const heroAudioProgressPercent = useMemo(() => {
    if (!heroAudioState || !Number.isFinite(heroAudioState.duration) || heroAudioState.duration <= 0) {
      return 0
    }
    const ratio = heroAudioState.progress && Number.isFinite(heroAudioState.progress)
      ? heroAudioState.progress / heroAudioState.duration
      : 0
    return Math.round(Math.min(Math.max(ratio, 0), 1) * 100)
  }, [heroAudioState?.duration, heroAudioState?.progress])

  const heroAudioProgressLabel = useMemo(() => {
    if (!heroAudioState) {
      return '0:00'
    }
    const formatted = formatDurationLabel(heroAudioState.progress)
    return formatted ?? '0:00'
  }, [heroAudioState?.progress])

  const heroAudioDurationDisplay = useMemo(() => {
    const formatted = heroAudioDurationLabel
      ?? (heroAudioState?.duration ? formatDurationLabel(heroAudioState.duration) : null)
    return formatted ?? null
  }, [heroAudioDurationLabel, heroAudioState?.duration])

  const handleToggleHeroAudioPlayback = useCallback(() => {
    if (!audioManager) return
    audioManager.toggle()
  }, [audioManager])

  const handleHeroAudioVolumeChange = useCallback(
    (event) => {
      if (!audioManager) return
      const raw = Number(event?.target?.value)
      if (!Number.isFinite(raw)) return
      const normalized = Math.min(Math.max(raw / 100, 0), 1)
      audioManager.setVolume(normalized)
      if (normalized > 0) {
        heroAudioVolumeMemoryRef.current = normalized
      }
    },
    [audioManager],
  )

  const handleToggleHeroAudioMute = useCallback(() => {
    if (!audioManager) return
    const snapshot = audioManager.getState()
    if (!snapshot) return
    if (snapshot.volume <= 0.001) {
      const restore = heroAudioVolumeMemoryRef.current
      const fallback = Number.isFinite(restore) && restore > 0 ? restore : 0.72
      audioManager.setVolume(fallback)
      heroAudioVolumeMemoryRef.current = fallback
      return
    }
    if (snapshot.volume > 0) {
      heroAudioVolumeMemoryRef.current = snapshot.volume
    }
    audioManager.setVolume(0)
  }, [audioManager])

  const handleSelectHeroAudioTrack = useCallback(
    (trackId) => {
      if (!heroAudioProfile) return
      const nextTrack = heroAudioTracks.find((track) => track.id === trackId) || null
      if (!nextTrack) return
      heroAudioPreferenceDirtyRef.current = true
      setSelectedHeroAudioTrackId(nextTrack.id)
      if (!heroAudioManualOverride && nextTrack.presetId) {
        const matchingPreset = heroAudioPresets.find((preset) => preset.id === nextTrack.presetId) || null
        if (matchingPreset) {
          setSelectedHeroAudioPresetId(matchingPreset.id)
        }
      }
    },
    [heroAudioManualOverride, heroAudioPresets, heroAudioProfile, heroAudioTracks],
  )

  const handleSelectHeroAudioPreset = useCallback(
    (presetId) => {
      if (!heroAudioProfile) return
      if (!presetId) {
        heroAudioPreferenceDirtyRef.current = true
        setHeroAudioManualOverride(false)
        setSelectedHeroAudioPresetId(null)
        return
      }
      if (!heroAudioPresets.some((preset) => preset.id === presetId)) {
        return
      }
      heroAudioPreferenceDirtyRef.current = true
      setHeroAudioManualOverride(false)
      setSelectedHeroAudioPresetId(presetId)
    },
    [heroAudioPresets, heroAudioProfile],
  )

  const handleResetHeroAudioPreset = useCallback(() => {
    if (!heroAudioProfile) {
      setSelectedHeroAudioPresetId(null)
      setHeroAudioManualOverride(false)
      return
    }
    heroAudioPreferenceDirtyRef.current = true
    setHeroAudioManualOverride(false)
    if (heroAudioProfile.defaultPresetId && heroAudioPresets.some((preset) => preset.id === heroAudioProfile.defaultPresetId)) {
      setSelectedHeroAudioPresetId(heroAudioProfile.defaultPresetId)
      return
    }
    if (heroAudioPresets.length) {
      setSelectedHeroAudioPresetId(heroAudioPresets[0].id)
      return
    }
    setSelectedHeroAudioPresetId(null)
  }, [heroAudioPresets, heroAudioProfile])

  const handleToggleHeroEq = useCallback(() => {
    if (!audioManager) return
    setHeroAudioManualOverride(true)
    setSelectedHeroAudioPresetId(null)
    heroAudioPreferenceDirtyRef.current = true
    const nextEnabled = !(heroAudioState?.eqEnabled ?? false)
    audioManager.setEqEnabled(nextEnabled)
  }, [audioManager, heroAudioState?.eqEnabled])

  const handleToggleHeroReverb = useCallback(() => {
    if (!audioManager) return
    setHeroAudioManualOverride(true)
    setSelectedHeroAudioPresetId(null)
    heroAudioPreferenceDirtyRef.current = true
    const nextEnabled = !(heroAudioState?.reverbEnabled ?? false)
    audioManager.setReverbEnabled(nextEnabled)
  }, [audioManager, heroAudioState?.reverbEnabled])

  const handleToggleHeroCompressor = useCallback(() => {
    if (!audioManager) return
    setHeroAudioManualOverride(true)
    setSelectedHeroAudioPresetId(null)
    heroAudioPreferenceDirtyRef.current = true
    const nextEnabled = !(heroAudioState?.compressorEnabled ?? false)
    audioManager.setCompressorEnabled(nextEnabled)
  }, [audioManager, heroAudioState?.compressorEnabled])

  useEffect(() => {
    if (!audioManager) {
      return
    }

    const nextUrl = heroAudioActiveTrack?.url || null
    const nextHeroId = heroAudioProfile?.heroId || null

    if (!nextUrl) {
      currentAudioTrackRef.current = { url: null, heroId: null, trackId: null }
      audioManager.setEqEnabled(false)
      audioManager.setReverbEnabled(false)
      audioManager.setCompressorEnabled(false)
      audioManager.setEnabled(false, { resume: false })
      audioManager.stop()
      return
    }

    const current = currentAudioTrackRef.current
    const shouldReload =
      current.url !== nextUrl || current.heroId !== nextHeroId || current.trackId !== (heroAudioActiveTrack?.id || null)

    if (shouldReload) {
      currentAudioTrackRef.current = {
        url: nextUrl,
        heroId: nextHeroId,
        trackId: heroAudioActiveTrack?.id || null,
      }
      const baselineVolume = audioBaselineRef.current?.volume
      if (Number.isFinite(baselineVolume)) {
        audioManager.setVolume(baselineVolume)
      }
      audioManager.setLoop(true)

      const eqPreset = heroAudioProfile?.eq || DEFAULT_EQ_SETTINGS
      audioManager.setEqEnabled(Boolean(eqPreset.enabled))
      audioManager.setEqualizer({
        low: Number.isFinite(eqPreset.low) ? eqPreset.low : 0,
        mid: Number.isFinite(eqPreset.mid) ? eqPreset.mid : 0,
        high: Number.isFinite(eqPreset.high) ? eqPreset.high : 0,
      })

      const reverbPreset = heroAudioProfile?.reverb || DEFAULT_REVERB_SETTINGS
      audioManager.setReverbEnabled(Boolean(reverbPreset.enabled))
      audioManager.setReverbDetail({
        mix: Number.isFinite(reverbPreset.mix) ? reverbPreset.mix : DEFAULT_REVERB_SETTINGS.mix,
        decay: Number.isFinite(reverbPreset.decay) ? reverbPreset.decay : DEFAULT_REVERB_SETTINGS.decay,
      })

      const compressorPreset = heroAudioProfile?.compressor || DEFAULT_COMPRESSOR_SETTINGS
      audioManager.setCompressorEnabled(Boolean(compressorPreset.enabled))
      audioManager.setCompressorDetail({
        threshold: Number.isFinite(compressorPreset.threshold)
          ? compressorPreset.threshold
          : DEFAULT_COMPRESSOR_SETTINGS.threshold,
        ratio: Number.isFinite(compressorPreset.ratio)
          ? compressorPreset.ratio
          : DEFAULT_COMPRESSOR_SETTINGS.ratio,
        release: Number.isFinite(compressorPreset.release)
          ? compressorPreset.release
          : DEFAULT_COMPRESSOR_SETTINGS.release,
      })

      audioManager.setEnabled(true, { resume: false })
      audioManager
        .loadHeroTrack({
          heroId: nextHeroId,
          heroName: heroAudioProfile?.heroName || '',
          trackUrl: nextUrl,
          duration: heroAudioActiveTrack?.duration || heroAudioProfile?.bgmDuration || 0,
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
  }, [audioManager, heroAudioActiveTrack, heroAudioProfile])

  useEffect(() => {
    if (!audioManager || !heroAudioProfile || heroAudioManualOverride) {
      return
    }

    const preset = selectedHeroAudioPresetId
      ? heroAudioProfile.presets?.find((entry) => entry.id === selectedHeroAudioPresetId) || null
      : null

    const eqPreset = preset?.eq || heroAudioProfile.eq || DEFAULT_EQ_SETTINGS
    audioManager.setEqEnabled(Boolean(eqPreset.enabled))
    audioManager.setEqualizer({
      low: Number.isFinite(eqPreset.low) ? eqPreset.low : 0,
      mid: Number.isFinite(eqPreset.mid) ? eqPreset.mid : 0,
      high: Number.isFinite(eqPreset.high) ? eqPreset.high : 0,
    })

    const reverbPreset = preset?.reverb || heroAudioProfile.reverb || DEFAULT_REVERB_SETTINGS
    audioManager.setReverbEnabled(Boolean(reverbPreset.enabled))
    audioManager.setReverbDetail({
      mix: Number.isFinite(reverbPreset.mix) ? reverbPreset.mix : DEFAULT_REVERB_SETTINGS.mix,
      decay: Number.isFinite(reverbPreset.decay) ? reverbPreset.decay : DEFAULT_REVERB_SETTINGS.decay,
    })

    const compressorPreset = preset?.compressor || heroAudioProfile.compressor || DEFAULT_COMPRESSOR_SETTINGS
    audioManager.setCompressorEnabled(Boolean(compressorPreset.enabled))
    audioManager.setCompressorDetail({
      threshold: Number.isFinite(compressorPreset.threshold)
        ? compressorPreset.threshold
        : DEFAULT_COMPRESSOR_SETTINGS.threshold,
      ratio: Number.isFinite(compressorPreset.ratio)
        ? compressorPreset.ratio
        : DEFAULT_COMPRESSOR_SETTINGS.ratio,
      release: Number.isFinite(compressorPreset.release)
        ? compressorPreset.release
        : DEFAULT_COMPRESSOR_SETTINGS.release,
    })
  }, [
    audioManager,
    heroAudioManualOverride,
    heroAudioProfile,
    selectedHeroAudioPresetId,
  ])

  useEffect(() => {
    if (!audioManager || !heroAudioProfile) {
      return
    }
    if (heroAudioProfile.source === 'ranking') {
      return
    }
    if (heroAudioManualOverride) {
      return
    }
    if (baselineEffectAppliedRef.current) {
      return
    }

    const baseline = audioBaselineRef.current
    if (!baseline) {
      return
    }

    const heroId = heroAudioProfile.heroId || null
    const heroName = typeof heroAudioProfile.heroName === 'string'
      ? heroAudioProfile.heroName.trim().toLowerCase()
      : ''
    const trackUrl = heroAudioProfile.bgmUrl || null

    const baselineHeroId = baseline.heroId || null
    const baselineHeroName = typeof baseline.heroName === 'string'
      ? baseline.heroName.trim().toLowerCase()
      : ''
    const baselineTrackUrl = baseline.trackUrl || null

    const matchesHero =
      (heroId && baselineHeroId && heroId === baselineHeroId) ||
      (trackUrl && baselineTrackUrl && trackUrl === baselineTrackUrl) ||
      (heroName && baselineHeroName && heroName === baselineHeroName)

    if (!matchesHero) {
      return
    }

    const baselineEffects = audioBaselineEffectsRef.current || extractHeroAudioEffectSnapshot(baseline)
    if (!baselineEffects) {
      return
    }

    const preferenceLoadedForProfile = audioPreferenceLoadedKey === heroAudioProfileKey
    const hasPersistedPayload = Boolean(lastPersistedPayloadRef.current)
    if (preferenceLoadedForProfile && hasPersistedPayload) {
      baselineEffectAppliedRef.current = true
      return
    }

    const profileEq = heroAudioProfile.eq || DEFAULT_EQ_SETTINGS
    const profileReverb = heroAudioProfile.reverb || DEFAULT_REVERB_SETTINGS
    const profileCompressor = heroAudioProfile.compressor || DEFAULT_COMPRESSOR_SETTINGS

    const eqMatches = eqSettingsAreEqual(baselineEffects.eq, profileEq)
    const reverbMatches = reverbSettingsAreEqual(baselineEffects.reverb, profileReverb)
    const compressorMatches = compressorSettingsAreEqual(
      baselineEffects.compressor,
      profileCompressor,
    )

    if (eqMatches && reverbMatches && compressorMatches) {
      baselineEffectAppliedRef.current = true
      return
    }

    baselineEffectAppliedRef.current = true
    heroAudioPreferenceDirtyRef.current = true
    setHeroAudioManualOverride(true)
    setSelectedHeroAudioPresetId(null)

    audioManager.setEqEnabled(Boolean(baselineEffects.eq.enabled))
    audioManager.setEqualizer({
      low: baselineEffects.eq.low,
      mid: baselineEffects.eq.mid,
      high: baselineEffects.eq.high,
    })

    audioManager.setReverbEnabled(Boolean(baselineEffects.reverb.enabled))
    audioManager.setReverbDetail({
      mix: baselineEffects.reverb.mix,
      decay: baselineEffects.reverb.decay,
    })

    audioManager.setCompressorEnabled(Boolean(baselineEffects.compressor.enabled))
    audioManager.setCompressorDetail({
      threshold: baselineEffects.compressor.threshold,
      ratio: baselineEffects.compressor.ratio,
      release: baselineEffects.compressor.release,
    })
  }, [audioManager, audioPreferenceLoadedKey, heroAudioManualOverride, heroAudioProfile, heroAudioProfileKey])

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

  const displayedHeroLogs = useMemo(
    () => heroBattleLogs.slice(0, visibleHeroLogs),
    [heroBattleLogs, visibleHeroLogs]
  )

  const heroLogsExhausted = heroBattleLogs.length <= visibleHeroLogs

  useEffect(() => {
    setVisibleHeroLogs(10)
  }, [myEntry?.hero_id, myHero?.id, recentBattles])

  const overallRanking = useMemo(() => {
    return [...participants].sort(compareParticipantsByScore)
  }, [participants])

  const roleRankings = useMemo(() => {
    const grouped = groupByRole(participants)
    return Array.from(grouped.entries()).map(([role, members]) => ({
      role,
      members: [...members].sort(compareParticipantsByScore),
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

  const handleDeleteClick = useCallback(() => {
    if (!onDelete || deleting) return
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('정말로 방을 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없습니다.')
      if (!confirmed) {
        return
      }
    }
    onDelete()
  }, [deleting, onDelete])

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
            {participantsByRole.map(
              ({ name, count, minimumRequired, overflowCount, neededForStart }) => {
                const isPicked = currentRole === name
                const isMine = myEntry?.role === name
                const highlight = isPicked || isMine
                const minimumValue =
                  Number.isFinite(Number(minimumRequired)) && Number(minimumRequired) >= 0
                    ? Number(minimumRequired)
                    : null
                const overflowValue =
                  Number.isFinite(Number(overflowCount)) && Number(overflowCount) > 0
                    ? Number(overflowCount)
                    : 0
                const shortfallValue =
                  Number.isFinite(Number(neededForStart)) && Number(neededForStart) >= 0
                    ? Number(neededForStart)
                    : null
                const label =
                  minimumValue != null
                    ? `${count}명 참여 · 최소 ${minimumValue}명 필요`
                    : `${count}명 참여 중`
                const statusParts = []
                if (minimumValue != null) {
                  statusParts.push(shortfallValue && shortfallValue > 0 ? `시작까지 ${shortfallValue}명 필요` : '기본 슬롯 충족')
                }
                if (overflowValue > 0) {
                  statusParts.push(`추가 참가자 ${overflowValue}명`)
                }
                const statusText = statusParts.length > 0 ? statusParts.join(' · ') : '참여자 모집 중'
                const classes = [styles.roleChip]
                if (highlight) classes.push(styles.roleChipActive)
                if (!isMine && minimumValue != null && shortfallValue === 0) {
                  classes.push(styles.roleChipReady)
                }
                if (alreadyJoined && !isMine) classes.push(styles.roleChipDisabled)
                const disabled = alreadyJoined && !isMine
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
                    <span className={styles.roleAvailability}>{statusText}</span>
                  </button>
                )
              },
            )}
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

        {isOwner && (
          <div className={styles.ownerActions}>
            <button type="button" className={styles.subtleButton} onClick={handleDeleteClick} disabled={deleting}>
              {deleting ? '방 삭제 중…' : '방 삭제하기'}
            </button>
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
