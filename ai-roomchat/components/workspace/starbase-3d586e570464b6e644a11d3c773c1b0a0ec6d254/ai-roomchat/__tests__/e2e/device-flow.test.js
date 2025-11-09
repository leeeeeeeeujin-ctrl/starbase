const registerHandler = require('../../../pages/api/devices/register').default;
const verifyHandler = require('../../../pages/api/devices/verify').default;
const runHandler = require('../../../pages/api/prompts/[id]/run').default;
const { savePrompt, listRunsForPrompt } = require('../../../lib/promptStore');
const { verifyToken } = require('../../../lib/security/token');

function makeReq({ method = 'POST', body = null, headers = {}, query = {} } = {}) {
  return { method, body, headers, query };
}

function makeRes() {
  let status = 200;
  let json = null;
  return {
    status(s) { status = s; return this; },
    json(obj) { json = obj; return this; },
    end(v) { json = json || v; return this; },
    get _status() { return status; },
    get _json() { return json; }
  };
}

describe('device registration -> run flow', () => {
  const originalSecret = process.env.RUN_DEVICE_SECRET;
  beforeAll(() => {
    process.env.RUN_DEVICE_SECRET = 'test-device-secret-xyz';
  });
  afterAll(() => {
    process.env.RUN_DEVICE_SECRET = originalSecret;
  });

  test('register device, verify token, submit run with device token', async () => {
    // register
    const reqReg = makeReq({ method: 'POST', body: { displayName: 'test-device' } });
    const resReg = makeRes();
    await registerHandler(reqReg, resReg);
    expect(resReg._status).toBe(200);
    expect(resReg._json).toBeTruthy();
    const token = resReg._json.token;
    expect(typeof token).toBe('string');

    // verify
    const reqVer = makeReq({ method: 'POST', body: { token } });
    const resVer = makeRes();
    await verifyHandler(reqVer, resVer);
    expect(resVer._status).toBe(200);
    expect(resVer._json && resVer._json.payload).toBeTruthy();

    // create prompt
    savePrompt({ id: 'e2e-prompt', name: 'E2E', body: 'Hello {{name}}' });

    // submit a client run
    const body = {
      provider: 'client',
      input: { name: 'Tester' },
      provider_response: { text: 'Hello Tester', rendered_prompt: 'Hello Tester' },
      source: 'client'
    };
    const reqRun = makeReq({ method: 'POST', body, headers: { 'x-device-token': token }, query: { id: 'e2e-prompt' } });
    const resRun = makeRes();
    await runHandler(reqRun, resRun);
    expect(resRun._status === 200 || resRun._status === 201).toBeTruthy();
    expect(resRun._json).toBeTruthy();

    // check persisted run
    const runs = listRunsForPrompt('e2e-prompt');
    expect(runs.length).toBeGreaterThan(0);
    const found = runs.find(r => r.device_token === token || r.device_id === resVer._json.payload.deviceId || r.device_display_name === 'test-device');
    expect(found).toBeTruthy();
  }, 20000);
});
