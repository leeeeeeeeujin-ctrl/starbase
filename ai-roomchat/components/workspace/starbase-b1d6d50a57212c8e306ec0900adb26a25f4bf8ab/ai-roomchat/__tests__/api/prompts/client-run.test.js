/* eslint-env jest */
const { savePrompt, listRunsForPrompt } = require('../../../lib/promptStore');

describe('POST /api/prompts/:id/run (client-submitted)', () => {
  const handler = require('../../../pages/api/prompts/[id]/run').default;

  test('accepts client provider_response and marks verified when rendered_prompt matches', async () => {
    // create a prompt
    const prompt = savePrompt({ id: 'prompt-client-1', name: 'test', body: 'Hello {{name}}' });

    const req = {
      method: 'POST',
      query: { id: prompt.id },
      body: {
        provider: 'client',
        input: { name: 'Alice' },
        provider_response: { text: 'Hello Alice', rendered_prompt: 'Hello Alice' },
        source: 'client',
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      end: jest.fn(),
      setHeader: jest.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    const respArg = res.json.mock.calls[0][0];
    expect(respArg).toHaveProperty('runId');
    expect(respArg).toHaveProperty('verified', true);

    // ensure runs stored in memory include this prompt id
    const runs = listRunsForPrompt(prompt.id);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    const saved = runs.find(r => r.id === respArg.runId);
    expect(saved).toBeDefined();
    expect(saved.status === 'ok' || saved.status === 'unverified').toBeTruthy();
  });
});
