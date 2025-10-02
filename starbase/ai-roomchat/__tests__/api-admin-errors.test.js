const crypto = require('crypto')
const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals')

function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
  return response
}

function createRequest({
  method = 'GET',
  headers = {},
  query = {},
}) {
  return {
    method,
    headers,
    query,
  }
}

function buildSupabaseChain(result) {
  const limitMock = jest.fn().mockResolvedValue(result)
  const orderMock = jest.fn(() => ({ limit: limitMock }))
  const selectMock = jest.fn(() => ({ order: orderMock }))
  const fromMock = jest.fn(() => ({ select: selectMock }))
  return { fromMock, selectMock, orderMock, limitMock }
}

async function loadHandler() {
  const module = require('../pages/api/admin/errors')
  return module.default
}

describe('GET /api/admin/errors', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.ADMIN_PORTAL_PASSWORD
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('rejects non-GET methods', async () => {
    const chain = buildSupabaseChain({ data: [], error: null })
    jest.doMock('@/lib/supabaseAdmin', () => ({
      supabaseAdmin: { from: chain.fromMock },
    }))

    process.env.ADMIN_PORTAL_PASSWORD = 'secret'
    const handler = await loadHandler()

    const req = createRequest({ method: 'POST' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toEqual(['GET'])
    expect(chain.fromMock).not.toHaveBeenCalled()
  })

  it('requires the admin password to be configured', async () => {
    const chain = buildSupabaseChain({ data: [], error: null })
    jest.doMock('@/lib/supabaseAdmin', () => ({
      supabaseAdmin: { from: chain.fromMock },
    }))

    const handler = await loadHandler()
    const req = createRequest({})
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Admin portal password is not configured' })
  })

  it('rejects missing session tokens', async () => {
    const chain = buildSupabaseChain({ data: [], error: null })
    jest.doMock('@/lib/supabaseAdmin', () => ({
      supabaseAdmin: { from: chain.fromMock },
    }))

    process.env.ADMIN_PORTAL_PASSWORD = 'secret'
    const handler = await loadHandler()

    const req = createRequest({ headers: { cookie: '' } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Missing session token' })
    expect(chain.fromMock).not.toHaveBeenCalled()
  })

  it('rejects invalid session tokens', async () => {
    const chain = buildSupabaseChain({ data: [], error: null })
    jest.doMock('@/lib/supabaseAdmin', () => ({
      supabaseAdmin: { from: chain.fromMock },
    }))

    const password = 'secret'
    process.env.ADMIN_PORTAL_PASSWORD = password
    const handler = await loadHandler()

    const req = createRequest({ headers: { cookie: 'rank_admin_portal_session=invalid' } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid session token' })
    expect(chain.fromMock).not.toHaveBeenCalled()
  })

  it('returns recent error reports with stats', async () => {
    const fixedNow = new Date('2025-01-01T12:00:00Z').getTime()
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow)

    const data = [
      {
        id: 1,
        session_id: 'abc',
        path: '/a',
        message: 'boom',
        severity: 'ERROR',
        stack: null,
        context: {},
        user_agent: 'UA',
        created_at: new Date(fixedNow - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 2,
        session_id: 'def',
        path: '/b',
        message: 'warn',
        severity: 'warn',
        stack: null,
        context: {},
        user_agent: 'UA2',
        created_at: new Date(fixedNow - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]

    const chain = buildSupabaseChain({ data, error: null })
    jest.doMock('@/lib/supabaseAdmin', () => ({
      supabaseAdmin: { from: chain.fromMock },
    }))

    const password = 'secret'
    process.env.ADMIN_PORTAL_PASSWORD = password
    const expectedToken = crypto.createHash('sha256').update(password).digest('hex')
    const handler = await loadHandler()

    const req = createRequest({
      headers: { cookie: `rank_admin_portal_session=${expectedToken}` },
      query: { limit: '20' },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(chain.fromMock).toHaveBeenCalledWith('rank_user_error_reports')
    expect(res.statusCode).toBe(200)
    expect(res.body.items).toEqual(data)
    expect(res.body.stats).toEqual({
      total: 2,
      last24h: 1,
      bySeverity: { error: 1, warn: 1 },
    })
  })

  it('propagates Supabase failures', async () => {
    const chain = buildSupabaseChain({ data: null, error: { message: 'fail' } })
    jest.doMock('@/lib/supabaseAdmin', () => ({
      supabaseAdmin: { from: chain.fromMock },
    }))

    process.env.ADMIN_PORTAL_PASSWORD = 'secret'
    const handler = await loadHandler()

    const token = crypto.createHash('sha256').update('secret').digest('hex')
    const req = createRequest({ headers: { cookie: `rank_admin_portal_session=${token}` } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to fetch error reports' })
  })

  it('handles unexpected exceptions gracefully', async () => {
    const limitMock = jest.fn(() => Promise.reject(new Error('timeout')))
    const orderMock = jest.fn(() => ({ limit: limitMock }))
    const selectMock = jest.fn(() => ({ order: orderMock }))
    const fromMock = jest.fn(() => ({ select: selectMock }))

    jest.doMock('@/lib/supabaseAdmin', () => ({
      supabaseAdmin: { from: fromMock },
    }))

    process.env.ADMIN_PORTAL_PASSWORD = 'secret'
    const handler = await loadHandler()
    const token = crypto.createHash('sha256').update('secret').digest('hex')
    const req = createRequest({ headers: { cookie: `rank_admin_portal_session=${token}` } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Unexpected error' })
    expect(fromMock).toHaveBeenCalled()
  })
})
