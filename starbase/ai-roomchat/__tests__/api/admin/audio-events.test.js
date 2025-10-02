const crypto = require('crypto')
const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals')
const {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
  createSupabaseSelectChain,
} = require('../testUtils')

function loadHandler() {
  return loadApiRoute('admin', 'audio-events')
}

describe('GET /api/admin/audio-events', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.ADMIN_PORTAL_PASSWORD
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('rejects non-GET methods', async () => {
    const chain = createSupabaseSelectChain({ data: [], error: null })
    registerSupabaseAdminMock(chain.fromMock)

    process.env.ADMIN_PORTAL_PASSWORD = 'secret'
    const handler = loadHandler()

    const req = createApiRequest({ method: 'POST' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toEqual(['GET'])
    expect(chain.fromMock).not.toHaveBeenCalled()
  })

  it('requires the admin password to be configured', async () => {
    const chain = createSupabaseSelectChain({ data: [], error: null })
    registerSupabaseAdminMock(chain.fromMock)

    const handler = loadHandler()
    const req = createApiRequest()
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Admin portal password is not configured' })
  })

  it('rejects missing session tokens', async () => {
    const chain = createSupabaseSelectChain({ data: [], error: null })
    registerSupabaseAdminMock(chain.fromMock)

    process.env.ADMIN_PORTAL_PASSWORD = 'secret'
    const handler = loadHandler()

    const req = createApiRequest({ headers: { cookie: '' } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Missing session token' })
    expect(chain.fromMock).not.toHaveBeenCalled()
  })

  it('rejects invalid session tokens', async () => {
    const chain = createSupabaseSelectChain({ data: [], error: null })
    registerSupabaseAdminMock(chain.fromMock)

    const password = 'secret'
    process.env.ADMIN_PORTAL_PASSWORD = password
    const handler = loadHandler()

    const req = createApiRequest({ headers: { cookie: 'rank_admin_portal_session=invalid' } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid session token' })
    expect(chain.fromMock).not.toHaveBeenCalled()
  })

  it('returns filtered audio events with stats', async () => {
    const password = 'secret'
    process.env.ADMIN_PORTAL_PASSWORD = password
    const handler = loadHandler()

    const now = new Date('2025-02-01T15:00:00Z')
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const until = new Date(now.getTime() + 60 * 60 * 1000)

    const events = [
      {
        id: '1',
        created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        owner_id: 'owner-a',
        profile_key: 'hero:alpha',
        hero_id: 'hero-a',
        hero_name: '알파',
        hero_source: 'origin',
        event_type: 'preference.updated',
        details: {
          changedFields: ['trackId', 'presetId'],
          preference: { trackId: 'track-a', presetId: 'preset-a', manualOverride: false },
        },
      },
      {
        id: '2',
        created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        owner_id: 'owner-b',
        profile_key: 'hero:beta',
        hero_id: 'hero-b',
        hero_name: '베타',
        hero_source: 'origin',
        event_type: 'preset.applied',
        details: {
          changedFields: ['presetId'],
          preference: { trackId: 'track-b', presetId: 'preset-b', manualOverride: true },
        },
      },
    ]

    const chain = createSupabaseSelectChain({ data: events, error: null })
    registerSupabaseAdminMock(chain.fromMock)

    const sessionToken = crypto.createHash('sha256').update(password).digest('hex')

    const req = createApiRequest({
      headers: { cookie: `rank_admin_portal_session=${sessionToken}` },
      query: {
        limit: '200',
        ownerId: 'owner-a',
        profileKey: 'hero:alpha',
        heroId: 'hero-a',
        eventType: 'preference.updated',
        since: since.toISOString(),
        until: until.toISOString(),
        search: 'track-a',
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(chain.fromMock).toHaveBeenCalledWith('rank_audio_events')
    expect(chain.selectMock).toHaveBeenCalledWith(
      'id, owner_id, profile_key, hero_id, hero_name, hero_source, event_type, details, created_at',
    )
    expect(chain.eqMock).toHaveBeenCalledWith('owner_id', 'owner-a')
    expect(chain.eqMock).toHaveBeenCalledWith('profile_key', 'hero:alpha')
    expect(chain.eqMock).toHaveBeenCalledWith('hero_id', 'hero-a')
    expect(chain.inMock).toHaveBeenCalledWith('event_type', ['preference.updated'])
    expect(chain.gteMock).toHaveBeenCalledWith('created_at', since.toISOString())
    expect(chain.lteMock).toHaveBeenCalledWith('created_at', until.toISOString())
    expect(chain.orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chain.limitMock).toHaveBeenCalledWith(200)

    expect(res.statusCode).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].id).toBe('1')
    expect(res.body.stats).toEqual({
      total: 1,
      uniqueOwners: 1,
      uniqueProfiles: 1,
      byEventType: { 'preference.updated': 1 },
    })
    expect(res.body.availableEventTypes).toEqual(['preference.updated', 'preset.applied'])
  })

  it('returns weekly trend data when requested', async () => {
    const password = 'secret'
    process.env.ADMIN_PORTAL_PASSWORD = password
    const handler = loadHandler()

    const rpcMock = jest.fn((name, params) => {
      if (name === 'rank_audio_events_weekly_trend') {
        return Promise.resolve({
          data: [
            {
              week_start: '2025-09-29T00:00:00+00:00',
              event_count: '5',
              unique_owners: '3',
              unique_profiles: '4',
            },
            {
              week_start: '2025-10-06T00:00:00+00:00',
              event_count: 2,
              unique_owners: 2,
              unique_profiles: 2,
            },
          ],
          error: null,
        })
      }
      if (name === 'rank_audio_events_weekly_breakdown') {
        if (params.mode === 'hero') {
          return Promise.resolve({
            data: [
              { week_start: '2025-09-29T00:00:00+00:00', dimension_id: 'hero-a', dimension_label: '알파', event_count: 3 },
              { week_start: '2025-09-29T00:00:00+00:00', dimension_id: 'hero-b', dimension_label: '베타', event_count: 2 },
            ],
            error: null,
          })
        }
        return Promise.resolve({
          data: [
            { week_start: '2025-09-29T00:00:00+00:00', dimension_id: 'owner-123', dimension_label: 'owner-123', event_count: 5 },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: [], error: null })
    })

    registerSupabaseAdminMock(() => ({ select: () => ({}) }), rpcMock)

    const sessionToken = crypto.createHash('sha256').update(password).digest('hex')

    const req = createApiRequest({
      headers: { cookie: `rank_admin_portal_session=${sessionToken}` },
      query: {
        trend: 'weekly',
        lookbackWeeks: '8',
        ownerId: 'owner-123',
        profileKey: 'hero:abc',
        heroId: 'hero-xyz',
        eventType: 'preset.applied,preference.updated',
      },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(rpcMock).toHaveBeenCalledWith('rank_audio_events_weekly_trend', {
      start_timestamp: expect.any(String),
      end_timestamp: expect.any(String),
      owner_filter: 'owner-123',
      profile_filter: 'hero:abc',
      hero_filter: 'hero-xyz',
      event_type_filter: ['preset.applied', 'preference.updated'],
    })

    expect(rpcMock).toHaveBeenCalledWith('rank_audio_events_weekly_breakdown', expect.objectContaining({
      mode: 'hero',
      owner_filter: 'owner-123',
      profile_filter: 'hero:abc',
      hero_filter: 'hero-xyz',
    }))
    expect(rpcMock).toHaveBeenCalledWith('rank_audio_events_weekly_breakdown', expect.objectContaining({
      mode: 'owner',
      owner_filter: 'owner-123',
      profile_filter: 'hero:abc',
      hero_filter: 'hero-xyz',
    }))

    expect(res.statusCode).toBe(200)
    expect(res.body.range.lookbackWeeks).toBe(8)
    expect(typeof res.body.range.since).toBe('string')
    expect(res.body.buckets).toEqual([
      {
        weekStart: '2025-09-29T00:00:00+00:00',
        eventCount: 5,
        uniqueOwners: 3,
        uniqueProfiles: 4,
      },
      {
        weekStart: '2025-10-06T00:00:00+00:00',
        eventCount: 2,
        uniqueOwners: 2,
        uniqueProfiles: 2,
      },
    ])
    expect(res.body.breakdown.hero).toEqual([
      {
        weekStart: '2025-09-29T00:00:00+00:00',
        dimensionId: 'hero-a',
        dimensionLabel: '알파',
        eventCount: 3,
      },
      {
        weekStart: '2025-09-29T00:00:00+00:00',
        dimensionId: 'hero-b',
        dimensionLabel: '베타',
        eventCount: 2,
      },
    ])
    expect(res.body.breakdown.owner).toEqual([
      {
        weekStart: '2025-09-29T00:00:00+00:00',
        dimensionId: 'owner-123',
        dimensionLabel: 'owner-123',
        eventCount: 5,
      },
    ])
  })

  it('returns CSV when requested', async () => {
    const password = 'secret'
    process.env.ADMIN_PORTAL_PASSWORD = password
    const handler = loadHandler()

    const events = [
      {
        id: '1',
        created_at: '2025-02-01T00:00:00Z',
        owner_id: 'owner-a',
        profile_key: 'hero:alpha',
        hero_id: 'hero-a',
        hero_name: '알파',
        hero_source: 'origin',
        event_type: 'preference.updated',
        details: {
          changedFields: ['trackId'],
          preference: { trackId: 'track-a', presetId: 'preset-a', manualOverride: false },
        },
      },
    ]

    const chain = createSupabaseSelectChain({ data: events, error: null })
    registerSupabaseAdminMock(chain.fromMock)

    const sessionToken = crypto.createHash('sha256').update(password).digest('hex')

    const req = createApiRequest({
      headers: { cookie: `rank_admin_portal_session=${sessionToken}` },
      query: { format: 'csv' },
    })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['Content-Disposition']).toContain('rank-audio-events-')
    expect(res.body).toContain('id,created_at,owner_id,profile_key,hero_id,hero_name,hero_source,event_type,changed_fields,track_id,preset_id,manual_override')
    expect(res.body).toContain('1,2025-02-01T00:00:00Z,owner-a,hero:alpha,hero-a,알파,origin,preference.updated,trackId,track-a,preset-a,false')
  })

  it('propagates Supabase errors', async () => {
    const chain = createSupabaseSelectChain({ data: null, error: { message: 'db fail' } })
    registerSupabaseAdminMock(chain.fromMock)

    const password = 'secret'
    process.env.ADMIN_PORTAL_PASSWORD = password
    const handler = loadHandler()

    const sessionToken = crypto.createHash('sha256').update(password).digest('hex')
    const req = createApiRequest({ headers: { cookie: `rank_admin_portal_session=${sessionToken}` } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to fetch audio events' })
  })

  it('handles unexpected errors', async () => {
    registerSupabaseAdminMock(() => {
      throw new Error('boom')
    })

    const password = 'secret'
    process.env.ADMIN_PORTAL_PASSWORD = password
    const handler = loadHandler()

    const sessionToken = crypto.createHash('sha256').update(password).digest('hex')
    const req = createApiRequest({ headers: { cookie: `rank_admin_portal_session=${sessionToken}` } })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Unexpected error' })
  })
})
