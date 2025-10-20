#!/usr/bin/env node
/**
 * Generate a weekly summary of audio event telemetry and deliver it to Slack.
 */

const { createClient } = require('@supabase/supabase-js')

const DEFAULT_LOOKBACK_WEEKS = 12
const MAX_LOOKBACK_WEEKS = 52
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const ANOMALY_PERCENT_THRESHOLD = 40
const ANOMALY_MIN_ABSOLUTE_DELTA = 8
const DISTRIBUTION_LIMIT = 4
const SUBSCRIPTION_FETCH_LIMIT = 400

function sanitiseString(value, maxLength = 160) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : ''
}

function normaliseRuleFilters(raw = {}) {
  const eventTypes = Array.isArray(raw.eventTypes)
    ? Array.from(
        new Set(
          raw.eventTypes
            .map((value) => sanitiseString(value, 48))
            .filter(Boolean),
        ),
      )
    : []

  return {
    range: sanitiseString(raw.range, 24) || null,
    ownerId: sanitiseString(raw.ownerId, 64),
    profileKey: sanitiseString(raw.profileKey, 128),
    heroId: sanitiseString(raw.heroId, 64),
    search: sanitiseString(raw.search, 120),
    eventTypes,
  }
}

function normaliseSlackConfig(raw = {}) {
  const minEventsValue = Number.parseInt(raw.minEvents, 10)
  const lookbackValue = Number.parseInt(raw.lookbackWeeks, 10)

  const minEvents = Number.isFinite(minEventsValue) && minEventsValue > 0 ? Math.min(minEventsValue, 500) : 1
  const lookbackWeeks = Number.isFinite(lookbackValue) && lookbackValue > 0
    ? Math.min(lookbackValue, MAX_LOOKBACK_WEEKS)
    : DEFAULT_LOOKBACK_WEEKS

  return {
    channel: sanitiseString(raw.channel, 80),
    mention: sanitiseString(raw.mention, 80),
    webhookKey: sanitiseString(raw.webhookKey, 96),
    minEvents,
    lookbackWeeks,
    alwaysInclude: Boolean(raw.alwaysInclude),
    notifyOnAnomaly: raw.notifyOnAnomaly !== false,
  }
}

function describeFilters(filters = {}) {
  const parts = []
  if (filters.range) parts.push(filters.range)
  if (filters.ownerId) parts.push(`owner ${filters.ownerId}`)
  if (filters.profileKey) parts.push(`profile ${filters.profileKey}`)
  if (filters.heroId) parts.push(`hero ${filters.heroId}`)
  if (filters.eventTypes && filters.eventTypes.length) {
    parts.push(`type ${filters.eventTypes.join(', ')}`)
  }
  if (filters.search) parts.push(`검색 "${filters.search}"`)
  return parts.join(' · ')
}

function describeSlack(slack = {}) {
  const parts = []
  if (slack.channel) parts.push(slack.channel)
  if (slack.mention) parts.push(slack.mention)
  parts.push(`임계 ${slack.minEvents || 1}건 / ${slack.lookbackWeeks || DEFAULT_LOOKBACK_WEEKS}주`)
  if (slack.alwaysInclude) parts.push('항상 포함')
  if (slack.notifyOnAnomaly === false) parts.push('급증 감지 제외')
  return parts.join(' · ')
}

function startOfWeek(date) {
  const cloned = new Date(date.getTime())
  const day = cloned.getUTCDay()
  const diff = (day + 6) % 7
  cloned.setUTCDate(cloned.getUTCDate() - diff)
  cloned.setUTCHours(0, 0, 0, 0)
  return cloned
}

function normaliseBuckets(raw = [], { now = new Date(), weeks = DEFAULT_LOOKBACK_WEEKS } = {}) {
  const rangeWeeks = Number.isFinite(weeks) && weeks > 0 ? Math.min(Math.floor(weeks), MAX_LOOKBACK_WEEKS) : DEFAULT_LOOKBACK_WEEKS
  const anchor = startOfWeek(now instanceof Date ? now : new Date())
  const lookup = new Map()

  if (Array.isArray(raw)) {
    for (const bucket of raw) {
      if (!bucket || !bucket.week_start) continue
      const parsed = new Date(bucket.week_start)
      if (Number.isNaN(parsed.getTime())) continue
      const key = startOfWeek(parsed).toISOString()
      lookup.set(key, {
        eventCount: Number(bucket.event_count) || 0,
        uniqueOwners: Number(bucket.unique_owners) || 0,
        uniqueProfiles: Number(bucket.unique_profiles) || 0,
      })
    }
  }

  const result = []
  for (let index = rangeWeeks - 1; index >= 0; index -= 1) {
    const weekDate = new Date(anchor.getTime() - index * MS_PER_WEEK)
    const key = weekDate.toISOString()
    const fallback = { eventCount: 0, uniqueOwners: 0, uniqueProfiles: 0 }
    const entry = lookup.get(key) || fallback
    result.push({ weekStart: key, ...entry })
  }

  return result
}

function summariseTrend(buckets = []) {
  if (!Array.isArray(buckets) || buckets.length === 0) {
    return null
  }

  const current = buckets[buckets.length - 1]
  const previous = buckets[buckets.length - 2] || { eventCount: 0, uniqueOwners: 0, uniqueProfiles: 0 }
  const deltaCount = current.eventCount - previous.eventCount
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

function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return '0'
  }
  return new Intl.NumberFormat('ko-KR').format(number)
}

function formatDelta(summary) {
  if (!summary) return '변화 없음'
  if (summary.previous.eventCount === 0 && summary.current.eventCount > 0) {
    return `신규 +${formatNumber(summary.current.eventCount)}건`
  }
  if (summary.deltaCount === 0) {
    return '변화 없음'
  }
  const symbol = summary.deltaCount > 0 ? '+' : '−'
  const percent = Number.isFinite(summary.deltaPercent) ? `${Math.abs(summary.deltaPercent).toFixed(1)}%` : '0.0%'
  return `${symbol}${formatNumber(Math.abs(summary.deltaCount))}건 (${percent})`
}

function buildDistributionSummary(distribution) {
  if (!distribution || !Array.isArray(distribution.lines) || distribution.lines.length === 0) {
    return null
  }
  return distribution.lines.map((line) => `• ${line}`).join('\n')
}

function buildSlackPayload({ buckets, summary, lookbackWeeks, generatedAt, anomaly, distribution, subscriptions = [] }) {
  const lines = buckets.map((bucket) => {
    const start = new Date(bucket.weekStart)
    const end = new Date(start.getTime() + MS_PER_WEEK - 1)
    const label = `${start.toISOString().slice(5, 10)}~${end.toISOString().slice(5, 10)}`
    return `• ${label}: ${formatNumber(bucket.eventCount)}건 (운영자 ${formatNumber(bucket.uniqueOwners)}명)`
  })

  const textSummary = summary
    ? `지난 주 ${formatNumber(summary.previous.eventCount)}건 → 이번 주 ${formatNumber(summary.current.eventCount)}건, ${formatDelta(summary)}`
    : '최근 주간 데이터가 없습니다.'

  const now = generatedAt || new Date()
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 16)

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '오디오 이벤트 주간 추이',
      },
    },
  ]

  if (anomaly) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*${anomaly.badge}* · ${anomaly.message}`,
        },
      ],
    })
  }

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*요약*: ${textSummary}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `최근 ${lookbackWeeks}주 누적 · ${timestamp} 기준`,
        },
      ],
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: lines.join('\n') || '표시할 데이터가 없습니다.',
      },
    },
  )

  const distributionSummary = buildDistributionSummary(distribution)
  if (distributionSummary) {
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*히어로 분포*: \n${distributionSummary}`,
        },
      },
    )
  }

  if (Array.isArray(subscriptions) && subscriptions.length) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*구독 조건 하이라이트*',
      },
    })

    subscriptions.forEach((item) => {
      const summaryParts = [`• *${item.label}*: ${formatNumber(item.count)}건`]
      if (!item.meetsThreshold && !item.slack?.alwaysInclude) {
        summaryParts[0] += ' (임계 미충족)'
      }
      if (item.anomaly?.badge) {
        summaryParts[0] += ` · ${item.anomaly.badge}`
      }

      const metaLines = []
      const filtersSummary = describeFilters(item.filters)
      const slackSummary = describeSlack(item.slack)
      if (filtersSummary) metaLines.push(filtersSummary)
      if (slackSummary) metaLines.push(slackSummary)
      if (item.notes) metaLines.push(item.notes)

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [...summaryParts, ...metaLines].join('\n'),
        },
      })
    })
  }

  return {
    text: `오디오 이벤트 주간 추이 (${lookbackWeeks}주)` ,
    blocks,
  }
}

async function postToSlack(url, payload, { authorization } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (authorization) {
    headers.Authorization = authorization
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Slack webhook responded with ${response.status}: ${text}`)
  }
}

async function fetchTrend(client, { start, end, ownerId, profileKey, heroId, eventTypes } = {}) {
  return client.rpc('rank_audio_events_weekly_trend', {
    start_timestamp: start || null,
    end_timestamp: end || null,
    owner_filter: ownerId || null,
    profile_filter: profileKey || null,
    hero_filter: heroId || null,
    event_type_filter: Array.isArray(eventTypes) && eventTypes.length ? eventTypes : null,
  })
}

async function fetchBreakdown(client, options = {}, mode = 'hero') {
  return client.rpc('rank_audio_events_weekly_breakdown', {
    mode,
    start_timestamp: options.start || null,
    end_timestamp: options.end || null,
    owner_filter: options.ownerId || null,
    profile_filter: options.profileKey || null,
    hero_filter: options.heroId || null,
    event_type_filter: Array.isArray(options.eventTypes) && options.eventTypes.length ? options.eventTypes : null,
  })
}

function detectAnomaly(summary) {
  if (!summary) return null

  const { direction, deltaPercent, deltaCount, current, previous } = summary
  const magnitude = Math.abs(deltaPercent || 0)
  const absoluteDelta = Math.abs(deltaCount || 0)

  if (direction === 'up' && (magnitude >= ANOMALY_PERCENT_THRESHOLD || absoluteDelta >= ANOMALY_MIN_ABSOLUTE_DELTA)) {
    return {
      type: 'spike',
      badge: '🔺 급증 감지',
      message: `지난 주 ${formatNumber(previous.eventCount || 0)}건 → 이번 주 ${formatNumber(current.eventCount || 0)}건, ${formatDelta(summary)}`,
    }
  }

  if (direction === 'down' && (magnitude >= ANOMALY_PERCENT_THRESHOLD || absoluteDelta >= ANOMALY_MIN_ABSOLUTE_DELTA)) {
    return {
      type: 'drop',
      badge: '🔻 급감 감지',
      message: `지난 주 ${formatNumber(previous.eventCount || 0)}건 대비 감소, ${formatDelta(summary)}`,
    }
  }

  if ((current?.eventCount || 0) === 0 && (previous?.eventCount || 0) > 0) {
    return {
      type: 'zeroed',
      badge: '⚠️ 수집 중단?',
      message: '이번 주 수집 건수가 0건으로 내려갔습니다. 장비 또는 스크립트를 점검해 주세요.',
    }
  }

  return null
}

function summariseHeroDistribution(entries = [], { limit = DISTRIBUTION_LIMIT } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null
  }

  const totals = new Map()
  let grandTotal = 0

  for (const entry of entries) {
    const count = Number(entry?.event_count ?? entry?.eventCount)
    if (!Number.isFinite(count) || count <= 0) {
      continue
    }
    grandTotal += count
    const id = entry.dimension_id || entry.dimensionId || 'unknown'
    const label = entry.dimension_label || entry.dimensionLabel || '히어로 미지정'
    const currentTotal = totals.get(id) || { label, count: 0 }
    currentTotal.count += count
    currentTotal.label = label
    totals.set(id, currentTotal)
  }

  if (grandTotal === 0) {
    return null
  }

  const sorted = Array.from(totals.values()).sort((a, b) => b.count - a.count)
  const top = sorted.slice(0, limit)
  const remainder = sorted.slice(limit)

  const lines = top.map((item) => {
    const percent = Math.round((item.count / grandTotal) * 100)
    return `${item.label} ${percent}% (${formatNumber(item.count)}건)`
  })

  if (remainder.length) {
    const restCount = remainder.reduce((sum, item) => sum + item.count, 0)
    const percent = Math.round((restCount / grandTotal) * 100)
    lines.push(`기타 ${percent}% (${formatNumber(restCount)}건)`)
  }

  return { total: grandTotal, lines }
}

async function fetchSubscriptions(client) {
  try {
    const response = await client
      .from('rank_audio_monitor_rules')
      .select('id, rule_type, label, notes, config, sort_order, updated_at')
      .eq('rule_type', 'subscription')
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false })

    if (response.error) {
      return { data: [], error: response.error }
    }

    const records = Array.isArray(response.data) ? response.data : []
    const subscriptions = records.map((record) => ({
      id: record.id,
      label: record.label || '이름 없음',
      notes: record.notes || '',
      sortOrder: record.sort_order || 0,
      filters: normaliseRuleFilters(record?.config?.filters || {}),
      slack: normaliseSlackConfig(record?.config?.slack || {}),
      trend: record?.config?.trend || {},
    }))

    return { data: subscriptions, error: null }
  } catch (error) {
    return { data: [], error }
  }
}

function filterEventsBySearch(events = [], searchTerm = '') {
  if (!searchTerm) return events
  const needle = searchTerm.toLowerCase()
  return events.filter((item) => {
    const haystacks = [
      item.hero_name,
      item.hero_source,
      item.profile_key,
      item.event_type,
      item.details?.preference?.trackId,
      item.details?.preference?.presetId,
      ...(Array.isArray(item.details?.changedFields) ? item.details.changedFields : []),
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
    return haystacks.some((value) => value.includes(needle))
  })
}

async function buildSubscriptionHighlights(client, subscriptions = [], { now = new Date() } = {}) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return []
  }

  const highlights = []

  for (const rule of subscriptions) {
    try {
      const slack = rule.slack || {}
      const filters = rule.filters || {}
      const lookbackWeeks = Math.min(Math.max(slack.lookbackWeeks || DEFAULT_LOOKBACK_WEEKS, 1), MAX_LOOKBACK_WEEKS)
      const endDate = now instanceof Date ? now : new Date()
      const startDate = new Date(endDate.getTime() - lookbackWeeks * MS_PER_WEEK)

      let query = client
        .from('rank_audio_events')
        .select('id, hero_name, hero_source, profile_key, event_type, details, created_at', { count: 'exact' })
        .gte('created_at', startDate.toISOString())
        .lt('created_at', endDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(SUBSCRIPTION_FETCH_LIMIT)

      if (filters.ownerId) {
        query = query.eq('owner_id', filters.ownerId)
      }
      if (filters.profileKey) {
        query = query.eq('profile_key', filters.profileKey)
      }
      if (filters.heroId) {
        query = query.eq('hero_id', filters.heroId)
      }
      if (filters.eventTypes && filters.eventTypes.length) {
        query = query.in('event_type', filters.eventTypes)
      }

      const { data, error, count } = await query
      if (error) {
        console.warn('[audio-events] Failed to fetch subscription events', rule.id, error)
        continue
      }

      const events = Array.isArray(data) ? data : []
      const filteredEvents = filters.search ? filterEventsBySearch(events, filters.search) : events

      const matchedCount = filters.search
        ? filteredEvents.length
        : Number.isFinite(count)
        ? count
        : filteredEvents.length

      const trendResponse = await fetchTrend(client, {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        ownerId: filters.ownerId,
        profileKey: filters.profileKey,
        heroId: filters.heroId,
        eventTypes: filters.eventTypes,
      })

      if (trendResponse.error) {
        console.warn('[audio-events] Failed to fetch subscription trend', rule.id, trendResponse.error)
      }

      const trendBuckets = Array.isArray(trendResponse.data)
        ? normaliseBuckets(trendResponse.data, { now: endDate, weeks: lookbackWeeks })
        : []
      const trendSummary = trendBuckets.length ? summariseTrend(trendBuckets) : null
      const anomaly = slack.notifyOnAnomaly !== false ? detectAnomaly(trendSummary) : null

      const meetsThreshold = matchedCount >= slack.minEvents
      const includeHighlight = slack.alwaysInclude || meetsThreshold || Boolean(anomaly)

      if (!includeHighlight) {
        continue
      }

      highlights.push({
        id: rule.id,
        label: rule.label,
        notes: rule.notes,
        filters,
        slack,
        count: matchedCount,
        meetsThreshold,
        anomaly,
        lookbackWeeks,
      })
    } catch (error) {
      console.warn('[audio-events] Unexpected error building subscription highlight', rule?.id, error)
    }
  }

  return highlights
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE
  if (!supabaseUrl || !supabaseKey) {
    console.log('[audio-events] Missing Supabase credentials, skipping Slack notification.')
    return
  }

  const webhookUrl = process.env.AUDIO_EVENT_SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    console.log('[audio-events] AUDIO_EVENT_SLACK_WEBHOOK_URL not set, skipping notification.')
    return
  }

  const lookbackInput = Number.parseInt(process.env.AUDIO_EVENT_TREND_LOOKBACK_WEEKS, 10)
  const lookbackWeeks = Number.isFinite(lookbackInput) && lookbackInput > 0
    ? Math.min(lookbackInput, MAX_LOOKBACK_WEEKS)
    : DEFAULT_LOOKBACK_WEEKS

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  const now = new Date()
  const end = now.toISOString()
  const start = new Date(now.getTime() - lookbackWeeks * MS_PER_WEEK).toISOString()

  const { data, error } = await fetchTrend(client, { start, end })
  if (error) {
    throw new Error(`Failed to fetch weekly trend: ${error.message || 'unknown error'}`)
  }

  const buckets = normaliseBuckets(data, { now, weeks: lookbackWeeks })
  if (!buckets.some((bucket) => bucket.eventCount > 0)) {
    console.log('[audio-events] No events recorded in lookback window, skipping Slack notification.')
    return
  }

  const summary = summariseTrend(buckets)
  const anomaly = detectAnomaly(summary)

  const breakdownResponse = await fetchBreakdown(client, { start, end }, 'hero')
  if (breakdownResponse.error) {
    console.warn('[audio-events] Failed to fetch hero distribution for Slack payload', breakdownResponse.error)
  }
  const distribution = summariseHeroDistribution(breakdownResponse.data)

  const subscriptionsResponse = await fetchSubscriptions(client)
  if (subscriptionsResponse.error) {
    console.warn('[audio-events] Failed to fetch subscription rules', subscriptionsResponse.error)
  }
  const subscriptionHighlights = await buildSubscriptionHighlights(client, subscriptionsResponse.data, { now })

  const payload = buildSlackPayload({
    buckets,
    summary,
    lookbackWeeks,
    generatedAt: now,
    anomaly,
    distribution,
    subscriptions: subscriptionHighlights,
  })

  await postToSlack(webhookUrl, payload, {
    authorization: process.env.AUDIO_EVENT_SLACK_AUTH_HEADER,
  })

  console.log('[audio-events] Published weekly trend notification to Slack.')
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[audio-events] Failed to notify Slack', error)
    process.exitCode = 1
  })
}

module.exports = {
  normaliseBuckets,
  summariseTrend,
  buildSlackPayload,
  formatDelta,
  formatNumber,
  detectAnomaly,
  summariseHeroDistribution,
  buildDistributionSummary,
  buildSubscriptionHighlights,
  describeFilters,
  describeSlack,
}
