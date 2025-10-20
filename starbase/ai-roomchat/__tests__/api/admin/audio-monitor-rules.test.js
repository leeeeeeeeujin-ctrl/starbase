const crypto = require('crypto')
const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals')

const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
} = require('../testUtils')

function loadHandler() {
  return loadApiRoute('admin', 'audio-monitor-rules')
}

function createSessionCookie(password) {
  const token = crypto.createHash('sha256').update(password).digest('hex')
  return `rank_admin_portal_session=${token}`
}

describe('audio monitor rules API', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.ADMIN_PORTAL_PASSWORD
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('rejects unsupported methods', async () => {
    process.env.ADMIN_PORTAL_PASSWORD = 'secret'

    const fromMock = jest.fn(() => ({
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }))
    registerSupabaseAdminMock(fromMock)

    const handler = loadHandler()

    const req = createApiRequest({ method: 'PATCH', headers: { cookie: createSessionCookie('secret') } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toEqual(['GET', 'POST', 'PUT', 'DELETE'])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('requires configured password', async () => {
    const fromMock = jest.fn(() => ({
      select: jest.fn(),
    }))
    registerSupabaseAdminMock(fromMock)

    const handler = loadHandler()
    const req = createApiRequest({ method: 'GET' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Admin portal password is not configured' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects missing session cookie', async () => {
    process.env.ADMIN_PORTAL_PASSWORD = 'secret'
    const fromMock = jest.fn(() => ({ select: jest.fn() }))
    registerSupabaseAdminMock(fromMock)

    const handler = loadHandler()
    const req = createApiRequest({ method: 'GET', headers: { cookie: '' } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Missing session token' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects invalid session cookie', async () => {
    process.env.ADMIN_PORTAL_PASSWORD = 'secret'
    const fromMock = jest.fn(() => ({ select: jest.fn() }))
    registerSupabaseAdminMock(fromMock)

    const handler = loadHandler()
    const req = createApiRequest({ method: 'GET', headers: { cookie: 'rank_admin_portal_session=invalid' } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid session token' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('returns stored favorites and subscriptions', async () => {
    process.env.ADMIN_PORTAL_PASSWORD = 'secret'

    const selectOrderSecond = jest.fn(() => Promise.resolve({
      data: [
        {
          id: 'fav-1',
          rule_type: 'favorite',
          label: 'Owner 기본',
          notes: 'owner-only',
          config: {
            filters: { ownerId: 'owner-1', eventTypes: ['preset.update'] },
            trend: { stackMode: 'owner', stackLimit: 'top3' },
          },
          sort_order: 2,
          updated_at: '2025-10-01T12:00:00Z',
        },
        {
          id: 'sub-1',
          rule_type: 'subscription',
          label: '히어로 채널',
          notes: '',
          config: {
            filters: { heroId: 'hero-1', range: '7d' },
            trend: { stackMode: 'hero', stackLimit: 'all' },
            slack: { channel: '#bgm', minEvents: 5, lookbackWeeks: 6 },
          },
          sort_order: 1,
          updated_at: '2025-09-30T09:00:00Z',
        },
      ],
      error: null,
    }))
    const selectOrderFirst = jest.fn(() => ({ order: selectOrderSecond }))
    const selectMock = jest.fn(() => ({ order: selectOrderFirst }))

    const fromMock = jest.fn(() => ({ select: selectMock }))
    registerSupabaseAdminMock(fromMock)

    const handler = loadHandler()
    const req = createApiRequest({ method: 'GET', headers: { cookie: createSessionCookie('secret') } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.favorites).toHaveLength(1)
    expect(res.body.subscriptions).toHaveLength(1)
    expect(res.body.favorites[0]).toMatchObject({
      id: 'fav-1',
      label: 'Owner 기본',
      filters: { ownerId: 'owner-1', eventTypes: ['preset.update'] },
      trend: { stackMode: 'owner', stackLimit: 'top3' },
      updatedAt: '2025-10-01T12:00:00Z',
    })
    expect(res.body.subscriptions[0]).toMatchObject({
      id: 'sub-1',
      slack: { channel: '#bgm', minEvents: 5, lookbackWeeks: 6 },
      updatedAt: '2025-09-30T09:00:00Z',
    })
  })

  it('creates a favorite rule', async () => {
    process.env.ADMIN_PORTAL_PASSWORD = 'secret'

    const insertedRecord = {
      id: 'fav-2',
      rule_type: 'favorite',
      label: '최근 24h',
      notes: '',
      config: {
        filters: { ownerId: 'owner-1', range: '24h', eventTypes: [] },
        trend: { stackMode: 'total', stackLimit: 'top5' },
      },
      sort_order: 0,
      updated_at: '2025-10-02T00:00:00Z',
    }

    const selectAfterInsert = jest.fn(() => ({
      single: jest.fn(() => Promise.resolve({ data: insertedRecord, error: null })),
    }))
    const insertMock = jest.fn(() => ({ select: selectAfterInsert }))
    const fromMock = jest.fn(() => ({ insert: insertMock }))
    registerSupabaseAdminMock(fromMock)

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      headers: {
        cookie: createSessionCookie('secret'),
        'content-type': 'application/json',
      },
      body: {
        type: 'favorite',
        label: '최근 24h',
        filters: { ownerId: 'owner-1', range: '24h' },
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        rule_type: 'favorite',
        label: '최근 24h',
      }),
    ])
    expect(res.body.rule).toMatchObject({ id: 'fav-2', type: 'favorite', label: '최근 24h' })
  })

  it('rejects subscription without channel info', async () => {
    process.env.ADMIN_PORTAL_PASSWORD = 'secret'
    const fromMock = jest.fn(() => ({ insert: jest.fn() }))
    registerSupabaseAdminMock(fromMock)

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'POST',
      headers: {
        cookie: createSessionCookie('secret'),
        'content-type': 'application/json',
      },
      body: {
        type: 'subscription',
        label: '잘못된 구독',
        filters: {},
        slack: {},
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Slack channel 또는 Webhook 식별자가 필요합니다.' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('updates an existing subscription', async () => {
    process.env.ADMIN_PORTAL_PASSWORD = 'secret'

    const updatedRecord = {
      id: 'sub-1',
      rule_type: 'subscription',
      label: '업데이트된 구독',
      notes: '메모',
      config: {
        filters: { heroId: 'hero-9' },
        trend: { stackMode: 'hero', stackLimit: 'top3' },
        slack: { channel: '#ops', minEvents: 3, lookbackWeeks: 8, alwaysInclude: true },
      },
      sort_order: 3,
      updated_at: '2025-10-02T10:00:00Z',
    }

    const updateChain = {
      eq: jest.fn(() => ({
        select: jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: updatedRecord, error: null })) })),
      })),
    }
    const updateMock = jest.fn(() => updateChain)

    const fromMock = jest.fn(() => ({ update: updateMock }))
    registerSupabaseAdminMock(fromMock)

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'PUT',
      headers: {
        cookie: createSessionCookie('secret'),
        'content-type': 'application/json',
      },
      body: {
        id: 'sub-1',
        type: 'subscription',
        label: '업데이트된 구독',
        notes: '메모',
        filters: { heroId: 'hero-9' },
        slack: { channel: '#ops', minEvents: 3, lookbackWeeks: 8, alwaysInclude: true },
        sortOrder: 3,
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(updateMock).toHaveBeenCalled()
    expect(res.body.rule).toMatchObject({
      id: 'sub-1',
      type: 'subscription',
      label: '업데이트된 구독',
      slack: { channel: '#ops', minEvents: 3, alwaysInclude: true },
    })
  })

  it('deletes a rule', async () => {
    process.env.ADMIN_PORTAL_PASSWORD = 'secret'

    const deleteChain = {
      eq: jest.fn(() => ({
        select: jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: { id: 'fav-1' }, error: null })) })),
      })),
    }
    const deleteMock = jest.fn(() => deleteChain)

    const fromMock = jest.fn(() => ({ delete: deleteMock }))
    registerSupabaseAdminMock(fromMock)

    const handler = loadHandler()
    const req = createApiRequest({
      method: 'DELETE',
      headers: {
        cookie: createSessionCookie('secret'),
        'content-type': 'application/json',
      },
      body: { id: 'fav-1' },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(deleteMock).toHaveBeenCalled()
    expect(res.body).toEqual({ ok: true })
  })
})
