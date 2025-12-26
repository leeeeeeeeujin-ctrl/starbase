// apiKeyResolver.js
//
// - 유저/참가자/환경 변수 순서로 "어떤 API 키를 쓸지"를 결정하는 공통 헬퍼.
// - 텍스트 배틀 / 메인게임 / AI 코드 채팅 등이 같은 규칙을 공유할 수 있도록 한다.

import { fetchUserApiKey } from './userApiKeys';

function toTrimmed(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

export async function resolveUserSnapshotKey({ userId, preferProvider } = {}) {
  if (!userId) return null;

  let snapshot = null;
  try {
    snapshot = await fetchUserApiKey(userId, { includeSecret: true });
  } catch (error) {
    console.warn('[apiKeyResolver] failed to fetch user snapshot key:', error);
    return null;
  }

  if (!snapshot || !snapshot.apiKey) {
    return null;
  }

  const provider =
    typeof preferProvider === 'string' && preferProvider.trim()
      ? preferProvider.trim().toLowerCase()
      : 'gemini';

  return {
    apiKey: snapshot.apiKey,
    provider,
    model: snapshot.geminiModel || null,
    apiVersion: snapshot.apiVersion || null,
    geminiMode: snapshot.geminiMode || null,
    source: 'snapshot',
  };
}

export function resolveEnvFallbackKey() {
  const openai = toTrimmed(process.env.OPENAI_API_KEY);
  const gemini = toTrimmed(process.env.GEMINI_API_KEY);
  const anthropic = toTrimmed(process.env.ANTHROPIC_API_KEY);

  if (openai) {
    return {
      apiKey: openai,
      provider: 'openai',
      model: process.env.OPENAI_MODEL || null,
      source: 'env',
    };
  }
  if (gemini) {
    return {
      apiKey: gemini,
      provider: 'gemini',
      model: process.env.GEMINI_MODEL || null,
      source: 'env',
    };
  }
  if (anthropic) {
    // 임시: Anthropic 키도 OpenAI 호환 경로로 취급
    return {
      apiKey: anthropic,
      provider: 'openai',
      model: process.env.OPENAI_MODEL || null,
      source: 'env',
    };
  }

  return null;
}

