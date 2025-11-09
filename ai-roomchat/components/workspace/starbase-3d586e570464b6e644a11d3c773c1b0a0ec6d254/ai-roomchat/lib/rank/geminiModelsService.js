import {
  DEFAULT_GEMINI_MODEL,
  getFallbackGeminiModels,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from './geminiConfig';

function sanitizeDetail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 500);
}

function parseErrorMessage(text) {
  if (!text) return '';
  const trimmed = sanitizeDetail(text);
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    return (
      parsed?.error?.message ||
      parsed?.error?.status ||
      (Array.isArray(parsed?.error?.details)
        ? parsed.error.details
            .map(entry => entry?.reason || entry?.message || '')
            .filter(Boolean)
            .join('\n')
        : '') ||
      ''
    );
  } catch (error) {
    return trimmed;
  }
}

export function extractModelMetadata(model = {}) {
  const id = normalizeGeminiModelId(model?.id || model?.name);
  if (!id) return null;
  const supported = model?.supportedGenerationMethods || model?.supported_generation_methods || [];
  const supportsGenerateContent = Array.isArray(supported)
    ? supported.some(method => method === 'generateContent')
    : false;
  if (!supportsGenerateContent) {
    return null;
  }
  const displayName = typeof model?.displayName === 'string' ? model.displayName.trim() : '';
  const label =
    displayName && displayName.toLowerCase() !== id.toLowerCase()
      ? `${displayName} (${id})`
      : displayName || id;
  const inputTokenLimit = Number.isFinite(Number(model?.inputTokenLimit))
    ? Number(model.inputTokenLimit)
    : Number.isFinite(Number(model?.input_token_limit))
      ? Number(model.input_token_limit)
      : null;
  const outputTokenLimit = Number.isFinite(Number(model?.outputTokenLimit))
    ? Number(model.outputTokenLimit)
    : Number.isFinite(Number(model?.output_token_limit))
      ? Number(model.output_token_limit)
      : null;

  return {
    id,
    label,
    displayName: displayName || id,
    inputTokenLimit,
    outputTokenLimit,
  };
}

function mapStatusToErrorCode(status) {
  if (status === 401 || status === 403) {
    return 'invalid_user_api_key';
  }
  if (status === 429) {
    return 'quota_exhausted';
  }
  if (status === 404) {
    return 'model_not_found';
  }
  return 'list_models_failed';
}

export async function fetchGeminiModelList({ apiKey, mode }) {
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmedKey) {
    return {
      ok: false,
      status: 400,
      errorCode: 'missing_user_api_key',
      detail: 'API 키가 필요합니다.',
    };
  }

  const normalizedMode = normalizeGeminiMode(mode);
  const endpointBase =
    normalizedMode === 'v1'
      ? 'https://generativelanguage.googleapis.com/v1/models'
      : 'https://generativelanguage.googleapis.com/v1beta/models';

  const listUrl = `${endpointBase}?pageSize=200&key=${encodeURIComponent(trimmedKey)}`;

  let response;
  try {
    response = await fetch(listUrl);
  } catch (error) {
    return {
      ok: false,
      status: 502,
      errorCode: 'ai_network_error',
      detail: sanitizeDetail(error?.message || ''),
    };
  }

  let text = '';
  try {
    text = await response.text();
  } catch (error) {
    return {
      ok: false,
      status: 502,
      errorCode: 'ai_network_error',
      detail: sanitizeDetail(error?.message || ''),
    };
  }

  if (!response.ok) {
    const status = response.status || 500;
    const detail = parseErrorMessage(text) || '모델 목록을 불러오지 못했습니다.';
    return {
      ok: false,
      status,
      errorCode: mapStatusToErrorCode(status),
      detail,
    };
  }

  let data = null;
  try {
    data = JSON.parse(text || '{}');
  } catch (error) {
    return {
      ok: false,
      status: response.status || 500,
      errorCode: 'list_models_failed',
      detail: '모델 목록을 해석하지 못했습니다.',
    };
  }

  const models = Array.isArray(data?.models) ? data.models : [];
  const entries = [];
  const seen = new Set();
  models.forEach(model => {
    const mapped = extractModelMetadata(model);
    if (!mapped) return;
    if (seen.has(mapped.id)) return;
    seen.add(mapped.id);
    entries.push(mapped);
  });

  if (!entries.length) {
    const fallback = getFallbackGeminiModels(normalizedMode);
    return {
      ok: true,
      status: response.status || 200,
      models: fallback.map(entry => ({
        id: entry.id,
        label: entry.label,
        displayName: entry.label,
        inputTokenLimit: null,
        outputTokenLimit: null,
      })),
      fallback: true,
      detail: '',
      rawCount: 0,
    };
  }

  entries.sort((a, b) => a.label.localeCompare(b.label));

  return {
    ok: true,
    status: response.status || 200,
    models: entries,
    fallback: false,
    detail: '',
    rawCount: entries.length,
  };
}

function pickRecommendedModel(mode, models = []) {
  const normalizedMode = normalizeGeminiMode(mode);
  const normalizedDefault = normalizeGeminiModelId(DEFAULT_GEMINI_MODEL);
  if (!Array.isArray(models) || !models.length) {
    return normalizedDefault || DEFAULT_GEMINI_MODEL;
  }

  if (normalizedDefault) {
    const match = models.find(
      entry => normalizeGeminiModelId(entry?.id || entry?.name) === normalizedDefault
    );
    if (match) {
      return normalizedDefault;
    }
  }

  const fallbackCatalog = getFallbackGeminiModels(normalizedMode);
  for (const candidate of fallbackCatalog) {
    const normalizedCandidate = normalizeGeminiModelId(candidate?.id);
    if (!normalizedCandidate) continue;
    const exists = models.some(
      entry => normalizeGeminiModelId(entry?.id || entry?.name) === normalizedCandidate
    );
    if (exists) {
      return normalizedCandidate;
    }
  }

  const first = models[0];
  const normalizedFirst = normalizeGeminiModelId(first?.id || first?.name);
  if (normalizedFirst) {
    return normalizedFirst;
  }

  return normalizedDefault || DEFAULT_GEMINI_MODEL;
}

export async function detectGeminiPreset({ apiKey }) {
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
  const successes = [];
  const modes = ['v1beta', 'v1'];

  for (const mode of modes) {
    const result = await fetchGeminiModelList({ apiKey: trimmedKey, mode });
    tries.push({
      mode,
      ok: result.ok,
      status: result.status ?? null,
      error: result.ok ? null : result.errorCode || null,
      detail: result.ok ? '' : result.detail || '',
      fallback: result.ok ? !!result.fallback : false,
    });
    if (result.ok) {
      successes.push({ mode, ...result });
    }
  }

  const preferred =
    successes.find(entry => entry.mode === 'v1beta') ||
    successes.find(entry => entry.mode === 'v1');

  if (preferred) {
    const recommendedModel = pickRecommendedModel(preferred.mode, preferred.models);
    return {
      ok: true,
      mode: normalizeGeminiMode(preferred.mode),
      model: recommendedModel,
      models: preferred.models,
      fallback: !!preferred.fallback,
      tries,
    };
  }

  const invalid = tries.find(entry => entry.error === 'invalid_user_api_key');
  if (invalid) {
    return {
      ok: false,
      status: invalid.status || 401,
      errorCode: invalid.error,
      detail: invalid.detail || 'API 키가 올바르지 않습니다.',
      tries,
    };
  }

  const quota = tries.find(entry => entry.error === 'quota_exhausted');
  if (quota) {
    return {
      ok: false,
      status: quota.status || 429,
      errorCode: quota.error,
      detail: quota.detail || '요청 한도를 초과했습니다.',
      tries,
    };
  }

  const network = tries.find(entry => entry.error === 'ai_network_error');
  if (network) {
    return {
      ok: false,
      status: network.status || 502,
      errorCode: network.error,
      detail: network.detail || '네트워크 오류가 발생했습니다.',
      tries,
    };
  }

  const firstFailure = tries.find(entry => entry.error);
  if (firstFailure) {
    return {
      ok: false,
      status: firstFailure.status || 500,
      errorCode: firstFailure.error || 'detect_failed',
      detail: firstFailure.detail || 'Gemini 버전을 확인하지 못했습니다.',
      tries,
    };
  }

  return {
    ok: false,
    status: 500,
    errorCode: 'detect_failed',
    detail: 'Gemini 버전을 확인하지 못했습니다.',
    tries,
  };
}
