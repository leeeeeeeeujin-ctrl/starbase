import { detectOpenAIPreset } from '@/lib/rank/openaiDetection';

describe('detectOpenAIPreset', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete global.fetch;
  });

  function createResponse(ok, status, payload) {
    const textPayload = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    return {
      ok,
      status,
      text: jest.fn().mockResolvedValue(textPayload),
    };
  }

  it('requires an API key', async () => {
    const result = await detectOpenAIPreset({ apiKey: '' });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('missing_user_api_key');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('detects Responses API when probe succeeds', async () => {
    global.fetch.mockResolvedValueOnce(createResponse(true, 200, { model: 'gpt-4o-mini' }));

    const result = await detectOpenAIPreset({ apiKey: 'sk-valid' });

    expect(result.ok).toBe(true);
    expect(result.apiVersion).toBe('responses');
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.fallback).toBe(false);
    expect(result.tries).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to Chat Completions when Responses fails', async () => {
    global.fetch
      .mockResolvedValueOnce(createResponse(false, 404, { error: { message: 'not found' } }))
      .mockResolvedValueOnce(createResponse(true, 200, { model: 'gpt-4o-mini' }));

    const result = await detectOpenAIPreset({ apiKey: 'sk-fallback' });

    expect(result.ok).toBe(true);
    expect(result.apiVersion).toBe('chat_completions');
    expect(result.fallback).toBe(true);
    expect(result.tries).toHaveLength(2);
    expect(result.detail).toContain('Chat Completions');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns invalid key error without calling chat probe', async () => {
    global.fetch.mockResolvedValueOnce(
      createResponse(false, 401, { error: { message: 'invalid' } })
    );

    const result = await detectOpenAIPreset({ apiKey: 'sk-invalid' });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('invalid_user_api_key');
    expect(result.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('handles network error on first probe and still records tries', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(createResponse(false, 403, { error: { message: 'forbidden' } }));

    const result = await detectOpenAIPreset({ apiKey: 'sk-network' });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('invalid_user_api_key');
    expect(result.tries).toHaveLength(2);
    expect(result.tries[0].error).toBe('ai_network_error');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
