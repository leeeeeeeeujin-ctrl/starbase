import { useCallback, useEffect, useMemo, useState } from 'react'

import styles from '../../styles/AdminPortal.module.css'

const REFRESH_INTERVAL_MS = 120_000
const FILTER_DEBOUNCE_MS = 320
const API_LIMIT = 300

const HERO_STACK_COLORS = [
  'rgba(129, 140, 248, 0.82)',
  'rgba(14, 165, 233, 0.82)',
  'rgba(236, 72, 153, 0.82)',
  'rgba(139, 92, 246, 0.82)',
  'rgba(34, 197, 94, 0.82)',
  'rgba(251, 191, 36, 0.82)',
]
const OWNER_STACK_COLORS = [
  'rgba(94, 234, 212, 0.8)',
  'rgba(125, 211, 252, 0.8)',
  'rgba(251, 191, 36, 0.82)',
  'rgba(244, 114, 182, 0.82)',
  'rgba(248, 113, 113, 0.82)',
  'rgba(165, 180, 252, 0.82)',
]

const DEFAULT_STACK_SEGMENTS = 6
const TREND_STACK_LIMIT_OPTIONS = [
  { id: 'top3', label: '상위 3', segments: 3 },
  { id: 'top5', label: '상위 5', segments: 5 },
  { id: 'all', label: '전체 보기', segments: null },
]

const RANGE_OPTIONS = [
  {
    id: '24h',
    label: '최근 24시간',
    resolve: () => new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  {
    id: '7d',
    label: '최근 7일',
    resolve: () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: '30d',
    label: '최근 30일',
    resolve: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'all',
    label: '전체',
    resolve: () => null,
  },
]

const DEFAULT_FAVORITE_FORM = {
  label: '',
  notes: '',
  sortOrder: '0',
}

const DEFAULT_SUBSCRIPTION_FORM = {
  label: '',
  notes: '',
  channel: '',
  mention: '',
  webhookKey: '',
  minEvents: '1',
  lookbackWeeks: '4',
  alwaysInclude: false,
  notifyOnAnomaly: true,
  sortOrder: '0',
}

function summariseFilters(filters = {}) {
  const parts = []
  if (filters.range) parts.push(filters.range)
  if (filters.ownerId) parts.push(`owner ${filters.ownerId}`)
  if (filters.profileKey) parts.push(`profile ${filters.profileKey}`)
  if (filters.heroId) parts.push(`hero ${filters.heroId}`)
  if (filters.eventTypes && filters.eventTypes.length) {
    parts.push(`type ${filters.eventTypes.join(', ')}`)
  }
  if (filters.search) parts.push(`검색 "${filters.search}"`)
  return parts.length ? parts.join(' · ') : '기본 필터'
}

function summariseSlack(slack = {}) {
  const parts = []
  if (slack.channel) parts.push(slack.channel)
  if (slack.mention) parts.push(slack.mention)
  parts.push(`임계치 ${slack.minEvents || 1}건 / ${slack.lookbackWeeks || 4}주`)
  if (slack.alwaysInclude) parts.push('항상 포함')
  if (slack.notifyOnAnomaly === false) parts.push('급증/급락 제외')
  return parts.join(' · ')
}

function formatDateTime(iso) {
  if (!iso) return '시간 정보 없음'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDurationFromNow(iso) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const diff = Date.now() - date.getTime()
  if (diff < 0) {
    return '방금 저장됨'
  }
  const minutes = Math.floor(diff / (60 * 1000))
  if (minutes < 1) return '방금 저장됨'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

function formatRuleUpdatedAt(iso) {
  if (!iso) return null
  return formatDurationFromNow(iso) || formatDateTime(iso)
}

function startOfWeek(date) {
  const result = new Date(date.getTime())
  const day = result.getUTCDay()
  const diff = (day + 6) % 7
  result.setUTCDate(result.getUTCDate() - diff)
  result.setUTCHours(0, 0, 0, 0)
  return result
}

function normaliseWeeklyBuckets(buckets = [], { weeks = 12, now = new Date() } = {}) {
  const totalWeeks = Number.isFinite(weeks) && weeks > 0 ? Math.min(Math.floor(weeks), 52) : 12
  const anchor = startOfWeek(now instanceof Date ? now : new Date())
  const map = new Map()

  if (Array.isArray(buckets)) {
    for (const bucket of buckets) {
      if (!bucket || !bucket.weekStart) continue
      const parsed = new Date(bucket.weekStart)
      if (Number.isNaN(parsed.getTime())) continue
      const key = startOfWeek(parsed).toISOString()
      map.set(key, {
        eventCount: Number.isFinite(bucket.eventCount) ? bucket.eventCount : Number(bucket.eventCount) || 0,
        uniqueOwners: Number.isFinite(bucket.uniqueOwners) ? bucket.uniqueOwners : Number(bucket.uniqueOwners) || 0,
        uniqueProfiles: Number.isFinite(bucket.uniqueProfiles)
          ? bucket.uniqueProfiles
          : Number(bucket.uniqueProfiles) || 0,
      })
    }
  }

  const result = []
  for (let index = totalWeeks - 1; index >= 0; index -= 1) {
    const weekDate = new Date(anchor.getTime() - index * 7 * 24 * 60 * 60 * 1000)
    const key = weekDate.toISOString()
    const entry = map.get(key) || { eventCount: 0, uniqueOwners: 0, uniqueProfiles: 0 }
    result.push({ weekStart: key, ...entry })
  }

  return result
}

function normaliseBreakdown(entries = [], { fallbackLabel = '미지정' } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return []
  }

  const results = []

  for (const entry of entries) {
    if (!entry) continue
    const weekValue = entry.weekStart || entry.week_start
    if (!weekValue) continue
    const parsed = new Date(weekValue)
    if (Number.isNaN(parsed.getTime())) continue
    const weekStart = startOfWeek(parsed).toISOString()
    const dimensionId = entry.dimensionId || entry.dimension_id || 'unknown'
    const label = entry.dimensionLabel || entry.dimension_label || fallbackLabel
    const count = Number.isFinite(entry.eventCount)
      ? entry.eventCount
      : Number.isFinite(entry.event_count)
      ? entry.event_count
      : Number(entry.event_count || entry.eventCount) || 0

    results.push({
      weekStart,
      dimensionId,
      dimensionLabel: label,
      eventCount: count,
    })
  }

  return results
}

function formatWeekLabel(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function formatWeekRangeTooltip(iso) {
  if (!iso) return '주간 데이터 없음'
  const start = new Date(iso)
  if (Number.isNaN(start.getTime())) return '주간 데이터 없음'
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  const startLabel = start.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
  const endLabel = end.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
  return `${startLabel} ~ ${endLabel}`
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      return '0'
    }
    return new Intl.NumberFormat('ko-KR').format(parsed)
  }
  return new Intl.NumberFormat('ko-KR').format(value)
}

function buildStackedTrend(
  buckets = [],
  breakdownEntries = [],
  { palette = [], fallbackLabel = '미지정', maxValue = 0, maxSegments = DEFAULT_STACK_SEGMENTS } = {},
) {
  if (!Array.isArray(buckets) || buckets.length === 0) {
    return null
  }
  if (!Array.isArray(breakdownEntries) || breakdownEntries.length === 0) {
    return null
  }

  const totalsByDimension = new Map()
  const labelsByDimension = new Map()
  const weeks = new Map()

  for (const entry of breakdownEntries) {
    const count = Number(entry.eventCount)
    if (!Number.isFinite(count) || count <= 0) {
      continue
    }
    const weekKey = entry.weekStart
    const dimensionId = entry.dimensionId || 'unknown'
    totalsByDimension.set(dimensionId, (totalsByDimension.get(dimensionId) || 0) + count)
    labelsByDimension.set(dimensionId, entry.dimensionLabel || fallbackLabel)

    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, new Map())
    }
    const weekMap = weeks.get(weekKey)
    weekMap.set(dimensionId, (weekMap.get(dimensionId) || 0) + count)
  }

  if (!totalsByDimension.size) {
    return null
  }

  let dimensionEntries = Array.from(totalsByDimension.entries()).sort((a, b) => b[1] - a[1])
  let aggregatedOthers = null

  if (Number.isFinite(maxSegments) && maxSegments > 0 && dimensionEntries.length > maxSegments) {
    const keep = dimensionEntries.slice(0, maxSegments - 1)
    const rest = dimensionEntries.slice(maxSegments - 1)
    const restTotal = rest.reduce((sum, [, value]) => sum + value, 0)
    const restIds = rest.map(([id]) => id)
    dimensionEntries = keep
    if (restTotal > 0) {
      aggregatedOthers = { id: '__others__', total: restTotal, ids: restIds }
    }
  }

  const legend = dimensionEntries.map(([dimensionId, total], index) => ({
    id: dimensionId,
    label: labelsByDimension.get(dimensionId) || fallbackLabel,
    total,
    color: palette[index % palette.length] || palette[palette.length - 1] || 'rgba(148, 163, 184, 0.8)',
    sourceIds: [dimensionId],
    sourceCount: 1,
  }))

  if (aggregatedOthers) {
    legend.push({
      id: aggregatedOthers.id,
      label: '기타',
      total: aggregatedOthers.total,
      color: palette[legend.length % palette.length] || 'rgba(148, 163, 184, 0.75)',
      sourceIds: aggregatedOthers.ids,
      sourceCount: aggregatedOthers.ids.length,
    })
  }

  const bars = buckets.map((bucket) => {
    const total = bucket.eventCount || 0
    const ratio = maxValue > 0 ? Math.round((total / maxValue) * 100) : 0
    const height = total > 0 ? Math.max(ratio, 6) : 0
    const weekKey = bucket.weekStart
    const weekMap = weeks.get(weekKey) || new Map()

    const segments = legend.map((entry) => {
      const value = entry.sourceIds.reduce((sum, sourceId) => sum + (weekMap.get(sourceId) || 0), 0)
      const percentage = total > 0 ? (value / total) * 100 : 0
      return {
        id: entry.id,
        label: entry.label,
        count: value,
        color: entry.color,
        percentage,
        height: percentage,
        displayValue: percentage >= 15 && value > 0,
      }
    })

    const tooltipLines = segments
      .filter((segment) => segment.count > 0)
      .map((segment) => `${segment.label}: ${formatNumber(segment.count)}건 (${Math.round(segment.percentage)}%)`)
      .join('\n')
    const tooltipBase = `${formatWeekRangeTooltip(bucket.weekStart)} · 총 ${formatNumber(total)}건`
    const tooltip = tooltipLines ? `${tooltipBase}\n${tooltipLines}` : tooltipBase

    return {
      weekStart: bucket.weekStart,
      label: formatWeekLabel(bucket.weekStart),
      total,
      height,
      tooltip,
      segments,
    }
  })

  return { legend, bars }
}

function summariseTrend(buckets = []) {
  if (!Array.isArray(buckets) || buckets.length === 0) {
    return null
  }

  const current = buckets[buckets.length - 1]
  const previous = buckets[buckets.length - 2] || { eventCount: 0, uniqueOwners: 0, uniqueProfiles: 0 }
  const deltaCount = (current.eventCount || 0) - (previous.eventCount || 0)
  const deltaPercent = previous.eventCount > 0
    ? ((current.eventCount - previous.eventCount) / previous.eventCount) * 100
    : current.eventCount > 0
    ? 100
    : 0

  let direction = 'flat'
  if (deltaCount > 0) direction = 'up'
  if (deltaCount < 0) direction = 'down'

  return {
    current,
    previous,
    deltaCount,
    deltaPercent,
    direction,
  }
}

function formatTrendDelta(summary) {
  if (!summary) return '—'
  if (summary.previous.eventCount === 0 && summary.current.eventCount > 0) {
    return `신규 +${summary.current.eventCount}건`
  }
  if (summary.deltaCount === 0) {
    return '변화 없음'
  }
  const symbol = summary.deltaCount > 0 ? '+' : '−'
  const percent = Number.isFinite(summary.deltaPercent) ? Math.abs(summary.deltaPercent).toFixed(1) : '0.0'
  return `${symbol}${Math.abs(summary.deltaCount)}건 (${percent}%)`
}

function buildQueryString({ ownerId, profileKey, heroId, since, search, eventTypes }) {
  const params = new URLSearchParams()
  params.set('limit', String(API_LIMIT))
  if (ownerId) params.set('ownerId', ownerId)
  if (profileKey) params.set('profileKey', profileKey)
  if (heroId) params.set('heroId', heroId)
  if (since) params.set('since', since)
  if (search) params.set('search', search)
  if (eventTypes.length) params.set('eventType', eventTypes.join(','))
  return params.toString()
}

export default function AudioEventMonitor() {
  const [range, setRange] = useState('24h')
  const [ownerId, setOwnerId] = useState('')
  const [profileKey, setProfileKey] = useState('')
  const [heroId, setHeroId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEventTypes, setSelectedEventTypes] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)

  const [data, setData] = useState({
    items: [],
    stats: { total: 0, uniqueOwners: 0, uniqueProfiles: 0, byEventType: {} },
    availableEventTypes: [],
  })
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const [trendData, setTrendData] = useState({
    buckets: [],
    range: { since: null, until: null, lookbackWeeks: 0 },
    breakdown: { hero: [], owner: [] },
  })
  const [trendLoading, setTrendLoading] = useState(true)
  const [trendError, setTrendError] = useState(null)
  const [trendUpdatedAt, setTrendUpdatedAt] = useState(null)
  const [trendStackMode, setTrendStackMode] = useState('total')
  const [trendStackLimit, setTrendStackLimit] = useState('top5')

  const [favorites, setFavorites] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [rulesLoading, setRulesLoading] = useState(true)
  const [rulesError, setRulesError] = useState(null)
  const [rulesFeedback, setRulesFeedback] = useState(null)
  const [favoriteForm, setFavoriteForm] = useState({ ...DEFAULT_FAVORITE_FORM })
  const [subscriptionForm, setSubscriptionForm] = useState({ ...DEFAULT_SUBSCRIPTION_FORM })
  const [editingFavoriteId, setEditingFavoriteId] = useState(null)
  const [editingSubscriptionId, setEditingSubscriptionId] = useState(null)
  const [savingFavorite, setSavingFavorite] = useState(false)
  const [savingSubscription, setSavingSubscription] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchInput.trim())
    }, FILTER_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [searchInput])

  const loadRules = useCallback(async () => {
    setRulesLoading(true)
    try {
      const response = await fetch('/api/admin/audio-monitor-rules')
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || '즐겨찾기와 구독 조건을 불러오지 못했습니다.')
      }
      const payload = await response.json()
      setFavorites(Array.isArray(payload.favorites) ? payload.favorites : [])
      setSubscriptions(Array.isArray(payload.subscriptions) ? payload.subscriptions : [])
      setRulesError(null)
    } catch (err) {
      setRulesError(err.message || '즐겨찾기와 구독 조건을 불러오지 못했습니다.')
    } finally {
      setRulesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  useEffect(() => {
    if (!rulesFeedback) return () => {}
    const timer = window.setTimeout(() => setRulesFeedback(null), 3200)
    return () => {
      window.clearTimeout(timer)
    }
  }, [rulesFeedback])

  const since = useMemo(() => {
    const option = RANGE_OPTIONS.find((item) => item.id === range)
    if (!option) return null
    const resolved = option.resolve()
    if (!resolved) return null
    return resolved.toISOString()
  }, [range])

  const queryString = useMemo(
    () =>
      buildQueryString({
        ownerId: ownerId.trim(),
        profileKey: profileKey.trim(),
        heroId: heroId.trim(),
        since,
        search: searchTerm,
        eventTypes: selectedEventTypes,
      }),
    [ownerId, profileKey, heroId, since, searchTerm, selectedEventTypes],
  )

  const trendQueryString = useMemo(() => {
    const base = queryString ? `${queryString}&trend=weekly` : 'trend=weekly'
    return base
  }, [queryString])

  const loadEvents = useCallback(
    async (withSpinner = false) => {
      if (withSpinner) {
        setLoading(true)
      }
      try {
        const endpoint = queryString
          ? `/api/admin/audio-events?${queryString}`
          : '/api/admin/audio-events'
        const response = await fetch(endpoint)
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || '오디오 이벤트 로그를 불러오지 못했습니다.')
        }
        const payload = await response.json()
        setData({
          items: Array.isArray(payload.items) ? payload.items : [],
          stats: payload.stats || { total: 0, uniqueOwners: 0, uniqueProfiles: 0, byEventType: {} },
          availableEventTypes: Array.isArray(payload.availableEventTypes)
            ? payload.availableEventTypes
            : [],
        })
        if (Array.isArray(payload.availableEventTypes)) {
          setSelectedEventTypes((previous) => {
            const next = previous.filter((type) => payload.availableEventTypes.includes(type))
            if (next.length === previous.length) {
              return previous
            }
            return next
          })
        }
        setError(null)
        setLastUpdatedAt(new Date().toISOString())
      } catch (err) {
        setError(err.message || '오디오 이벤트 로그를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    },
    [queryString],
  )

  const loadTrend = useCallback(
    async (withSpinner = false) => {
      if (withSpinner) {
        setTrendLoading(true)
      }
      try {
        const endpoint = trendQueryString
          ? `/api/admin/audio-events?${trendQueryString}`
          : '/api/admin/audio-events?trend=weekly'
        const response = await fetch(endpoint)
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || '주간 추이를 불러오지 못했습니다.')
        }
        const payload = await response.json()
        setTrendData({
          buckets: Array.isArray(payload.buckets) ? payload.buckets : [],
          range: payload.range || { since: null, until: null, lookbackWeeks: 0 },
          breakdown: {
            hero: Array.isArray(payload.breakdown?.hero) ? payload.breakdown.hero : [],
            owner: Array.isArray(payload.breakdown?.owner) ? payload.breakdown.owner : [],
          },
        })
        setTrendError(null)
        setTrendUpdatedAt(new Date().toISOString())
      } catch (err) {
        setTrendError(err.message || '주간 추이를 불러오지 못했습니다.')
      } finally {
        setTrendLoading(false)
      }
    },
    [trendQueryString],
  )

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadEvents(false)
      loadTrend(false)
    }, REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [loadEvents, loadTrend])

  useEffect(() => {
    loadEvents(true)
    loadTrend(true)
  }, [loadEvents, loadTrend])

  const toggleEventType = useCallback((eventType) => {
    setSelectedEventTypes((previous) => {
      if (previous.includes(eventType)) {
        return previous.filter((item) => item !== eventType)
      }
      return [...previous, eventType]
    })
  }, [])

  const resetFilters = useCallback(() => {
    setOwnerId('')
    setProfileKey('')
    setHeroId('')
    setSearchInput('')
    setSearchTerm('')
    setSelectedEventTypes([])
    setRange('24h')
  }, [])

  const applyFiltersFromRule = useCallback((rule) => {
    const filters = rule?.filters || {}
    const eventTypes = Array.isArray(filters.eventTypes)
      ? filters.eventTypes.filter((item, index, array) => typeof item === 'string' && array.indexOf(item) === index)
      : []

    const searchValue = filters.search || ''

    setRange(filters.range || '24h')
    setOwnerId(filters.ownerId || '')
    setProfileKey(filters.profileKey || '')
    setHeroId(filters.heroId || '')
    setSearchInput(searchValue)
    setSearchTerm(searchValue)
    setSelectedEventTypes(eventTypes)
  }, [])

  const resetFavoriteForm = useCallback(() => {
    setFavoriteForm({ ...DEFAULT_FAVORITE_FORM })
    setEditingFavoriteId(null)
  }, [])

  const resetSubscriptionForm = useCallback(() => {
    setSubscriptionForm({ ...DEFAULT_SUBSCRIPTION_FORM })
    setEditingSubscriptionId(null)
  }, [])

  const applyFavoriteRule = useCallback(
    (favorite) => {
      if (!favorite) return
      applyFiltersFromRule(favorite)
      const trend = favorite.trend || {}
      setTrendStackMode(trend.stackMode || 'total')
      setTrendStackLimit(trend.stackLimit || 'top5')
      setRulesError(null)
      setRulesFeedback('즐겨찾기 필터를 적용했습니다.')
    },
    [applyFiltersFromRule],
  )

  const applySubscriptionRule = useCallback(
    (subscription) => {
      if (!subscription) return
      applyFiltersFromRule(subscription)
      const trend = subscription.trend || {}
      setTrendStackMode(trend.stackMode || 'total')
      setTrendStackLimit(trend.stackLimit || 'top5')
      setRulesError(null)
      setRulesFeedback('구독 조건 필터를 적용했습니다.')
    },
    [applyFiltersFromRule],
  )

  const startEditFavorite = useCallback((favorite) => {
    if (!favorite) {
      resetFavoriteForm()
      return
    }
    setEditingFavoriteId(favorite.id)
    setFavoriteForm({
      label: favorite.label || '',
      notes: favorite.notes || '',
      sortOrder: String(Number.isFinite(favorite.sortOrder) ? favorite.sortOrder : 0),
    })
    setRulesError(null)
  }, [resetFavoriteForm])

  const startEditSubscription = useCallback((subscription) => {
    if (!subscription) {
      resetSubscriptionForm()
      return
    }
    const slack = subscription.slack || {}
    setEditingSubscriptionId(subscription.id)
    setSubscriptionForm({
      label: subscription.label || '',
      notes: subscription.notes || '',
      channel: slack.channel || '',
      mention: slack.mention || '',
      webhookKey: slack.webhookKey || '',
      minEvents: String(Number.isFinite(slack.minEvents) ? slack.minEvents : 1),
      lookbackWeeks: String(Number.isFinite(slack.lookbackWeeks) ? slack.lookbackWeeks : 4),
      alwaysInclude: Boolean(slack.alwaysInclude),
      notifyOnAnomaly: slack.notifyOnAnomaly !== false,
      sortOrder: String(Number.isFinite(subscription.sortOrder) ? subscription.sortOrder : 0),
    })
    setRulesError(null)
  }, [resetSubscriptionForm])

  const handleSaveFavorite = useCallback(async () => {
    const label = favoriteForm.label.trim()
    if (!label) {
      setRulesError('즐겨찾기 이름을 입력해 주세요.')
      return
    }

    setSavingFavorite(true)
    try {
      setRulesError(null)
      const sortOrderValue = Number.parseInt(favoriteForm.sortOrder, 10)
      const payload = {
        type: 'favorite',
        label,
        notes: favoriteForm.notes.trim(),
        sortOrder: Number.isFinite(sortOrderValue) ? sortOrderValue : 0,
        filters: {
          range,
          ownerId: ownerId.trim(),
          profileKey: profileKey.trim(),
          heroId: heroId.trim(),
          search: searchInput.trim(),
          eventTypes: selectedEventTypes,
        },
        trend: { stackMode: trendStackMode, stackLimit: trendStackLimit },
      }

      if (editingFavoriteId) {
        payload.id = editingFavoriteId
      }

      const response = await fetch('/api/admin/audio-monitor-rules', {
        method: editingFavoriteId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || '즐겨찾기를 저장하지 못했습니다.')
      }

      await loadRules()
      resetFavoriteForm()
      setRulesFeedback(editingFavoriteId ? '즐겨찾기를 업데이트했습니다.' : '즐겨찾기를 저장했습니다.')
    } catch (err) {
      setRulesError(err.message || '즐겨찾기를 저장하지 못했습니다.')
    } finally {
      setSavingFavorite(false)
    }
  }, [favoriteForm, editingFavoriteId, range, ownerId, profileKey, heroId, searchInput, selectedEventTypes, trendStackMode, trendStackLimit, loadRules, resetFavoriteForm])

  const handleSaveSubscription = useCallback(async () => {
    const label = subscriptionForm.label.trim()
    if (!label) {
      setRulesError('Slack 구독 이름을 입력해 주세요.')
      return
    }

    const channel = subscriptionForm.channel.trim()
    const webhookKey = subscriptionForm.webhookKey.trim()
    if (!channel && !webhookKey) {
      setRulesError('Slack 채널 또는 Webhook 식별자를 입력해 주세요.')
      return
    }

    setSavingSubscription(true)
    try {
      setRulesError(null)
      const sortOrderValue = Number.parseInt(subscriptionForm.sortOrder, 10)
      const minEventsValue = Number.parseInt(subscriptionForm.minEvents, 10)
      const lookbackValue = Number.parseInt(subscriptionForm.lookbackWeeks, 10)
      const payload = {
        type: 'subscription',
        label,
        notes: subscriptionForm.notes.trim(),
        sortOrder: Number.isFinite(sortOrderValue) ? sortOrderValue : 0,
        filters: {
          range,
          ownerId: ownerId.trim(),
          profileKey: profileKey.trim(),
          heroId: heroId.trim(),
          search: searchInput.trim(),
          eventTypes: selectedEventTypes,
        },
        trend: { stackMode: trendStackMode, stackLimit: trendStackLimit },
        slack: {
          channel,
          mention: subscriptionForm.mention.trim(),
          webhookKey,
          minEvents: Number.isFinite(minEventsValue) && minEventsValue > 0 ? minEventsValue : 1,
          lookbackWeeks: Number.isFinite(lookbackValue) && lookbackValue > 0 ? lookbackValue : 4,
          alwaysInclude: Boolean(subscriptionForm.alwaysInclude),
          notifyOnAnomaly: subscriptionForm.notifyOnAnomaly,
        },
      }

      if (editingSubscriptionId) {
        payload.id = editingSubscriptionId
      }

      const response = await fetch('/api/admin/audio-monitor-rules', {
        method: editingSubscriptionId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || 'Slack 구독 조건을 저장하지 못했습니다.')
      }

      await loadRules()
      resetSubscriptionForm()
      setRulesFeedback(editingSubscriptionId ? '구독 조건을 업데이트했습니다.' : '구독 조건을 저장했습니다.')
    } catch (err) {
      setRulesError(err.message || 'Slack 구독 조건을 저장하지 못했습니다.')
    } finally {
      setSavingSubscription(false)
    }
  }, [subscriptionForm, editingSubscriptionId, range, ownerId, profileKey, heroId, searchInput, selectedEventTypes, trendStackMode, trendStackLimit, loadRules, resetSubscriptionForm])

  const handleDeleteRule = useCallback(
    async (id) => {
      if (!id) return
      setDeletingRuleId(id)
      try {
        setRulesError(null)
        const response = await fetch('/api/admin/audio-monitor-rules', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })

        if (!response.ok) {
          const result = await response.json().catch(() => ({}))
          throw new Error(result.error || '조건을 삭제하지 못했습니다.')
        }

        await loadRules()
        if (editingFavoriteId === id) {
          resetFavoriteForm()
        }
        if (editingSubscriptionId === id) {
          resetSubscriptionForm()
        }
        setRulesFeedback('저장된 조건을 삭제했습니다.')
      } catch (err) {
        setRulesError(err.message || '조건을 삭제하지 못했습니다.')
      } finally {
        setDeletingRuleId(null)
      }
    },
    [editingFavoriteId, editingSubscriptionId, loadRules, resetFavoriteForm, resetSubscriptionForm],
  )

  const handleFavoriteSubmit = useCallback(
    (event) => {
      event.preventDefault()
      handleSaveFavorite()
    },
    [handleSaveFavorite],
  )

  const handleSubscriptionSubmit = useCallback(
    (event) => {
      event.preventDefault()
      handleSaveSubscription()
    },
    [handleSaveSubscription],
  )

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const params = queryString ? `${queryString}&format=csv` : 'format=csv'
      const response = await fetch(`/api/admin/audio-events?${params}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'CSV 내보내기에 실패했습니다.')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const stamp = new Date().toISOString().slice(0, 10)
      link.download = `rank-audio-events-${stamp}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'CSV 내보내기에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }, [queryString])

  const summaryChips = useMemo(() => {
    const entries = Object.entries(data.stats.byEventType || {})
    if (!entries.length) {
      return ['이벤트 유형 데이터 없음']
    }
    return entries
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => `${key} ${formatNumber(count)}건`)
  }, [data.stats.byEventType])

  const normalizedTrendBuckets = useMemo(() => {
    const weeks = trendData?.range?.lookbackWeeks
    const untilIso = trendData?.range?.until
    const untilDate = untilIso ? new Date(untilIso) : new Date()
    const validUntil = Number.isNaN(untilDate.getTime()) ? new Date() : untilDate
    return normaliseWeeklyBuckets(trendData?.buckets || [], {
      weeks: weeks && weeks > 0 ? weeks : 12,
      now: validUntil,
    })
  }, [trendData])

  const trendSummary = useMemo(() => summariseTrend(normalizedTrendBuckets), [normalizedTrendBuckets])

  const trendMaxValue = useMemo(
    () => normalizedTrendBuckets.reduce((max, bucket) => Math.max(max, bucket.eventCount || 0), 0),
    [normalizedTrendBuckets],
  )

  const trendBreakdown = useMemo(
    () => ({
      hero: normaliseBreakdown(trendData?.breakdown?.hero || [], { fallbackLabel: '히어로 미지정' }),
      owner: normaliseBreakdown(trendData?.breakdown?.owner || [], { fallbackLabel: '운영자 미지정' }),
    }),
    [trendData],
  )

  const trendStackLimitOption = useMemo(
    () =>
      TREND_STACK_LIMIT_OPTIONS.find((option) => option.id === trendStackLimit)
        || TREND_STACK_LIMIT_OPTIONS[1],
    [trendStackLimit],
  )

  const trendStackMaxSegments = useMemo(() => {
    if (!trendStackLimitOption) return DEFAULT_STACK_SEGMENTS
    if (Number.isFinite(trendStackLimitOption.segments)) {
      return Math.max(1, trendStackLimitOption.segments)
    }
    return Number.POSITIVE_INFINITY
  }, [trendStackLimitOption])

  const trendStackData = useMemo(() => {
    if (trendStackMode === 'hero') {
      return buildStackedTrend(normalizedTrendBuckets, trendBreakdown.hero, {
        palette: HERO_STACK_COLORS,
        fallbackLabel: '히어로 미지정',
        maxValue: trendMaxValue,
        maxSegments: trendStackMaxSegments,
      })
    }
    if (trendStackMode === 'owner') {
      return buildStackedTrend(normalizedTrendBuckets, trendBreakdown.owner, {
        palette: OWNER_STACK_COLORS,
        fallbackLabel: '운영자 미지정',
        maxValue: trendMaxValue,
        maxSegments: trendStackMaxSegments,
      })
    }
    return null
  }, [normalizedTrendBuckets, trendBreakdown, trendStackMode, trendMaxValue, trendStackMaxSegments])

  const hasHeroBreakdown = trendBreakdown.hero.length > 0
  const hasOwnerBreakdown = trendBreakdown.owner.length > 0

  useEffect(() => {
    if (trendStackMode === 'hero' && !hasHeroBreakdown) {
      setTrendStackMode('total')
    } else if (trendStackMode === 'owner' && !hasOwnerBreakdown) {
      setTrendStackMode('total')
    }
  }, [trendStackMode, hasHeroBreakdown, hasOwnerBreakdown])

  const totalTrendBars = useMemo(
    () =>
      normalizedTrendBuckets.map((bucket) => {
        const ratio = trendMaxValue > 0 ? Math.round((bucket.eventCount / trendMaxValue) * 100) : 0
        const height = bucket.eventCount > 0 ? Math.max(ratio, 6) : 0
        return {
          weekStart: bucket.weekStart,
          eventCount: bucket.eventCount,
          uniqueOwners: bucket.uniqueOwners,
          height,
          label: formatWeekLabel(bucket.weekStart),
          tooltip: `${formatWeekRangeTooltip(bucket.weekStart)} · ${formatNumber(bucket.eventCount)}건`,
        }
      }),
    [normalizedTrendBuckets, trendMaxValue],
  )

  const trendDirectionClass = useMemo(() => {
    if (!trendSummary) return ''
    if (trendSummary.direction === 'up') return styles.audioEventsTrendDeltaUp
    if (trendSummary.direction === 'down') return styles.audioEventsTrendDeltaDown
    return styles.audioEventsTrendDeltaFlat
  }, [trendSummary])

  const usingStackedTrend = trendStackMode !== 'total' && trendStackData
  const trendChartBars = usingStackedTrend ? trendStackData?.bars || [] : totalTrendBars
  const trendStackLegend = usingStackedTrend ? trendStackData?.legend || [] : []

  const trendStackLegendOverflowNote = useMemo(() => {
    if (!usingStackedTrend) return null
    if (!trendStackLegend.length) return null
    if (!trendStackLimitOption || !Number.isFinite(trendStackLimitOption.segments)) {
      return null
    }
    const overflowEntry = trendStackLegend.find((item) => item.id === '__others__')
    if (!overflowEntry || !overflowEntry.sourceCount) {
      return null
    }
    return `기타에는 ${overflowEntry.sourceCount}개 그룹이 포함됩니다.`
  }, [trendStackLegend, trendStackLimitOption, usingStackedTrend])

  return (
    <section className={styles.audioEventsSection}>
      <div className={styles.audioEventsHeader}>
        <h3 className={styles.audioEventsTitle}>오디오 이벤트 로그</h3>
        <div className={styles.audioEventsActions}>
          <button
            type="button"
            className={styles.audioEventsButton}
            onClick={handleExport}
            disabled={loading || exporting || !data.items.length}
          >
            {exporting ? '내보내는 중…' : 'CSV 내보내기'}
          </button>
          <button
            type="button"
            className={styles.audioEventsButton}
            onClick={() => {
              loadEvents(true)
              loadTrend(true)
            }}
            disabled={loading || trendLoading}
          >
            {loading || trendLoading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>
      </div>

      <div className={styles.audioEventsMeta}>
        <span>총 {data.stats.total}건</span>
        <span>고유 운영자 {data.stats.uniqueOwners}명</span>
        <span>고유 프로필 {data.stats.uniqueProfiles}개</span>
        <span>{summaryChips.join(' · ')}</span>
        {lastUpdatedAt ? <span>마지막 갱신 {formatDurationFromNow(lastUpdatedAt)}</span> : null}
      </div>

      <div className={styles.audioEventsTrend}>
        <div className={styles.audioEventsTrendHeader}>
          <div className={styles.audioEventsTrendHeading}>
            <h4 className={styles.audioEventsTrendTitle}>주간 추이</h4>
            <p className={styles.audioEventsTrendSubtitle}>
              {trendLoading
                ? '주간 데이터를 불러오는 중…'
                : totalTrendBars.length
                ? `최근 ${(trendData?.range?.lookbackWeeks || totalTrendBars.length)}주 누적`
                : '최근 주간 데이터 없음'}
            </p>
            <div className={styles.audioEventsTrendModes}>
              <button
                type="button"
                className={`${styles.audioEventsTrendModeButton} ${
                  trendStackMode === 'total' ? styles.audioEventsTrendModeButtonActive : ''
                }`}
                onClick={() => setTrendStackMode('total')}
              >
                합산
              </button>
              <button
                type="button"
                className={`${styles.audioEventsTrendModeButton} ${
                  trendStackMode === 'hero' ? styles.audioEventsTrendModeButtonActive : ''
                }`}
                onClick={() => setTrendStackMode('hero')}
                disabled={!hasHeroBreakdown}
                title={hasHeroBreakdown ? '히어로별 분포 보기' : '히어로 데이터가 없어 비활성화됨'}
              >
                히어로별
              </button>
              <button
                type="button"
                className={`${styles.audioEventsTrendModeButton} ${
                  trendStackMode === 'owner' ? styles.audioEventsTrendModeButtonActive : ''
                }`}
                onClick={() => setTrendStackMode('owner')}
                disabled={!hasOwnerBreakdown}
                title={hasOwnerBreakdown ? '담당자별 분포 보기' : '담당자 데이터가 없어 비활성화됨'}
              >
                담당자별
              </button>
            </div>
            {usingStackedTrend ? (
              <div className={styles.audioEventsTrendLimit}>
                <span className={styles.audioEventsTrendLimitLabel}>표시 범위</span>
                <div className={styles.audioEventsTrendLimitButtons}>
                  {TREND_STACK_LIMIT_OPTIONS.map((option) => {
                    const active = trendStackLimitOption?.id === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`${styles.audioEventsTrendLimitButton} ${
                          active ? styles.audioEventsTrendLimitButtonActive : ''
                        }`}
                        onClick={() => setTrendStackLimit(option.id)}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <div className={`${styles.audioEventsTrendDelta} ${trendDirectionClass}`}>
            <span className={styles.audioEventsTrendDeltaIcon}>
              {trendSummary?.direction === 'up'
                ? '▲'
                : trendSummary?.direction === 'down'
                ? '▼'
                : '→'}
            </span>
            <span className={styles.audioEventsTrendDeltaValue}>
              {trendSummary ? `${formatNumber(trendSummary.current.eventCount)}건` : '데이터 없음'}
            </span>
            <span className={styles.audioEventsTrendDeltaChange}>
              {trendSummary ? formatTrendDelta(trendSummary) : '변화 없음'}
            </span>
          </div>
        </div>
        {trendError ? <p className={styles.audioEventsTrendError}>{trendError}</p> : null}
        <div className={styles.audioEventsTrendChart} role="img" aria-label="오디오 이벤트 주간 추이">
          {trendChartBars.length ? (
            trendChartBars.map((bar) => (
              <div key={bar.weekStart} className={styles.audioEventsTrendBarWrapper}>
                <div className={styles.audioEventsTrendBarTrack} title={bar.tooltip}>
                  {usingStackedTrend ? (
                    <div
                      className={styles.audioEventsTrendBarStack}
                      style={{ '--audio-events-trend-bar-height': `${bar.height}` }}
                    >
                      {bar.segments.map((segment) => (
                        <div
                          key={`${bar.weekStart}-${segment.id}`}
                          className={styles.audioEventsTrendSegment}
                          style={{
                            '--audio-events-trend-segment-height': `${segment.height}`,
                            '--audio-events-trend-segment-color': segment.color,
                          }}
                          title={`${segment.label}: ${formatNumber(segment.count)}건 (${Math.round(segment.percentage)}%)`}
                        >
                          {segment.displayValue ? (
                            <span className={styles.audioEventsTrendSegmentValue}>
                              {formatNumber(segment.count)}
                            </span>
                          ) : null}
                        </div>
                      ))}
                      {bar.total > 0 ? (
                        <span className={styles.audioEventsTrendBarStackValue}>{formatNumber(bar.total)}</span>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      className={styles.audioEventsTrendBar}
                      style={{ '--audio-events-trend-bar-height': `${bar.height}` }}
                    >
                      {bar.eventCount > 0 ? (
                        <span className={styles.audioEventsTrendBarValue}>{formatNumber(bar.eventCount)}</span>
                      ) : null}
                    </div>
                  )}
                </div>
                <span className={styles.audioEventsTrendBarLabel}>{bar.label}</span>
              </div>
            ))
          ) : (
            <span className={styles.audioEventsEmpty}>추이를 표시할 데이터가 없습니다.</span>
          )}
        </div>
        {usingStackedTrend && trendStackLegend.length ? (
          <>
            <div className={styles.audioEventsTrendLegend}>
              {trendStackLegend.map((item) => (
                <span
                  key={item.id}
                  className={styles.audioEventsTrendLegendItem}
                  title={item.sourceCount > 1 ? `${item.label} 포함 그룹 ${item.sourceCount}개` : item.label}
                >
                  <span
                    className={styles.audioEventsTrendLegendSwatch}
                    style={{ '--audio-events-trend-legend-color': item.color }}
                  />
                  <span className={styles.audioEventsTrendLegendLabel}>{item.label}</span>
                  <span className={styles.audioEventsTrendLegendValue}>
                    {formatNumber(item.total)}건
                    {item.sourceCount > 1 ? ` · ${item.sourceCount}개` : ''}
                  </span>
                </span>
              ))}
            </div>
            {trendStackLegendOverflowNote ? (
              <p className={styles.audioEventsTrendLegendNote}>{trendStackLegendOverflowNote}</p>
            ) : null}
          </>
        ) : null}
        <dl className={styles.audioEventsTrendStats}>
          <div>
            <dt>이번 주</dt>
            <dd>
              {trendSummary
                ? `${formatNumber(trendSummary.current.eventCount)}건 · 운영자 ${formatNumber(
                    trendSummary.current.uniqueOwners,
                  )}명`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>지난 주</dt>
            <dd>
              {trendSummary
                ? `${formatNumber(trendSummary.previous.eventCount)}건 · 운영자 ${formatNumber(
                    trendSummary.previous.uniqueOwners,
                  )}명`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>마지막 갱신</dt>
            <dd>{trendUpdatedAt ? formatDurationFromNow(trendUpdatedAt) : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.audioEventsFilters}>
        <div className={styles.audioEventsRangeRow}>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.audioEventsRangeButton} ${
                range === option.id ? styles.audioEventsRangeButtonActive : ''
              }`}
              onClick={() => setRange(option.id)}
            >
              {option.label}
            </button>
          ))}
          <button type="button" className={styles.audioEventsReset} onClick={resetFilters}>
            필터 초기화
          </button>
        </div>

        <div className={styles.audioEventsInputGrid}>
          <label className={styles.audioEventsField}>
            <span>Owner ID</span>
            <input
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
              placeholder="owner uuid"
            />
          </label>
          <label className={styles.audioEventsField}>
            <span>Profile Key</span>
            <input
              value={profileKey}
              onChange={(event) => setProfileKey(event.target.value)}
              placeholder="hero:profile"
            />
          </label>
          <label className={styles.audioEventsField}>
            <span>Hero ID</span>
            <input
              value={heroId}
              onChange={(event) => setHeroId(event.target.value)}
              placeholder="hero uuid"
            />
          </label>
          <label className={styles.audioEventsField}>
            <span>검색어</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="트랙, 프리셋, 변경 필드 검색"
            />
          </label>
        </div>

        <div className={styles.audioEventsEventTypes}>
          <span className={styles.audioEventsEventTypesLabel}>이벤트 유형</span>
          <div className={styles.audioEventsEventTypeChips}>
            {data.availableEventTypes.length ? (
              data.availableEventTypes.map((eventType) => {
                const active = selectedEventTypes.includes(eventType)
                return (
                  <button
                    key={eventType}
                    type="button"
                    className={`${styles.audioEventsEventTypeChip} ${
                      active ? styles.audioEventsEventTypeChipActive : ''
                    }`}
                    onClick={() => toggleEventType(eventType)}
                  >
                    {eventType}
                  </button>
                )
              })
            ) : (
              <span className={styles.audioEventsEmpty}>수집된 이벤트 유형이 없습니다.</span>
            )}
          </div>
        </div>
      </div>

      {rulesError ? <p className={styles.audioEventsPreferenceError}>{rulesError}</p> : null}
      {rulesFeedback ? <p className={styles.audioEventsPreferenceFeedback}>{rulesFeedback}</p> : null}

      <div className={styles.audioEventsPreferenceBoard}>
        <section className={styles.audioEventsPreferenceColumn} aria-label="오디오 이벤트 즐겨찾기">
          <header className={styles.audioEventsPreferenceHeader}>
            <h3>즐겨찾기</h3>
            <p>현재 필터 상태를 저장해 자주 확인하는 조합을 빠르게 불러옵니다.</p>
          </header>
          {rulesLoading ? (
            <p className={styles.audioEventsPreferenceNote}>즐겨찾기를 불러오는 중…</p>
          ) : favorites.length ? (
            <ul className={styles.audioEventsPreferenceList}>
              {favorites.map((favorite) => (
                <li key={favorite.id} className={styles.audioEventsPreferenceItem}>
                  <div className={styles.audioEventsPreferenceItemText}>
                    <span className={styles.audioEventsPreferenceName}>{favorite.label}</span>
                    {favorite.notes ? (
                      <span className={styles.audioEventsPreferenceMeta}>{favorite.notes}</span>
                    ) : null}
                    <span className={styles.audioEventsPreferenceMeta}>{summariseFilters(favorite.filters)}</span>
                    {favorite.updatedAt ? (
                      <span className={styles.audioEventsPreferenceMeta}>
                        마지막 저장 {formatRuleUpdatedAt(favorite.updatedAt)}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.audioEventsPreferenceActions}>
                    <button
                      type="button"
                      className={styles.audioEventsPreferenceButton}
                      onClick={() => applyFavoriteRule(favorite)}
                    >
                      적용
                    </button>
                    <button
                      type="button"
                      className={styles.audioEventsPreferenceButton}
                      onClick={() => startEditFavorite(favorite)}
                    >
                      편집
                    </button>
                    <button
                      type="button"
                      className={styles.audioEventsPreferenceButton}
                      disabled={deletingRuleId === favorite.id}
                      onClick={() => handleDeleteRule(favorite.id)}
                    >
                      {deletingRuleId === favorite.id ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.audioEventsPreferenceNote}>저장된 즐겨찾기가 없습니다.</p>
          )}

          <form className={styles.audioEventsPreferenceForm} onSubmit={handleFavoriteSubmit}>
            <h4>{editingFavoriteId ? '즐겨찾기 수정' : '새 즐겨찾기 저장'}</h4>
            <label className={styles.audioEventsPreferenceFormRow}>
              <span>이름</span>
              <input
                className={styles.audioEventsPreferenceInput}
                value={favoriteForm.label}
                onChange={(event) => setFavoriteForm((prev) => ({ ...prev, label: event.target.value }))}
                placeholder="예: QA 기본 필터"
              />
            </label>
            <label className={styles.audioEventsPreferenceFormRow}>
              <span>메모</span>
              <textarea
                className={styles.audioEventsPreferenceTextarea}
                value={favoriteForm.notes}
                onChange={(event) => setFavoriteForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="필요 시 설명을 남겨 두세요."
              />
            </label>
            <label className={styles.audioEventsPreferenceFormRow}>
              <span>정렬</span>
              <input
                className={styles.audioEventsPreferenceInput}
                type="number"
                value={favoriteForm.sortOrder}
                onChange={(event) => setFavoriteForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              />
            </label>
            <p className={styles.audioEventsPreferenceHelp}>
              현재 필터(기간, Owner/Profile/Hero, 검색어, 이벤트 유형, 스택 보기)를 저장합니다.
            </p>
            <div className={styles.audioEventsPreferenceFormActions}>
              <button type="submit" className={styles.audioEventsPreferenceSubmit} disabled={savingFavorite}>
                {savingFavorite ? '저장 중…' : editingFavoriteId ? '업데이트' : '저장'}
              </button>
              {editingFavoriteId ? (
                <button
                  type="button"
                  className={styles.audioEventsPreferenceSecondary}
                  onClick={resetFavoriteForm}
                >
                  취소
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className={styles.audioEventsPreferenceColumn} aria-label="Slack 구독 조건">
          <header className={styles.audioEventsPreferenceHeader}>
            <h3>Slack 구독 조건</h3>
            <p>특정 조건을 저장해 주간 Slack 다이제스트와 관리자 모니터에서 강조합니다.</p>
          </header>
          {rulesLoading ? (
            <p className={styles.audioEventsPreferenceNote}>구독 조건을 불러오는 중…</p>
          ) : subscriptions.length ? (
            <ul className={styles.audioEventsPreferenceList}>
              {subscriptions.map((subscription) => (
                <li key={subscription.id} className={styles.audioEventsPreferenceItem}>
                  <div className={styles.audioEventsPreferenceItemText}>
                    <span className={styles.audioEventsPreferenceName}>{subscription.label}</span>
                    {subscription.notes ? (
                      <span className={styles.audioEventsPreferenceMeta}>{subscription.notes}</span>
                    ) : null}
                    <span className={styles.audioEventsPreferenceMeta}>{summariseFilters(subscription.filters)}</span>
                    <span className={styles.audioEventsPreferenceMeta}>{summariseSlack(subscription.slack)}</span>
                    {subscription.updatedAt ? (
                      <span className={styles.audioEventsPreferenceMeta}>
                        마지막 저장 {formatRuleUpdatedAt(subscription.updatedAt)}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.audioEventsPreferenceActions}>
                    <button
                      type="button"
                      className={styles.audioEventsPreferenceButton}
                      onClick={() => applySubscriptionRule(subscription)}
                    >
                      적용
                    </button>
                    <button
                      type="button"
                      className={styles.audioEventsPreferenceButton}
                      onClick={() => startEditSubscription(subscription)}
                    >
                      편집
                    </button>
                    <button
                      type="button"
                      className={styles.audioEventsPreferenceButton}
                      disabled={deletingRuleId === subscription.id}
                      onClick={() => handleDeleteRule(subscription.id)}
                    >
                      {deletingRuleId === subscription.id ? '삭제 중…' : '삭제'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.audioEventsPreferenceNote}>저장된 구독 조건이 없습니다.</p>
          )}

          <form className={styles.audioEventsPreferenceForm} onSubmit={handleSubscriptionSubmit}>
            <h4>{editingSubscriptionId ? '구독 조건 수정' : '새 구독 조건 저장'}</h4>
            <label className={styles.audioEventsPreferenceFormRow}>
              <span>이름</span>
              <input
                className={styles.audioEventsPreferenceInput}
                value={subscriptionForm.label}
                onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, label: event.target.value }))}
                placeholder="예: #ops 급증 모니터"
              />
            </label>
            <label className={styles.audioEventsPreferenceFormRow}>
              <span>메모</span>
              <textarea
                className={styles.audioEventsPreferenceTextarea}
                value={subscriptionForm.notes}
                onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="알림 채널이나 목적을 설명하세요."
              />
            </label>
            <label className={styles.audioEventsPreferenceFormRow}>
              <span>Slack 채널</span>
              <input
                className={styles.audioEventsPreferenceInput}
                value={subscriptionForm.channel}
                onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, channel: event.target.value }))}
                placeholder="#channel 또는 경로"
              />
            </label>
            <label className={styles.audioEventsPreferenceFormRow}>
              <span>Webhook 키 (선택)</span>
              <input
                className={styles.audioEventsPreferenceInput}
                value={subscriptionForm.webhookKey}
                onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, webhookKey: event.target.value }))}
                placeholder="환경 변수와 매칭되는 식별자"
              />
            </label>
            <label className={styles.audioEventsPreferenceFormRow}>
              <span>멘션 (선택)</span>
              <input
                className={styles.audioEventsPreferenceInput}
                value={subscriptionForm.mention}
                onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, mention: event.target.value }))}
                placeholder="예: @ops"
              />
            </label>
            <div className={styles.audioEventsPreferenceGridRow}>
              <label className={styles.audioEventsPreferenceFormRow}>
                <span>임계치(건)</span>
                <input
                  className={styles.audioEventsPreferenceInput}
                  type="number"
                  min="1"
                  value={subscriptionForm.minEvents}
                  onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, minEvents: event.target.value }))}
                />
              </label>
              <label className={styles.audioEventsPreferenceFormRow}>
                <span>누적 주간 수</span>
                <input
                  className={styles.audioEventsPreferenceInput}
                  type="number"
                  min="1"
                  max="52"
                  value={subscriptionForm.lookbackWeeks}
                  onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, lookbackWeeks: event.target.value }))}
                />
              </label>
              <label className={styles.audioEventsPreferenceFormRow}>
                <span>정렬</span>
                <input
                  className={styles.audioEventsPreferenceInput}
                  type="number"
                  value={subscriptionForm.sortOrder}
                  onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                />
              </label>
            </div>
            <label className={styles.audioEventsPreferenceCheckboxRow}>
              <input
                type="checkbox"
                checked={subscriptionForm.alwaysInclude}
                onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, alwaysInclude: event.target.checked }))}
              />
              <span>임계치를 넘지 않아도 다이제스트에 항상 포함</span>
            </label>
            <label className={styles.audioEventsPreferenceCheckboxRow}>
              <input
                type="checkbox"
                checked={subscriptionForm.notifyOnAnomaly}
                onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, notifyOnAnomaly: event.target.checked }))}
              />
              <span>급증·급락 감지 시 강조 표시</span>
            </label>
            <p className={styles.audioEventsPreferenceHelp}>
              현재 필터 기준으로 Slack 다이제스트와 관리자 패널 통계가 강조됩니다. Webhook 키는 환경 변수와 매칭할 때 사용합니다.
            </p>
            <div className={styles.audioEventsPreferenceFormActions}>
              <button type="submit" className={styles.audioEventsPreferenceSubmit} disabled={savingSubscription}>
                {savingSubscription ? '저장 중…' : editingSubscriptionId ? '업데이트' : '저장'}
              </button>
              {editingSubscriptionId ? (
                <button
                  type="button"
                  className={styles.audioEventsPreferenceSecondary}
                  onClick={resetSubscriptionForm}
                >
                  취소
                </button>
              ) : null}
            </div>
          </form>
        </section>
      </div>

      {error ? <p className={styles.audioEventsError}>{error}</p> : null}

      <ul className={styles.audioEventsList}>
        {!loading && !data.items.length ? (
          <li className={styles.audioEventsEmpty}>표시할 이벤트가 없습니다.</li>
        ) : null}
        {data.items.map((item) => {
          const details = item.details || {}
          const changedFields = Array.isArray(details.changedFields) ? details.changedFields : []
          const preference = details.preference || {}
          return (
            <li key={item.id} className={styles.audioEventsItem}>
              <header className={styles.audioEventsItemHeader}>
                <div>
                  <span className={styles.audioEventsHero}>{item.hero_name || '이름 없음'}</span>
                  {item.hero_source ? (
                    <span className={styles.audioEventsHeroSource}>{item.hero_source}</span>
                  ) : null}
                  {item.profile_key ? (
                    <span className={styles.audioEventsProfile}>{item.profile_key}</span>
                  ) : null}
                </div>
                <div className={styles.audioEventsEventMeta}>
                  <span className={styles.audioEventsType}>{item.event_type}</span>
                  <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
                </div>
              </header>
              <div className={styles.audioEventsBody}>
                <div className={styles.audioEventsChangedFields}>
                  {changedFields.length ? (
                    changedFields.map((field) => (
                      <span key={field} className={styles.audioEventsChangedField}>
                        {field}
                      </span>
                    ))
                  ) : (
                    <span className={styles.audioEventsEmpty}>변경 필드 정보 없음</span>
                  )}
                </div>
                <div className={styles.audioEventsPreference}>
                  <span>트랙: {preference.trackId || '—'}</span>
                  <span>프리셋: {preference.presetId || '—'}</span>
                  <span>수동 조정: {preference.manualOverride ? '예' : '아니오'}</span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
