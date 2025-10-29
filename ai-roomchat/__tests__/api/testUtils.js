const path = require('path');

let mockSupabaseFromImplementation;
let mockSupabaseRpcImplementation;

jest.mock('@/lib/supabaseAdmin', () => ({
  __esModule: true,
  createSupabaseAuthConfig: jest.fn((url, { apikey, authorization } = {}) => ({
    headers: {
      ...(apikey ? { apikey } : {}),
      ...(authorization ? { Authorization: authorization } : {}),
    },
    fetch: jest.fn((input, init) => Promise.resolve({ input, init })),
  })),
  supabaseAdmin: {
    from: (...args) => {
      if (typeof mockSupabaseFromImplementation !== 'function') {
        throw new Error('Supabase admin mock not registered');
      }
      return mockSupabaseFromImplementation(...args);
    },
    rpc: (...args) => {
      if (typeof mockSupabaseRpcImplementation !== 'function') {
        throw new Error('Supabase admin RPC mock not registered');
      }
      return mockSupabaseRpcImplementation(...args);
    },
  },
}));

function createMockResponse() {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  return response;
}

function createApiRequest({ method = 'GET', headers = {}, body, query = {}, ip } = {}) {
  const request = {
    method,
    headers,
    query,
    socket: {
      remoteAddress: ip || headers['x-forwarded-for'] || '127.0.0.1',
    },
  };

  if (typeof body !== 'undefined') {
    request.body = body;
  }

  return request;
}

function loadApiRoute(...segments) {
  const modulePath = path.join(__dirname, '..', '..', 'pages', 'api', ...segments);
  let module;
  jest.isolateModules(() => {
    module = require(modulePath);
  });
  return module.default;
}

function registerSupabaseAdminMock(fromImplementation, rpcImplementation) {
  mockSupabaseFromImplementation = fromImplementation;
  mockSupabaseRpcImplementation = rpcImplementation;
}

function registerSupabaseAdminRpcMock(rpcImplementation) {
  mockSupabaseRpcImplementation = rpcImplementation;
}

function createSupabaseSelectChain(result) {
  const limitMock = jest.fn().mockResolvedValue(result);
  const orderMock = jest.fn(() => queryApi);
  const eqMock = jest.fn(() => queryApi);
  const gteMock = jest.fn(() => queryApi);
  const lteMock = jest.fn(() => queryApi);
  const inMock = jest.fn(() => queryApi);
  const ilikeMock = jest.fn(() => queryApi);

  const queryApi = {
    order: orderMock,
    limit: limitMock,
    eq: eqMock,
    gte: gteMock,
    lte: lteMock,
    in: inMock,
    ilike: ilikeMock,
  };

  const selectMock = jest.fn(() => queryApi);
  const fromMock = jest.fn(() => ({ select: selectMock }));
  return {
    fromMock,
    selectMock,
    orderMock,
    limitMock,
    eqMock,
    gteMock,
    lteMock,
    inMock,
    ilikeMock,
  };
}

function createSupabaseInsertChain(insertImplementation = () => Promise.resolve({ error: null })) {
  const insertMock = jest.fn(insertImplementation);
  const fromMock = jest.fn(() => ({ insert: insertMock }));
  return { fromMock, insertMock };
}

module.exports = {
  createApiRequest,
  createMockResponse,
  loadApiRoute,
  registerSupabaseAdminMock,
  registerSupabaseAdminRpcMock,
  createSupabaseSelectChain,
  createSupabaseInsertChain,
};
