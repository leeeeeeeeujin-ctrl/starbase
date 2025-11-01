const handler = require('../../pages/api/prompt-templates/[id].js').default;
const indexHandler = require('../../pages/api/prompt-templates/index.js').default;
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'ai-roomchat', 'data', 'prompt_templates.json');

function makeMock(method, body, query) {
  const req = { method, body, query };
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

test('GET by id returns 404 when missing', async () => {
  const { req, res } = makeMock('GET', null, { id: 'nope' });
  await handler(req, res);
  expect(res.statusCode).toBe(404);
});

test('CRUD flow via id endpoint (create -> get -> put -> delete)', async () => {
  // create via index POST
  const { req: postReq, res: postRes } = makeMock('POST', { name: 't2', body: 'body2' });
  await indexHandler(postReq, postRes);
  expect(postRes.statusCode).toBe(201);
  const created = postRes._json.item;
  expect(created).toHaveProperty('id');

  // GET by id
  const { req: getReq, res: getRes } = makeMock('GET', null, { id: created.id });
  await handler(getReq, getRes);
  expect(getRes.statusCode).toBe(200);
  expect(getRes._json.item.name).toBe('t2');

  // PUT update
  const { req: putReq, res: putRes } = makeMock('PUT', { name: 't2-mod' }, { id: created.id });
  await handler(putReq, putRes);
  expect(putRes.statusCode).toBe(200);
  expect(putRes._json.item.name).toBe('t2-mod');

  // DELETE
  const { req: delReq, res: delRes } = makeMock('DELETE', null, { id: created.id });
  await handler(delReq, delRes);
  expect(delRes.statusCode).toBe(204);

  // GET should 404
  const { req: get2Req, res: get2Res } = makeMock('GET', null, { id: created.id });
  await handler(get2Req, get2Res);
  expect(get2Res.statusCode).toBe(404);
});
