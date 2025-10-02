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

function buildSlackPayload({ buckets, summary, lookbackWeeks, generatedAt, anomaly, distribution }) {
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

  const payload = buildSlackPayload({
    buckets,
    summary,
    lookbackWeeks,
    generatedAt: now,
    anomaly,
    distribution,
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
}
