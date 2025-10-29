// Simple runner to exercise the /api/prompts/:id/run handler using an in-memory prompt and a client-submitted provider_response.
const { savePrompt, listRunsForPrompt } = require('../lib/promptStore');
const handler = require('../pages/api/prompts/[id]/run').default;

async function run() {
  const prompt = savePrompt({ id: 'prompt-client-run-demo', name: 'demo', body: 'Hello {{name}}' });

  const req = {
    method: 'POST',
    query: { id: prompt.id },
    body: {
      provider: 'client',
      input: { name: 'Tester' },
      provider_response: { text: 'Hello Tester', rendered_prompt: 'Hello Tester' },
      source: 'client',
    },
  };

  const res = {
    status(code) {
      this._status = code;
      return this;
    },
    json(obj) {
      this._json = obj;
      return this;
    },
    end() {},
    setHeader() {},
  };

  try {
    await handler(req, res);
    console.log('HTTP status:', res._status);
    console.log('Response JSON:', JSON.stringify(res._json, null, 2));

    const runs = listRunsForPrompt(prompt.id);
    console.log('Stored runs for prompt:', runs.length);
    runs.forEach(r => console.log('-', r.id, r.status));
  } catch (err) {
    console.error('Handler threw:', err && err.stack);
    process.exitCode = 2;
  }
}

run();
