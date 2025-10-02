#!/usr/bin/env node
/**
 * Generate a weekly summary of audio event telemetry and deliver it to Slack.
 */

const { createClient } = require('@supabase/supabase-js')

const DEFAULT_LOOKBACK_WEEKS = 12
const MAX_LOOKBACK_WEEKS = 52
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

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

function buildSlackPayload({ buckets, summary, lookbackWeeks, generatedAt }) {
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

  return {
    text: `오디오 이벤트 주간 추이 (${lookbackWeeks}주)` ,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '오디오 이벤트 주간 추이',
        },
      },
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
    ],
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
  const payload = buildSlackPayload({
    buckets,
    summary,
    lookbackWeeks,
    generatedAt: now,
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
}
