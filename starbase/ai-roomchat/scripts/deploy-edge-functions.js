#!/usr/bin/env node
/**
 * Deploy Supabase Edge Functions with retry + Pager/Slack notifications.
 */

const { spawn } = require('child_process')
const { createClient } = require('@supabase/supabase-js')

const DEFAULT_FUNCTIONS = ['rank-match-timeline', 'rank-api-key-rotation']
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_RETRY_MS = 60_000
const MAX_LOG_CHARS = 3000

const SUPABASE_ACCESS_TOKEN = sanitiseString(process.env.SUPABASE_ACCESS_TOKEN)
const SUPABASE_PROJECT_REF = sanitiseString(process.env.SUPABASE_PROJECT_REF)
const SUPABASE_URL = sanitiseString(process.env.SUPABASE_URL)
const SUPABASE_SERVICE_ROLE = sanitiseString(process.env.SUPABASE_SERVICE_ROLE)

const SLACK_WEBHOOK_URL = sanitiseString(
  process.env.RANK_EDGE_DEPLOY_SLACK_WEBHOOK_URL || process.env.SLACK_EDGE_DEPLOY_WEBHOOK_URL,
)
const SLACK_AUTH = sanitiseString(
  process.env.RANK_EDGE_DEPLOY_SLACK_WEBHOOK_AUTH || process.env.SLACK_EDGE_DEPLOY_WEBHOOK_AUTH,
)
const SLACK_MENTION = sanitiseString(process.env.RANK_EDGE_DEPLOY_SLACK_MENTION)
const SLACK_NOTIFY_ON_SUCCESS = (process.env.RANK_EDGE_DEPLOY_SLACK_NOTIFY_SUCCESS || '').toLowerCase() === 'true'

const PAGERDUTY_ROUTING_KEY = sanitiseString(process.env.RANK_EDGE_DEPLOY_PAGERDUTY_ROUTING_KEY)
const PAGERDUTY_SEVERITY = sanitiseString(process.env.RANK_EDGE_DEPLOY_PAGERDUTY_SEVERITY) || 'critical'
const PAGERDUTY_SOURCE = sanitiseString(process.env.RANK_EDGE_DEPLOY_PAGERDUTY_SOURCE) || 'rank-edge-deploy'

const FUNCTIONS = parseList(process.env.RANK_EDGE_DEPLOY_FUNCTIONS, DEFAULT_FUNCTIONS)
const MAX_ATTEMPTS = toPositiveInteger(process.env.RANK_EDGE_DEPLOY_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS)
const BASE_RETRY_MS = toPositiveInteger(process.env.RANK_EDGE_DEPLOY_BASE_RETRY_MS, DEFAULT_BASE_RETRY_MS)

let supabaseClient = null

function sanitiseString(value, maxLength = 512) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength)
  }
  return trimmed
}

function parseList(value, fallback = []) {
  if (!value) return fallback
  if (typeof value !== 'string') return fallback
  const parts = value
    .split(',')
    .map((part) => sanitiseString(part, 128))
    .filter(Boolean)
  return parts.length ? parts : fallback
}

function toPositiveInteger(raw, fallback) {
  const parsed = Number.parseInt(raw, 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  }
  return supabaseClient
}

function runSupabaseDeploy(fnName) {
  return new Promise((resolve) => {
    const args = ['functions', 'deploy', fnName]
    if (SUPABASE_PROJECT_REF) {
      args.push('--project-ref', SUPABASE_PROJECT_REF)
    }

    const child = spawn('supabase', args, {
      env: {
        ...process.env,
        SUPABASE_ACCESS_TOKEN,
      },
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      process.stdout.write(text)
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      stderr += `\n[edge-deploy] spawn error: ${error.message}`
      resolve({
        exitCode: 1,
        stdout,
        stderr,
      })
    })

    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      resolve({
        exitCode: typeof code === 'number' ? code : signal ? 1 : 0,
        stdout,
        stderr,
      })
    })
  })
}

function summariseLogs(stdout, stderr) {
  const combined = [stdout, stderr].filter(Boolean).join('\n').trim()
  if (!combined) return ''
  if (combined.length <= MAX_LOG_CHARS) return combined
  return `${combined.slice(0, MAX_LOG_CHARS - 3)}...`
}

async function postSlack(payload) {
  if (!SLACK_WEBHOOK_URL) return false
  const headers = { 'Content-Type': 'application/json' }
  if (SLACK_AUTH) {
    headers.Authorization = SLACK_AUTH
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Slack webhook responded with ${response.status} ${response.statusText}: ${detail}`)
    }
    return true
  } catch (error) {
    console.error('[edge-deploy] Failed to notify Slack', { error })
    return false
  }
}

async function notifySlack({
  status,
  functionName,
  attempt,
  maxAttempts,
  exitCode,
  durationMs,
  nextRetryAt,
  logs,
  mention,
}) {
  const emoji =
    status === 'succeeded' ? ':white_check_mark:' : status === 'retrying' ? ':warning:' : ':rotating_light:'
  const lines = []
  lines.push(`${emoji} Edge Function deploy ${status === 'succeeded' ? '성공' : '실패'} – ${functionName}`)
  lines.push(`• 시도 횟수: ${attempt}/${maxAttempts}`)
  if (exitCode != null) {
    lines.push(`• 종료 코드: ${exitCode}`)
  }
  if (durationMs != null) {
    lines.push(`• 실행 시간: ${(durationMs / 1000).toFixed(1)}초`)
  }
  if (nextRetryAt) {
    lines.push(`• 다음 재시도 예정: ${nextRetryAt}`)
  }
  if (mention && status !== 'succeeded') {
    lines.push(mention)
  }
  if (logs) {
    lines.push('```')
    lines.push(logs)
    lines.push('```')
  }

  return postSlack({ text: lines.join('\n') })
}

async function notifyPagerDuty({ functionName, attempt, exitCode, logs }) {
  if (!PAGERDUTY_ROUTING_KEY) return false

  const body = {
    routing_key: PAGERDUTY_ROUTING_KEY,
    event_action: 'trigger',
    dedup_key: `rank-edge-deploy-${functionName}`,
    payload: {
      summary: `Edge Function deploy failed for ${functionName}`,
      source: PAGERDUTY_SOURCE,
      severity: PAGERDUTY_SEVERITY,
      component: functionName,
      group: 'supabase-edge-functions',
      custom_details: {
        attempt,
        exitCode,
        logs,
      },
    },
  }

  try {
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`PagerDuty responded with ${response.status} ${response.statusText}: ${detail}`)
    }
    return true
  } catch (error) {
    console.error('[edge-deploy] Failed to notify PagerDuty', { error })
    return false
  }
}

async function recordAttempt({
  functionName,
  attempt,
  maxAttempts,
  exitCode,
  durationMs,
  status,
  logs,
  nextRetryAt,
}) {
  const client = createSupabaseClient()
  if (!client) return

  try {
    const { error } = await client.from('rank_edge_function_deployments').insert({
      function_name: functionName,
      attempt,
      max_attempts: maxAttempts,
      status,
      exit_code: exitCode,
      duration_ms: durationMs,
      logs,
      next_retry_at: nextRetryAt ? new Date(nextRetryAt).toISOString() : null,
      metadata: {
        version: '2024-EdgeDeploy',
      },
    })
    if (error) {
      console.warn('[edge-deploy] Failed to record deployment attempt', { error })
    }
  } catch (error) {
    console.warn('[edge-deploy] Unexpected error recording deployment attempt', { error })
  }
}

function computeNextRetry(attempt) {
  const delayMs = BASE_RETRY_MS * attempt
  const next = new Date(Date.now() + delayMs)
  return { delayMs, nextRetryAt: next.toISOString() }
}

async function ensureFetch() {
  if (typeof fetch === 'function') return fetch
  const mod = await import('node-fetch')
  return mod.default
}

async function main() {
  global.fetch = await ensureFetch()

  if (!SUPABASE_ACCESS_TOKEN) {
    console.error('[edge-deploy] Missing SUPABASE_ACCESS_TOKEN environment variable.')
    process.exit(1)
  }
  if (!SUPABASE_PROJECT_REF) {
    console.error('[edge-deploy] Missing SUPABASE_PROJECT_REF environment variable.')
    process.exit(1)
  }

  let overallSuccess = true

  for (const fnName of FUNCTIONS) {
    let attempt = 0
    let succeeded = false

    while (attempt < MAX_ATTEMPTS && !succeeded) {
      attempt += 1
      console.log(`\n[edge-deploy] Deploying ${fnName} (attempt ${attempt}/${MAX_ATTEMPTS})`)
      const startedAt = Date.now()
      const { exitCode, stdout, stderr } = await runSupabaseDeploy(fnName)
      const durationMs = Date.now() - startedAt
      const success = exitCode === 0
      const logs = summariseLogs(stdout, stderr)
      const status = success ? 'succeeded' : attempt < MAX_ATTEMPTS ? 'retrying' : 'failed'
      let nextRetryAt = null
      let delayMs = 0
      if (!success && attempt < MAX_ATTEMPTS) {
        const retry = computeNextRetry(attempt)
        nextRetryAt = retry.nextRetryAt
        delayMs = retry.delayMs
      }

      await recordAttempt({
        functionName: fnName,
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        exitCode,
        durationMs,
        status,
        logs,
        nextRetryAt,
      })

      if (!success) {
        await notifySlack({
          status: status === 'retrying' ? 'retrying' : 'failed',
          functionName: fnName,
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          exitCode,
          durationMs,
          nextRetryAt,
          logs,
          mention: SLACK_MENTION,
        })

        if (status === 'failed') {
          overallSuccess = false
          await notifyPagerDuty({ functionName: fnName, attempt, exitCode, logs })
        } else if (delayMs > 0) {
          console.log(`[edge-deploy] Waiting ${Math.round(delayMs / 1000)}s before retrying ${fnName}`)
          await delay(delayMs)
        }
      } else {
        succeeded = true
        if (SLACK_NOTIFY_ON_SUCCESS || attempt > 1) {
          await notifySlack({
            status: 'succeeded',
            functionName: fnName,
            attempt,
            maxAttempts: MAX_ATTEMPTS,
            exitCode,
            durationMs,
            logs: attempt > 1 ? logs : '',
            mention: '',
          })
        }
      }
    }
  }

  if (!overallSuccess) {
    console.error('[edge-deploy] One or more Edge Function deployments failed.')
    process.exit(1)
  }

  console.log('[edge-deploy] Edge Function deployments completed successfully.')
}

main().catch((error) => {
  console.error('[edge-deploy] Unexpected error', error)
  process.exit(1)
})
