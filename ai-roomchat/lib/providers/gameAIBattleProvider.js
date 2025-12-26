// Shared HTTP-based LLM provider for game battle judgement.
//
// This module centralizes:
// - provider/key resolution (OpenAI, Gemini, simple Anthropic passthrough)
// - a single `callAIJudge(prompt, apiKeyOverride)` entrypoint
//
// NOTE:
// - Prompt construction 및 응답 파싱(parseAIResponse)은 호출 측에서 담당한다.
// - 여기서는 "프롬프트 문자열 → LLM 원본 응답 문자열"만 책임진다.

import { callWithContents } from '../ai/llmRouter';

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

export async function callAIJudge(prompt, apiKeyOverride) {
  const { provider, apiKey } = resolveAIProvider(apiKeyOverride);

  if (!provider || !apiKey) {
    throw new Error('AI API 키가 설정되지 않았습니다');
  }

  if (typeof prompt !== 'string') {
    prompt = String(prompt ?? '');
  }

  const contents = [
    {
      role: 'user',
      parts: [{ text: prompt }],
    },
  ];

  const result = await callWithContents({
    provider,
    apiKey,
    model: undefined,
    contents,
  });

  // Gemini 스타일 응답에서 텍스트만 추출
  if (result && Array.isArray(result.candidates)) {
    const first = result.candidates[0] || {};
    const parts =
      (first.content && first.content.parts) || first.parts || [];
    const text = (parts || [])
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('')
      .trim();
    if (text) {
      return text;
    }
  }

  return JSON.stringify(result);
}
