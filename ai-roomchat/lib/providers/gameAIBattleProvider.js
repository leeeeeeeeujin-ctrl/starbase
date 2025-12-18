// Shared HTTP-based LLM provider for game battle judgement.
//
// This module centralizes:
// - provider/key resolution (OpenAI, Gemini, simple Anthropic passthrough)
// - HTTP call wrappers for each provider
// - a single `callAIJudge(prompt, apiKeyOverride)` entrypoint
//
// NOTE:
// - Prompt construction 및 응답 파싱(parseAIResponse)은 호출 측에서 담당한다.
// - 여기서는 "프롬프트 문자열 → LLM 원본 응답 문자열"만 책임진다.

function resolveAIProvider(apiKeyOverride) {
  const override = typeof apiKeyOverride === 'string' ? apiKeyOverride.trim() : '';

  let provider = null;
  let apiKey = null;

  if (override) {
    if (override.startsWith('sk-')) {
      provider = 'openai';
      apiKey = override;
    } else if (override.startsWith('AIza')) {
      provider = 'gemini';
      apiKey = override;
    }
  }

  if (!provider) {
    if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
      apiKey = process.env.OPENAI_API_KEY;
    } else if (process.env.GEMINI_API_KEY) {
      provider = 'gemini';
      apiKey = process.env.GEMINI_API_KEY;
    } else if (process.env.ANTHROPIC_API_KEY) {
      // 임시: Anthropic 키가 설정된 경우에도 OpenAI 경로로 취급
      provider = 'openai';
      apiKey = process.env.ANTHROPIC_API_KEY;
    }
  }

  return { provider, apiKey };
}

async function callGemini(prompt, apiKey) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const version = process.env.GEMINI_API_VERSION || 'v1beta';
  const endpoint = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    let msg = `AI API 호출 실패: ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      msg += ' Unauthorized';
    } else if (response.status === 429) {
      msg += ' rate limit';
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const first = candidates[0] || {};
  const parts = (first.content && first.content.parts) || first.parts || [];
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  return text || JSON.stringify(data);
}

async function callOpenAI(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: '당신은 게임 배틀 심판 AI입니다. 공정하고 흥미진진한 판정을 내려주세요.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 500,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    let msg = `AI API 호출 실패: ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      msg += ' Unauthorized';
    } else if (response.status === 429) {
      msg += ' rate limit';
    }
    throw new Error(msg);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function callAIJudge(prompt, apiKeyOverride) {
  const { provider, apiKey } = resolveAIProvider(apiKeyOverride);

  if (!provider || !apiKey) {
    throw new Error('AI API 키가 설정되지 않았습니다');
  }

  if (typeof prompt !== 'string') {
    prompt = String(prompt ?? '');
  }

  try {
    if (provider === 'gemini') {
      return await callGemini(prompt, apiKey);
    }
    return await callOpenAI(prompt, apiKey);
  } catch (error) {
    // 상위에서 에러 카테고리/폴백을 처리할 수 있도록 그대로 전파
    throw error;
  }
}

