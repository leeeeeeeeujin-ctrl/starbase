import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/ssr';

import {
  USER_API_KEYRING_LIMIT,
  activateUserApiKeyringEntry,
  countUserApiKeyringEntries,
  deleteUserApiKeyringEntry,
  fetchUserApiKeyring,
  fetchUserApiKeyringEntry,
  insertUserApiKeyringEntry,
} from '@/lib/rank/userApiKeyring';
import { detectGeminiPreset } from '@/lib/rank/geminiModelsService';
import { detectOpenAIPreset } from '@/lib/rank/openaiDetection';
import { deleteUserApiKey, fetchUserApiKey, upsertUserApiKey } from '@/lib/rank/userApiKeys';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for user-api-keyring API');
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
});

function normalizeUserId(value) {
  if (!value) return '';
  return String(value).trim();
}

function extractUserIdFromRequest(req) {
  if (!req) return '';

  const headerUserId =
    normalizeUserId(req.headers['x-rank-user-id']) || normalizeUserId(req.headers['x-user-id']);
  if (headerUserId) {
    return headerUserId;
  }

  const queryUserId = normalizeUserId(req.query?.userId) || normalizeUserId(req.query?.user_id);
  if (queryUserId) {
    return queryUserId;
  }

  if (req.body) {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload || '{}');
      } catch (error) {
        payload = null;
      }
    }

    if (payload && typeof payload === 'object') {
      const bodyUserId = normalizeUserId(payload.userId) || normalizeUserId(payload.user_id);
      if (bodyUserId) {
        return bodyUserId;
      }
    }
  }

  return '';
}

function buildErrorDetail(error) {
  if (!error) return '';
  const parts = [];
  if (error.message) parts.push(String(error.message));
  if (error.details) parts.push(String(error.details));
  if (error.hint) parts.push(String(error.hint));
  const detail = parts
    .map(part => part.trim())
    .filter(Boolean)
    .join(' ');
  return detail;
}

function normalizeRouteError(error, fallbackCode) {
  const detail = buildErrorDetail(error);
  const combined = detail || (error?.message ? String(error.message).trim() : '');
  const lowered = combined.toLowerCase();

  if (error?.code === '23503' || lowered.includes('violates foreign key constraint')) {
    return {
      error: 'user_not_found',
      detail:
        'Supabase에 해당 사용자 ID가 없습니다. 로그인하여 세션을 갱신하거나 `auth.users`에 계정을 생성한 뒤 다시 시도해 주세요.',
    };
  }

  if (lowered.includes('violates row-level security policy')) {
    return {
      error: 'forbidden',
      detail: '서비스 롤 권한이 없는 요청입니다. 서버 측에서 service key를 사용해 호출해 주세요.',
    };
  }

  const missingColumnMatch = combined.match(/column "?([^"]+)"? does not exist/i);
  if (missingColumnMatch) {
    const column = missingColumnMatch[1];
    return {
      error: 'schema_mismatch',
      detail: `Supabase에 필요한 컬럼 \"${column}\" 이 없습니다. docs/supabase-rank-schema.sql의 최신 마이그레이션을 적용해 주세요.`,
    };
  }

  const missingTableMatch = combined.match(/relation "?([^"]+)"? does not exist/i);
  if (missingTableMatch) {
    const relation = missingTableMatch[1];
    return {
      error: 'schema_mismatch',
      detail: `Supabase에 필요한 테이블 \"${relation}\" 이 없습니다. docs/supabase-rank-schema.sql에 정의된 객체를 생성해 주세요.`,
    };
  }

  if (lowered.includes('no api key found in request')) {
    return {
      error: 'supabase_service_key_missing',
      detail:
        'Supabase 서비스 롤 키가 누락되었습니다. 서버 환경 변수 SUPABASE_SERVICE_ROLE(또는 SUPABASE_SERVICE_ROLE_KEY)을 설정해 주세요.',
      status: 500,
    };
  }

  if (combined) {
    return { error: fallbackCode, detail: combined };
  }

  return { error: fallbackCode, detail: '' };
}

async function resolveUser(req, res) {
  try {
    const supabase = createPagesServerClient({ req, res });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return { user };
    }
  } catch (cookieError) {
    console.warn('[user-api-keyring] Failed to resolve user from cookies:', cookieError);
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const { data, error } = await anonClient.auth.getUser(token);
    if (!error && data?.user) {
      return { user: data.user };
    }
  }

  const fallbackUserId = extractUserIdFromRequest(req);
  if (fallbackUserId) {
    return { user: { id: fallbackUserId }, via: 'service' };
  }

  return { user: null };
}

function normalizeEntryResponse(entry, options = {}) {
  if (!entry) return null;
  const payload = {
    id: entry.id,
    provider: entry.provider,
    modelLabel: entry.modelLabel,
    apiVersion: entry.apiVersion,
    geminiMode: entry.geminiMode,
    geminiModel: entry.geminiModel,
    keySample: entry.keySample,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };

  if (typeof options.isActive === 'boolean') {
    payload.isActive = options.isActive;
  }

  return payload;
}

const OPENAI_KEY_PATTERNS = [
  /^sk-[a-z0-9]{16,}$/i,
  /^sk-(live|test|proj|proj-test|share)-[a-z0-9-]{8,}$/i,
];

const GEMINI_KEY_PATTERNS = [/^AIza[0-9A-Za-z_\-]{20,}$/, /^gk-[0-9a-z]{16,}$/i];

function heuristicDetectProvider(apiKey) {
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmed) return null;

  if (OPENAI_KEY_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return {
      provider: 'openai',
      apiVersion: null,
      detail: '키 형식이 OpenAI 패턴과 일치합니다.',
    };
  }

  if (GEMINI_KEY_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return {
      provider: 'gemini',
      geminiMode: 'v1beta',
      detail: '키 형식이 Gemini 패턴과 일치합니다.',
    };
  }

  if (trimmed.toLowerCase().startsWith('sk-')) {
    return {
      provider: 'openai',
      apiVersion: null,
      detail: '키 형식이 OpenAI 패턴과 일치합니다.',
    };
  }

  return null;
}

async function handleList(req, res, user) {
  try {
    const [entries, active] = await Promise.all([
      fetchUserApiKeyring(user.id, { includeSecret: true }),
      fetchUserApiKey(user.id).catch(() => null),
    ]);

    const activeKey = active?.apiKey || '';
    const sanitized = entries.map(entry =>
      normalizeEntryResponse(entry, {
        isActive: !!activeKey && !!entry.apiKey && entry.apiKey === activeKey,
      })
    );

    return res.status(200).json({
      ok: true,
      keys: sanitized,
      limit: USER_API_KEYRING_LIMIT,
    });
  } catch (error) {
    const payload = normalizeRouteError(error, 'failed_to_load_keyring');
    return res.status(payload.status || 400).json(payload);
  }
}

async function detectProvider(apiKey) {
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmed) {
    return { ok: false, error: 'missing_api_key' };
  }

  const heuristic = heuristicDetectProvider(trimmed);

  const shouldTryOpenAI = !heuristic || heuristic.provider === 'openai';
  let openaiResult = null;
  if (shouldTryOpenAI) {
    try {
      openaiResult = await detectOpenAIPreset({ apiKey: trimmed });
    } catch (error) {
      console.warn('[user-api-keyring] OpenAI detection failed:', error);
      openaiResult = { ok: false, errorCode: 'detect_failed', detail: error?.message || '' };
    }

    if (openaiResult?.ok) {
      return {
        ok: true,
        provider: 'openai',
        modelLabel: openaiResult.model || null,
        apiVersion: openaiResult.apiVersion || null,
        geminiMode: null,
        geminiModel: null,
        detail: openaiResult.detail || '',
        fallback: !!openaiResult.fallback,
      };
    }

    if (openaiResult?.errorCode === 'invalid_user_api_key') {
      return {
        ok: false,
        error: 'invalid_user_api_key',
        detail: openaiResult.detail || 'API 키가 올바르지 않습니다.',
      };
    }

    if (heuristic?.provider === 'openai') {
      const fallbackApiVersion =
        heuristic.apiVersion ||
        (openaiResult?.tries?.find(entry => entry.ok)?.apiVersion ?? null) ||
        (openaiResult?.tries?.[0]?.apiVersion ?? 'responses');

      return {
        ok: true,
        provider: 'openai',
        modelLabel: null,
        apiVersion: fallbackApiVersion,
        geminiMode: null,
        geminiModel: null,
        detail:
          openaiResult?.detail ||
          (openaiResult?.errorCode === 'quota_exhausted'
            ? '요청 한도를 초과했지만 OpenAI 키로 판단했습니다.'
            : heuristic.detail || ''),
        fallback: true,
      };
    }

    if (openaiResult) {
      const fallbackApiVersion =
        openaiResult.apiVersion ||
        (openaiResult.tries?.find(entry => entry.ok)?.apiVersion ?? null) ||
        (openaiResult.tries?.[0]?.apiVersion ?? 'responses');

      return {
        ok: true,
        provider: 'openai',
        modelLabel: null,
        apiVersion: fallbackApiVersion,
        geminiMode: null,
        geminiModel: null,
        detail:
          openaiResult.detail ||
          (openaiResult.errorCode === 'quota_exhausted'
            ? '요청 한도를 초과했지만 OpenAI 키로 판단했습니다.'
            : 'OpenAI 응답을 확인하지 못했지만 키 형식이 유효해 보입니다.'),
        fallback: true,
      };
    }
  }

  const shouldTryGemini = !heuristic || heuristic.provider === 'gemini';
  let geminiResult = null;
  if (shouldTryGemini) {
    try {
      geminiResult = await detectGeminiPreset({ apiKey: trimmed });
    } catch (error) {
      console.warn('[user-api-keyring] Gemini detection failed:', error);
      geminiResult = { ok: false, errorCode: 'detect_failed', detail: error?.message || '' };
    }

    if (geminiResult?.ok) {
      return {
        ok: true,
        provider: 'gemini',
        modelLabel: geminiResult.model || null,
        apiVersion: null,
        geminiMode: geminiResult.mode || null,
        geminiModel: geminiResult.model || null,
        detail: geminiResult.detail || '',
        fallback: !!geminiResult.fallback,
      };
    }

    if (geminiResult?.errorCode === 'invalid_user_api_key') {
      return {
        ok: false,
        error: 'invalid_user_api_key',
        detail: geminiResult.detail || 'API 키가 올바르지 않습니다.',
      };
    }

    if (heuristic?.provider === 'gemini') {
      return {
        ok: true,
        provider: 'gemini',
        modelLabel: null,
        apiVersion: null,
        geminiMode: heuristic.geminiMode || null,
        geminiModel: heuristic.geminiModel || null,
        detail:
          geminiResult?.detail ||
          (geminiResult?.errorCode === 'quota_exhausted'
            ? '요청 한도를 초과했지만 Gemini 키로 판단했습니다.'
            : heuristic.detail || ''),
        fallback: true,
      };
    }

    if (geminiResult) {
      return {
        ok: true,
        provider: 'gemini',
        modelLabel: null,
        apiVersion: null,
        geminiMode: geminiResult.mode || null,
        geminiModel: null,
        detail:
          geminiResult.detail ||
          (geminiResult.errorCode === 'quota_exhausted'
            ? '요청 한도를 초과했지만 Gemini 키로 판단했습니다.'
            : 'Gemini 응답을 확인하지 못했지만 키 형식이 유효해 보입니다.'),
        fallback: true,
      };
    }
  }

  if (heuristic) {
    const fallbackApiVersion =
      heuristic?.apiVersion ||
      (openaiResult?.tries?.find(entry => entry.ok)?.apiVersion ?? null) ||
      (openaiResult?.tries?.[0]?.apiVersion ?? null);

    return {
      ok: true,
      provider: heuristic.provider,
      modelLabel: heuristic.modelLabel || null,
      apiVersion: fallbackApiVersion,
      geminiMode: heuristic.geminiMode || null,
      geminiModel: heuristic.geminiModel || null,
      detail: heuristic.detail || '',
      fallback: true,
    };
  }

  const fallbackDetail =
    openaiResult?.detail ||
    geminiResult?.detail ||
    'API 키 제공자를 확인하지 못했지만 입력한 키를 저장합니다.';

  return {
    ok: true,
    provider: 'unknown',
    modelLabel: null,
    apiVersion: null,
    geminiMode: null,
    geminiModel: null,
    detail: fallbackDetail,
    fallback: true,
  };
}

async function handleCreate(req, res, user) {
  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
  }

  const { apiKey, activate = true } = payload || {};
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmedKey) {
    return res.status(400).json({ error: 'missing_user_api_key' });
  }

  try {
    const currentCount = await countUserApiKeyringEntries(user.id);
    if (currentCount >= USER_API_KEYRING_LIMIT) {
      return res.status(400).json({ error: 'keyring_limit_reached' });
    }

    const detection = await detectProvider(trimmedKey);
    if (!detection.ok) {
      return res
        .status(400)
        .json({ error: detection.error || 'detect_failed', detail: detection.detail });
    }

    const entry = await insertUserApiKeyringEntry({
      userId: user.id,
      apiKey: trimmedKey,
      provider: detection.provider,
      modelLabel: detection.modelLabel,
      apiVersion: detection.apiVersion,
      geminiMode: detection.geminiMode,
      geminiModel: detection.geminiModel,
    });

    if (activate !== false) {
      await upsertUserApiKey({
        userId: user.id,
        apiKey: trimmedKey,
        apiVersion: detection.apiVersion,
        geminiMode: detection.geminiMode,
        geminiModel: detection.geminiModel,
      });
    }

    return res.status(200).json({
      ok: true,
      entry: normalizeEntryResponse(entry, { isActive: activate !== false }),
      activated: activate !== false,
      detection,
    });
  } catch (error) {
    console.error('[user-api-keyring] Failed to store API key:', error);
    const payload = normalizeRouteError(error, 'failed_to_store_api_key');
    return res.status(payload.status || 400).json(payload);
  }
}

async function handleActivate(req, res, user) {
  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
  }

  const { id, action } = payload || {};
  if (action === 'deactivate') {
    if (!id) {
      return res.status(400).json({ error: 'missing_entry_id' });
    }

    try {
      const [entry, active] = await Promise.all([
        fetchUserApiKeyringEntry({ userId: user.id, entryId: id, includeSecret: true }),
        fetchUserApiKey(user.id).catch(() => null),
      ]);

      if (!entry) {
        return res.status(400).json({ error: 'api_key_entry_not_found' });
      }

      const activeKey = active?.apiKey || '';
      if (!activeKey || !entry.apiKey || entry.apiKey !== activeKey) {
        return res.status(400).json({ error: 'api_key_entry_not_active' });
      }

      await deleteUserApiKey({ userId: user.id });

      return res.status(200).json({
        ok: true,
        entry: normalizeEntryResponse(entry, { isActive: false }),
        deactivated: true,
      });
    } catch (error) {
      console.error('[user-api-keyring] Failed to deactivate API key:', error);
      const payload = normalizeRouteError(error, 'failed_to_deactivate_api_key');
      return res.status(payload.status || 400).json(payload);
    }
  }

  if (!id) {
    return res.status(400).json({ error: 'missing_entry_id' });
  }

  try {
    const entry = await activateUserApiKeyringEntry({
      userId: user.id,
      entryId: id,
      upsert: upsertUserApiKey,
    });

    return res.status(200).json({
      ok: true,
      entry: normalizeEntryResponse(entry, { isActive: true }),
    });
  } catch (error) {
    console.error('[user-api-keyring] Failed to activate API key:', error);
    const payload = normalizeRouteError(error, 'failed_to_activate_api_key');
    return res.status(payload.status || 400).json(payload);
  }
}

async function handleDelete(req, res, user) {
  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
  }

  const { id } = payload || {};
  if (!id) {
    return res.status(400).json({ error: 'missing_entry_id' });
  }

  try {
    const [entry, active] = await Promise.all([
      fetchUserApiKeyringEntry({ userId: user.id, entryId: id, includeSecret: true }).catch(
        () => null
      ),
      fetchUserApiKey(user.id).catch(() => null),
    ]);

    await deleteUserApiKeyringEntry({ userId: user.id, entryId: id });

    if (entry?.apiKey && active?.apiKey && entry.apiKey === active.apiKey) {
      await deleteUserApiKey({ userId: user.id }).catch(error => {
        console.warn('[user-api-keyring] Failed to clear active key after delete:', error);
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[user-api-keyring] Failed to delete API key:', error);
    const payload = normalizeRouteError(error, 'failed_to_delete_api_key');
    return res.status(payload.status || 400).json(payload);
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { user } = await resolveUser(req, res);
  if (!user) {
    return res.status(401).json({ error: 'missing_user_id' });
  }

  if (req.method === 'GET') {
    return handleList(req, res, user);
  }

  if (req.method === 'POST') {
    return handleCreate(req, res, user);
  }

  if (req.method === 'PATCH') {
    return handleActivate(req, res, user);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, user);
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
