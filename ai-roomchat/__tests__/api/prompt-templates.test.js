const fs = require('fs');
const path = require('path');

// Import the API handler
const handler = require('../../pages/api/prompt-templates/index.js').default;

const DATA_FILE = path.join(process.cwd(), 'ai-roomchat', 'data', 'prompt_templates.json');

function makeMock(method, body) {
  const req = { method, body };
  let _status = null;
  let _json = null;

  const res = {
    status(s) { _status = s; return res; },
    json(d) { _json = d; return res; },
    setHeader() { return res; },
    end() { return res; },
    get statusCode() { return _status; },
    get _json() { return _json; }
  };

  return { req, res };
}

beforeEach(() => {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
});

afterAll(() => {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
});

test('GET returns empty items when none exist', async () => {
  const { req, res } = makeMock('GET');
  await handler(req, res);
  expect(res.statusCode).toBe(200);
  expect(res._json).toBeDefined();
  expect(Array.isArray(res._json.items)).toBe(true);
  expect(res._json.items.length).toBe(0);
});

test('POST missing fields returns 400', async () => {
  const { req, res } = makeMock('POST', { name: 'only-name' });
  await handler(req, res);
  expect(res.statusCode).toBe(400);
  expect(res._json).toBeDefined();
  expect(res._json.error).toBeDefined();
});

test('POST creates an item and GET returns it', async () => {
  const { req: postReq, res: postRes } = makeMock('POST', { name: 't1', body: 'hello world' });
  await handler(postReq, postRes);
  expect(postRes.statusCode).toBe(201);
  expect(postRes._json).toBeDefined();
  const created = postRes._json.item;
  expect(created).toHaveProperty('id');
  expect(created.name).toBe('t1');

  const { req: getReq, res: getRes } = makeMock('GET');
  await handler(getReq, getRes);
  expect(getRes.statusCode).toBe(200);
  expect(getRes._json.items.length).toBe(1);
  expect(getRes._json.items[0].name).toBe('t1');
});
