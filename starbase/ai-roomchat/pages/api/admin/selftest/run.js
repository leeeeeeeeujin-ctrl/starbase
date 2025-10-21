import { parseCookies } from '@/lib/server/cookies'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  createTestSimulation,
  autoAdvanceSimulation,
  getTestSimulation,
  deleteTestSimulation,
} from '@/lib/testGameSimulator'

const COOKIE_NAME = 'rank_admin_portal_session'

function ensureAuthorised(req) {
  const password = process.env.ADMIN_PORTAL_PASSWORD
  if (!password || !password.trim()) {
    return { ok: false, status: 500, message: 'Admin portal password is not configured' }
  }
  const cookieHeader = req.headers.cookie || ''
  const cookies = parseCookies(cookieHeader)
  const token = cookies[COOKIE_NAME]
  const expected = require('crypto').createHash('sha256').update(password).digest('hex')
  if (!token || token !== expected) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }
  return { ok: true }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const auth = ensureAuthorised(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.message })

  const steps = []
  const context = { }

  async function runStep(name, fn, { required = true } = {}) {
    const startedAt = Date.now()
    const entry = { name, status: 'running', startedAt, durationMs: 0 }
    steps.push(entry)
    try {
      const result = await fn()
      entry.status = 'ok'
      entry.result = sanitize(result)
      return result
    } catch (err) {
      entry.status = required ? 'fail' : 'skip'
      entry.error = err?.message || String(err)
      if (required) throw err
      return null
    } finally {
      entry.durationMs = Date.now() - startedAt
    }
  }

  try {
    // 1) ADMIN_PORTAL_PASSWORD 확인
    await runStep('env:admin_password', async () => {
      if (!process.env.ADMIN_PORTAL_PASSWORD) {
        throw new Error('ADMIN_PORTAL_PASSWORD not set')
      }
      return 'present'
    })

    // 2) Supabase env 확인 및 간단 쿼리
    await runStep('env:supabase', async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) throw new Error('SUPABASE envs missing')
      const { error } = await supabaseAdmin.from('rank_games').select('id').limit(1)
      if (error) throw error
      return 'connected'
    })

    // 3) 테스트 테이블 존재 확인
    await runStep('db:test_tables', async () => {
      const tables = [
        'test_rank_sessions',
        'test_rank_session_meta',
        'test_rank_session_slots',
        'test_rank_battles',
        'test_rank_battle_logs',
        'test_rank_participants',
      ]
      const missing = []
      for (const table of tables) {
        const { error } = await supabaseAdmin.from(table).select('id').limit(1)
        if (error && /relation .* does not exist|42P01/.test(error.message || '')) {
          missing.push(table)
        } else if (error && error.code === '42P01') {
          missing.push(table)
        }
      }
      if (missing.length) {
        const hint = 'supabase-test-tables.sql 파일을 Supabase SQL Editor에서 실행하세요.'
        throw new Error(`missing tables: ${missing.join(', ')} | ${hint}`)
      }
      return 'present'
    })

    // 4) 최소 데이터 로드
    await runStep('data:load_games_heroes', async () => {
      const { data: games, error: gamesError } = await supabaseAdmin
        .from('rank_games')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(10)
      if (gamesError) throw gamesError
      if (!games || games.length === 0) throw new Error('no games found')

      const { data: heroes, error: heroesError } = await supabaseAdmin
        .from('heroes')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(20)
      if (heroesError) throw heroesError
      if (!heroes || heroes.length < 2) throw new Error('need at least 2 heroes')

      context.gameId = games[0].id
      context.heroIds = heroes.slice(0, Math.min(4, heroes.length)).map((h) => h.id)
      return { gameId: context.gameId, heroes: context.heroIds.length }
    })

    // 5) 시뮬레이션 생성
    await runStep('sim:create', async () => {
      const result = await createTestSimulation(supabaseAdmin, {
        gameId: context.gameId,
        mode: 'rank_solo',
        heroIds: context.heroIds,
        turnLimit: 3,
      })
      context.sessionId = result.sessionId
      return { sessionId: context.sessionId }
    })

    // 6) 2턴 자동 진행
    await runStep('sim:auto_advance', async () => {
      const results = await autoAdvanceSimulation(supabaseAdmin, context.sessionId, 2, null)
      return { turns: results.length }
    })

    // 7) 상세 조회
    await runStep('sim:detail', async () => {
      const detail = await getTestSimulation(supabaseAdmin, context.sessionId)
      return {
        status: detail.session?.status,
        turn: detail.session?.turn,
        battles: detail.battles?.length || 0,
      }
    })

    // 8) 정리
    await runStep('sim:cleanup', async () => {
      await deleteTestSimulation(supabaseAdmin, context.sessionId)
      return 'deleted'
    }, { required: false })

    return res.status(200).json({ ok: true, steps })
  } catch (err) {
    return res.status(200).json({ ok: false, steps })
  }
}

function sanitize(value) {
  if (!value) return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (e) {
    return String(value)
  }
}
