import fs from 'fs';
import path from 'path';
import handler from '../../../pages/api/audit/log';

function makeReq(body) {
  return { method: 'POST', body };
}

function makeRes() {
  const res = {};
  res.status = code => {
    res._status = code;
    return res;
  };
  res.json = obj => {
    res._json = obj;
    return res;
  };
  return res;
}

describe('POST /api/audit/log (file-backed)', () => {
  const storePath = path.join(process.cwd(), 'ai-roomchat', 'data', 'audit-logs.json');

  beforeEach(() => {
    try {
      if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
    } catch (e) {}
  });

  afterEach(() => {
    try {
      if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
    } catch (e) {}
  });

  test('writes audit record to file-backed store', async () => {
    const req = makeReq({ actor_id: 'u1', prompt_id: 'p1', action: 'run', input: { foo: 'bar' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(201);
    expect(res._json).toHaveProperty('id');
    expect(res._json.stored).toBe('file');

    const raw = fs.readFileSync(storePath, 'utf8');
    const data = JSON.parse(raw || '{}');
    const keys = Object.keys(data);
    expect(keys.length).toBeGreaterThan(0);
    const rec = data[keys[0]];
    expect(rec).toHaveProperty('actor_id', 'u1');
    expect(rec).toHaveProperty('prompt_id', 'p1');
  });
});
