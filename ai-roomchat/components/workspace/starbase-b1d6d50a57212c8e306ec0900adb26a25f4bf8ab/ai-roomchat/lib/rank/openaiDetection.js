const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function sanitizeDetail(detail) {
  if (typeof detail !== 'string') {
    return '';
  }
  return detail.trim().slice(0, 500);
}

let cachedFetchImpl = null;

async function getRuntimeFetch() {
  if (typeof fetch === 'function') {
    return fetch;
  }
  if (!cachedFetchImpl) {
    const mod = await import('node-fetch');
    cachedFetchImpl = mod.default;
  }
  return cachedFetchImpl;
}

function buildNetworkError(error) {
  const detail = error?.message ? sanitizeDetail(error.message) : '';
  return {
    error: 'ai_network_error',
    detail,
    status: null,
  };
}

function deriveOpenAIError(status, rawBody) {
  const parsed = safeParseJson(rawBody);
  const message = parsed?.error?.message || parsed?.error?.code || sanitizeDetail(rawBody);

  if (status === 401) {
    return { error: 'invalid_user_api_key', detail: message, status };
  }
  if (status === 429) {
    return { error: 'quota_exhausted', detail: message, status };
  }
  if (status === 403) {
    return { error: 'invalid_user_api_key', detail: message, status };
  }
  if (!message) {
    return { error: 'ai_failed', detail: '', status };
  }
  return { error: 'ai_failed', detail: message, status };
}

async function probeResponses(apiKey) {
  const runtimeFetch = await getRuntimeFetch();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const body = {
    model: DEFAULT_OPENAI_MODEL,
    input: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'ping' }],
      },
    ],
    max_output_tokens: 1,
    temperature: 0,
  };

  let resp;
  try {
    resp = await runtimeFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ...buildNetworkError(error), ok: false };
  }

  let text = '';
  try {
    text = await resp.text();
  } catch (error) {
    const network = buildNetworkError(error);
    return { ...network, ok: false, status: resp?.status ?? network.status };
  }

  if (resp.ok) {
    const json = safeParseJson(text);
    const model = typeof json?.model === 'string' ? json.model : DEFAULT_OPENAI_MODEL;
    return { ok: true, status: resp.status, model };
  }

  const derived = deriveOpenAIError(resp.status, text);
  return { ok: false, ...derived };
}

async function probeChat(apiKey) {
  const runtimeFetch = await getRuntimeFetch();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const body = {
    model: DEFAULT_OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'Respond with ok.' },
      { role: 'user', content: 'ok' },
    ],
    max_tokens: 1,
    temperature: 0,
  };

  let resp;
  try {
    resp = await runtimeFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ...buildNetworkError(error), ok: false };
  }

  let text = '';
  try {
    text = await resp.text();
  } catch (error) {
    const network = buildNetworkError(error);
    return { ...network, ok: false, status: resp?.status ?? network.status };
  }

  if (resp.ok) {
    const json = safeParseJson(text);
    const model = typeof json?.model === 'string' ? json.model : DEFAULT_OPENAI_MODEL;
    return { ok: true, status: resp.status, model };
  }

  const derived = deriveOpenAIError(resp.status, text);
  return { ok: false, ...derived };
}

function mapProbeToTry(apiVersion, probe) {
  return {
    apiVersion,
    ok: !!probe.ok,
    status: probe.status ?? null,
    error: probe.ok ? null : probe.error || null,
    detail: probe.ok ? '' : probe.detail || '',
  };
}

export async function detectOpenAIPreset({ apiKey }) {
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmedKey) {
    return {
      ok: false,
      status: 400,
      errorCode: 'missing_user_api_key',
      detail: 'API 키가 필요합니다.',
      tries: [],
    };
  }

  const tries = [];

  const responsesProbe = await probeResponses(trimmedKey);
  tries.push(mapProbeToTry('responses', responsesProbe));

  if (responsesProbe.ok) {
    return {
      ok: true,
      apiVersion: 'responses',
      model: responsesProbe.model || DEFAULT_OPENAI_MODEL,
      fallback: false,
      detail: 'OpenAI Responses API v2 호출이 성공했습니다.',
      tries,
    };
  }

  if (responsesProbe.error === 'invalid_user_api_key') {
    return {
      ok: false,
      status: responsesProbe.status || 401,
      errorCode: 'invalid_user_api_key',
      detail: responsesProbe.detail || 'API 키가 올바르지 않습니다.',
      tries,
    };
  }

  if (responsesProbe.error === 'quota_exhausted') {
    return {
      ok: false,
      status: responsesProbe.status || 429,
      errorCode: 'quota_exhausted',
      detail: responsesProbe.detail || '요청 한도를 초과했습니다.',
      tries,
    };
  }

  const chatProbe = await probeChat(trimmedKey);
  tries.push(mapProbeToTry('chat_completions', chatProbe));

  if (chatProbe.ok) {
    const fallbackDetail = responsesProbe.error
      ? 'Responses API v2 호출이 거부되어 Chat Completions로 전환했습니다.'
      : 'OpenAI Chat Completions 호출이 성공했습니다.';
    return {
      ok: true,
      apiVersion: 'chat_completions',
      model: chatProbe.model || DEFAULT_OPENAI_MODEL,
      fallback: true,
      detail: fallbackDetail,
      tries,
    };
  }

  const invalidProbe = [responsesProbe, chatProbe].find(
    entry => entry.error === 'invalid_user_api_key'
  );
  if (invalidProbe) {
    return {
      ok: false,
      status: invalidProbe.status || 401,
      errorCode: 'invalid_user_api_key',
      detail: invalidProbe.detail || 'API 키가 올바르지 않습니다.',
      tries,
    };
  }

  const quotaProbe = [responsesProbe, chatProbe].find(entry => entry.error === 'quota_exhausted');
  if (quotaProbe) {
    return {
      ok: false,
      status: quotaProbe.status || 429,
      errorCode: 'quota_exhausted',
      detail: quotaProbe.detail || '요청 한도를 초과했습니다.',
      tries,
    };
  }

  const networkProbe = [responsesProbe, chatProbe].find(
    entry => entry.error === 'ai_network_error'
  );
  if (networkProbe) {
    return {
      ok: false,
      status: networkProbe.status || 502,
      errorCode: 'ai_network_error',
      detail: networkProbe.detail || '네트워크 오류가 발생했습니다.',
      tries,
    };
  }

  const firstFailure = [responsesProbe, chatProbe].find(entry => entry.error);
  return {
    ok: false,
    status: firstFailure?.status || 500,
    errorCode: firstFailure?.error || 'detect_failed',
    detail: firstFailure?.detail || 'OpenAI 버전을 확인하지 못했습니다.',
    tries,
  };
}
