const path = require('path')

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

function createApiRequest({
  method = 'GET',
  headers = {},
  body,
  query = {},
  ip,
} = {}) {
  const request = {
    method,
    headers,
    query,
    socket: {
      remoteAddress: ip || headers['x-forwarded-for'] || '127.0.0.1',
    },
  }

  if (typeof body !== 'undefined') {
    request.body = body
  }

  return request
}

function loadApiRoute(...segments) {
  const modulePath = path.join(__dirname, '..', '..', 'pages', 'api', ...segments)
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const module = require(modulePath)
  return module.default
}

function registerSupabaseAdminMock(fromImplementation) {
  jest.doMock('@/lib/supabaseAdmin', () => ({
    supabaseAdmin: {
      from: fromImplementation,
    },
  }))
}

function createSupabaseSelectChain(result) {
  const limitMock = jest.fn().mockResolvedValue(result)
  const orderMock = jest.fn(() => ({ limit: limitMock }))
  const selectMock = jest.fn(() => ({ order: orderMock }))
  const fromMock = jest.fn(() => ({ select: selectMock }))
  return { fromMock, selectMock, orderMock, limitMock }
}

function createSupabaseInsertChain(insertImplementation = () => Promise.resolve({ error: null })) {
  const insertMock = jest.fn(insertImplementation)
  const fromMock = jest.fn(() => ({ insert: insertMock }))
  return { fromMock, insertMock }
}

module.exports = {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
  createSupabaseSelectChain,
  createSupabaseInsertChain,
}
