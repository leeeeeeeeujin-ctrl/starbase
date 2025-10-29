/* eslint-env jest */
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('cross-fetch');

const { savePrompt, listRunsForPrompt, saveRun } = require('../lib/promptStore');
const { renderTemplate } = require('../lib/promptRenderer');
const { verifyProviderResponse } = require('../lib/providers/verifyProviderResponse');

describe('device runner integration (in-process mock)', () => {
  let server;
  let url;
  const SECRET = 'test-secret';

  beforeAll(done => {
    const app = express();
    app.use(bodyParser.json());
    app.post('/run', (req, res) => {
      const s = req.header('x-runner-secret');
      if (!s || s !== SECRET) return res.status(401).json({ error: 'unauthorized' });
      const { prompt } = req.body || {};
      if (!prompt) return res.status(400).json({ error: 'missing prompt' });
      const out = `MOCK-GEMINI-RESP: ${String(prompt).trim()}`;
      res.json({ text: out, raw: out });
    });

    server = app.listen(0, () => {
      const p = server.address().port;
      url = `http://127.0.0.1:${p}`;
      done();
    });
  });

  afterAll(done => {
    if (server && server.close) server.close(done);
    else done();
  });

  test('full device-run -> verify -> save', async () => {
    const prompt = savePrompt({ id: 'int-device-1', name: 'int device', body: 'Hello {{name}}' });
    const input = { name: 'CIUser' };
    const rendered = renderTemplate(prompt.body, input);

    // call mock runner
    const res = await fetch(url + '/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-runner-secret': SECRET },
      body: JSON.stringify({ prompt: rendered }),
    });
    expect(res.status).toBe(200);
    const jr = await res.json();

    const providerResponse = { text: jr.text || '', rendered_prompt: rendered, raw: jr };
    const verification = verifyProviderResponse({ renderedPrompt: rendered, providerResponse });
    expect(verification.verified).toBe(true);

    const stored = saveRun({
      prompt_id: prompt.id,
      prompt_version: prompt.version,
      input,
      rendered_prompt: rendered,
      provider: 'client',
      provider_response: verification.sanitizedResponse || providerResponse,
      status: verification.verified ? 'ok' : 'unverified',
    });
    expect(stored).toBeDefined();

    const runs = listRunsForPrompt(prompt.id);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    const saved = runs.find(r => r.id === stored.id);
    expect(saved).toBeDefined();
    expect(saved.status).toBe('ok');
  });
});
