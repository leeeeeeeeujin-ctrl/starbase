// 공용 LLM 호출 레이어
// - Gemini / OpenAI 등의 HTTP 호출 방식을 한곳에 모아서 관리한다.
// - 호출자는 provider / apiKey / model / contents 정도만 넘기고,
//   응답은 "Gemini 스타일" 공통 포맷으로 받는 것을 목표로 한다.

export class LlmProviderError extends Error {
  constructor({ message, status = 500, code = 'llm_error', detail = null } = {}) {
    super(message || 'LLM provider error');
    this.name = 'LlmProviderError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function normalizeProvider(providerHint) {
  if (!providerHint) return null;
  const value = String(providerHint).trim().toLowerCase();
  if (!value) return null;
  if (value === 'openai' || value === 'oai') return 'openai';
  if (value === 'gemini' || value === 'google') return 'gemini';
  return value;
}

export function convertContentsToOpenAIMessages(contents) {
  const messages = [];
  const list = Array.isArray(contents) ? contents : [];
  list.forEach((entry) => {
    if (!entry) return;
    const roleRaw = entry.role || 'user';
    const role =
      roleRaw === 'model'
        ? 'assistant'
        : roleRaw === 'assistant' || roleRaw === 'user' || roleRaw === 'system'
        ? roleRaw
        : 'user';
    const parts = Array.isArray(entry.parts) ? entry.parts : [];
    const text = parts
      .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
      .filter(Boolean)
      .join('\n\n')
      .trim();
    if (!text) return;
    messages.push({ role, content: text });
  });
  return messages;
}

export async function callGeminiWithContents({
  apiKey,
  model = 'gemini-2.5-flash',
  mode = 'v1beta',
  contents,
  generationConfig,
}) {
  if (!apiKey) {
    throw new LlmProviderError({
      message: 'Gemini API key is required',
      status: 401,
      code: 'missing_gemini_key',
    });
  }

  const endpoint = `https://generativelanguage.googleapis.com/${mode}/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: contents || [],
        generationConfig: generationConfig || undefined,
      }),
    });
  } catch (err) {
    throw new LlmProviderError({
      message: 'Failed to reach Gemini API',
      status: 502,
      code: 'gemini_fetch_failed',
      detail: err?.message || String(err),
    });
  }

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // keep raw fallback
  }

  if (!response.ok) {
    const detail = data || { error: text };
    let code = 'gemini_error';
    if (response.status === 403 || response.status === 429) {
      code = 'model_quota_exceeded';
    } else if (response.status === 400) {
      code = 'invalid_gemini_request';
    }
    throw new LlmProviderError({
      message: detail?.error?.message || 'Gemini call failed',
      status: response.status,
      code,
      detail,
    });
  }

  return data || { raw: text };
}

export async function callOpenAIChat({ apiKey, model, contents }) {
  if (!apiKey) {
    throw new LlmProviderError({
      message: 'OpenAI API key is required',
      status: 401,
      code: 'missing_openai_key',
    });
  }

  const messages = convertContentsToOpenAIMessages(contents);
  const effectiveModel = model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        temperature: 0.2,
      }),
    });
  } catch (err) {
    throw new LlmProviderError({
      message: 'Failed to reach OpenAI API',
      status: 502,
      code: 'openai_fetch_failed',
      detail: err?.message || String(err),
    });
  }

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // keep raw fallback
  }

  if (!response.ok) {
    const detail = data || { error: text };
    let code = 'openai_error';
    if (response.status === 403 || response.status === 429) {
      code = 'model_quota_exceeded';
    } else if (response.status === 400 || response.status === 401) {
      code = 'invalid_openai_request';
    }
    throw new LlmProviderError({
      message: detail?.error?.message || 'OpenAI call failed',
      status: response.status,
      code,
      detail,
    });
  }

  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const content = choice?.message?.content || '';
  const assistantText = typeof content === 'string' ? content : '';

  // OpenAI 응답을 Gemini 스타일로 래핑해서 돌려준다.
  return {
    candidates: [
      {
        content: {
          parts: [{ text: assistantText || text }],
        },
      },
    ],
    _provider: 'openai',
    _raw: data || text,
  };
}

export async function callWithContents({
  provider: providerHint,
  apiKey,
  model,
  contents,
  generationConfig,
}) {
  const provider = normalizeProvider(providerHint) || 'gemini';

  if (provider === 'openai') {
    return callOpenAIChat({ apiKey, model, contents });
  }

  // 기본은 Gemini로 처리
  return callGeminiWithContents({
    apiKey,
    model: model || 'gemini-2.5-flash',
    mode: 'v1beta',
    contents,
    generationConfig,
  });
}

