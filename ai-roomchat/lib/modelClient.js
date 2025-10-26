// lib/modelClient.js

import {
  DEFAULT_GEMINI_MODE,
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '@/lib/rank/geminiConfig';

function ellipsize(text, max = 120) {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getFetchImpl(provided) {
  if (typeof provided === 'function') {
    return provided;
  }
  if (typeof fetch === 'function') {
    return fetch;
  }
  return null;
}

function buildGeminiUrl(mode, model) {
  const normalizedMode = normalizeGeminiMode(mode || DEFAULT_GEMINI_MODE);
  const normalizedModel = normalizeGeminiModelId(model || DEFAULT_GEMINI_MODEL);
  const baseUrl =
    normalizedMode === 'v1'
      ? 'https://generativelanguage.googleapis.com/v1/models'
      : 'https://generativelanguage.googleapis.com/v1beta/models';
  return {
    url: `${baseUrl}/${normalizedModel}:generateContent`,
    mode: normalizedMode,
    model: normalizedModel,
  };
}

async function callGeminiDirect({ fetchImpl, apiKey, system, prompt, mode, model }) {
  const { url, mode: normalizedMode, model: normalizedModel } = buildGeminiUrl(mode, model);
  const supportsSystemInstruction = normalizedMode === DEFAULT_GEMINI_MODE;
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };

  const trimmedPrompt = sanitizeText(prompt);
  const trimmedSystem = sanitizeText(system);

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: trimmedPrompt }],
      },
    ],
  };

  if (supportsSystemInstruction && trimmedSystem) {
    body.systemInstruction = {
      role: 'system',
      parts: [{ text: trimmedSystem }],
    };
  } else if (trimmedSystem) {
    body.contents[0] = {
      role: 'user',
      parts: [{ text: `${trimmedSystem}\n\n${trimmedPrompt}`.trim() }],
    };
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, error: error?.message || 'AI 호출 중 네트워크 오류가 발생했습니다.' };
  }

  let text;
  try {
    text = await response.text();
  } catch (error) {
    return { ok: false, error: error?.message || 'AI 응답을 읽지 못했습니다.' };
  }

  if (!response.ok) {
    const detail = text ? ellipsize(text, 200) : '';
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: detail || 'API 키가 유효하지 않습니다.' };
    }
    if (response.status === 429) {
      return { ok: false, error: detail || '요청 한도를 초과했습니다.' };
    }
    return { ok: false, error: detail || 'AI 호출에 실패했습니다.' };
  }

  try {
    const json = text ? JSON.parse(text) : {};
    const parts = json?.candidates?.[0]?.content?.parts;
    const combined = Array.isArray(parts)
      ? parts
          .filter(part => typeof part?.text === 'string')
          .map(part => part.text)
          .join('\n')
      : '';
    return {
      ok: true,
      text: typeof combined === 'string' ? combined : '',
      meta: { provider: 'gemini', mode: normalizedMode, model: normalizedModel },
    };
  } catch (error) {
    return { ok: false, error: 'AI 응답 형식을 파싱하지 못했습니다.' };
  }
}

async function callOpenAIChat({ fetchImpl, apiKey, system, prompt }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      ...(system ? [{ role: 'system', content: sanitizeText(system) }] : []),
      { role: 'user', content: sanitizeText(prompt) },
    ],
    temperature: 0.7,
  };

  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, error: error?.message || 'AI 호출 중 네트워크 오류가 발생했습니다.' };
  }

  let text;
  try {
    text = await response.text();
  } catch (error) {
    return { ok: false, error: error?.message || 'AI 응답을 읽지 못했습니다.' };
  }

  if (!response.ok) {
    const detail = text ? ellipsize(text, 200) : '';
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: detail || 'API 키가 유효하지 않습니다.' };
    }
    if (response.status === 429) {
      return { ok: false, error: detail || '요청 한도를 초과했습니다.' };
    }
    return { ok: false, error: detail || 'AI 호출에 실패했습니다.' };
  }

  try {
    const json = text ? JSON.parse(text) : {};
    const value = json?.choices?.[0]?.message?.content;
    return {
      ok: true,
      text: typeof value === 'string' ? value : '',
      meta: { provider: 'openai', version: 'chat_completions', model: 'gpt-4o-mini' },
    };
  } catch (error) {
    return { ok: false, error: 'AI 응답 형식을 파싱하지 못했습니다.' };
  }
}

async function callOpenAIResponses({ fetchImpl, apiKey, system, prompt }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const input = [];
  if (system) {
    input.push({
      role: 'system',
      content: [{ type: 'text', text: sanitizeText(system) }],
    });
  }
  input.push({
    role: 'user',
    content: [{ type: 'text', text: sanitizeText(prompt) }],
  });

  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'gpt-4o-mini', input, temperature: 0.7 }),
    });
  } catch (error) {
    return { ok: false, error: error?.message || 'AI 호출 중 네트워크 오류가 발생했습니다.' };
  }

  let text;
  try {
    text = await response.text();
  } catch (error) {
    return { ok: false, error: error?.message || 'AI 응답을 읽지 못했습니다.' };
  }

  if (!response.ok) {
    const detail = text ? ellipsize(text, 200) : '';
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: detail || 'API 키가 유효하지 않습니다.' };
    }
    if (response.status === 429) {
      return { ok: false, error: detail || '요청 한도를 초과했습니다.' };
    }
    return { ok: false, error: detail || 'AI 호출에 실패했습니다.' };
  }

  try {
    const json = text ? JSON.parse(text) : {};
    let value = '';
    if (Array.isArray(json?.output)) {
      value = json.output
        .filter(item => item?.type === 'message')
        .flatMap(item => item?.message?.content || [])
        .filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n');
    }
    if (!value && typeof json?.output_text === 'string') {
      value = json.output_text;
    }
    return {
      ok: true,
      text: typeof value === 'string' ? value : '',
      meta: { provider: 'openai', version: 'responses', model: 'gpt-4o-mini' },
    };
  } catch (error) {
    return { ok: false, error: 'AI 응답 형식을 파싱하지 못했습니다.' };
  }
}

export function makeCallModel({
  getKey,
  getApiVersion,
  getGeminiMode,
  getGeminiModel,
  fetchImpl,
} = {}) {
  const runtimeFetch = getFetchImpl(fetchImpl);

  return async function callModel({ system = '', userText = '' } = {}) {
    const apiKey = typeof getKey === 'function' ? sanitizeText(getKey()) : '';
    if (!apiKey) {
      return { ok: false, error: '운영 키가 필요합니다.' };
    }

    if (!runtimeFetch) {
      return { ok: false, error: 'fetch 구현을 찾을 수 없습니다.' };
    }

    const prompt = sanitizeText(userText);
    if (!prompt) {
      return { ok: false, error: '전달할 프롬프트가 비어 있습니다.' };
    }

    const systemPrompt = sanitizeText(system);
    const apiVersionRaw = typeof getApiVersion === 'function' ? getApiVersion() : 'gemini';
    const apiVersion = (apiVersionRaw || 'gemini').trim();

    if (apiVersion === 'gemini') {
      const mode = typeof getGeminiMode === 'function' ? getGeminiMode() : DEFAULT_GEMINI_MODE;
      const model = typeof getGeminiModel === 'function' ? getGeminiModel() : DEFAULT_GEMINI_MODEL;
      return callGeminiDirect({
        fetchImpl: runtimeFetch,
        apiKey,
        system: systemPrompt,
        prompt,
        mode,
        model,
      });
    }

    if (apiVersion === 'responses') {
      return callOpenAIResponses({
        fetchImpl: runtimeFetch,
        apiKey,
        system: systemPrompt,
        prompt,
      });
    }

    return callOpenAIChat({
      fetchImpl: runtimeFetch,
      apiKey,
      system: systemPrompt,
      prompt,
    });
  };
}
