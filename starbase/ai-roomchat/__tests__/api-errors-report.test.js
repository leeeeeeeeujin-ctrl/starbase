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
  method = 'POST',
  body = {},
  headers = {},
  ip,
}) {
  return {
    method,
    body,
    headers,
    socket: { remoteAddress: ip || headers['x-forwarded-for'] || '127.0.0.1' },
  }
}

function mockSupabase(insertImplementation = () => Promise.resolve({ error: null })) {
  const insertMock = jest.fn(insertImplementation)
  const fromMock = jest.fn(() => ({ insert: insertMock }))
  jest.doMock('@/lib/supabaseAdmin', () => ({
    supabaseAdmin: {
      from: fromMock,
    },
  }))
  return { insertMock, fromMock }
}

async function loadHandler() {
  const module = require('../pages/api/errors/report')
  return module.default
}

describe('POST /api/errors/report', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('rejects non-POST methods', async () => {
    mockSupabase()
    const handler = await loadHandler()
    const req = createRequest({ method: 'GET' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toEqual(['POST'])
  })

  it('validates presence of error message', async () => {
    const { insertMock } = mockSupabase()
    const handler = await loadHandler()

    const req = createRequest({ body: { message: '   ' } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Missing error message' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('persists sanitized payloads', async () => {
    const { insertMock } = mockSupabase()
    const handler = await loadHandler()

    const longPath = '/dashboard'.padEnd(600, 'x')
    const req = createRequest({
      headers: {
        'user-agent': 'JestSuite/1.0',
        'x-forwarded-for': '203.0.113.1',
      },
      body: {
        message: 'Unhandled rejection ',
        stack: 'Error: boom',
        context: { foo: 'bar' },
        path: longPath,
        sessionId: ' session-123 ',
        severity: 'WARNING',
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({ ok: true })
    expect(insertMock).toHaveBeenCalledTimes(1)
    const payload = insertMock.mock.calls[0][0]
    expect(payload.session_id).toBe('session-123')
    expect(payload.path.length).toBeLessThanOrEqual(512)
    expect(payload.message).toBe('Unhandled rejection')
    expect(payload.severity).toBe('warn')
    expect(payload.user_agent).toBe('JestSuite/1.0')
    expect(typeof payload.context).toBe('object')
  })

  it('enforces throttling per ip/session pair', async () => {
    const { insertMock } = mockSupabase()
    const handler = await loadHandler()

    for (let index = 0; index < 12; index += 1) {
      const req = createRequest({
        headers: { 'x-forwarded-for': '198.51.100.5' },
        body: { message: `Issue ${index}`, sessionId: 'abc' },
      })
      const res = createMockResponse()
      await handler(req, res)
      expect(res.statusCode).toBe(201)
    }

    const throttledReq = createRequest({
      headers: { 'x-forwarded-for': '198.51.100.5' },
      body: { message: 'Final issue', sessionId: 'abc' },
    })
    const throttledRes = createMockResponse()
    await handler(throttledReq, throttledRes)

    expect(throttledRes.statusCode).toBe(429)
    expect(throttledRes.body).toEqual({ error: 'Too many error reports, please slow down.' })
    expect(insertMock).toHaveBeenCalledTimes(12)
  })

  it('returns 500 when persistence fails', async () => {
    const { insertMock } = mockSupabase(() => Promise.resolve({ error: { message: 'db down' } }))
    const handler = await loadHandler()

    const req = createRequest({ body: { message: 'boom' } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to persist error report' })
    expect(insertMock).toHaveBeenCalledTimes(1)
  })

  it('handles unexpected insertion errors gracefully', async () => {
    const { insertMock } = mockSupabase(() => Promise.reject(new Error('network failure')))
    const handler = await loadHandler()

    const req = createRequest({ body: { message: 'boom' } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Unexpected error' })
    expect(insertMock).toHaveBeenCalledTimes(1)
  })
})
