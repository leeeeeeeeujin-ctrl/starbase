"use client";

import { readRankAuthSnapshot } from '@/lib/rank/rankAuthStorage';
import {
  persistRankKeyringSnapshot,
  readRankKeyringSnapshot,
} from '@/lib/rank/keyringStorage';

export const KEY_PROVIDER_LABELS = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  groq: 'Groq',
  claude: 'Anthropic Claude',
  unknown: '기타 모델',
};

export const KEYRING_LIMIT_FALLBACK = 5;

function normalizeUserHeaderValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function resolveAuthContext(context = {}) {
  const snapshot = readRankAuthSnapshot();
  const userId =
    normalizeUserHeaderValue(context.userId) ||
    normalizeUserHeaderValue(snapshot?.userId) ||
    '';
  const accessToken =
    normalizeUserHeaderValue(context.accessToken) ||
    normalizeUserHeaderValue(snapshot?.accessToken) ||
    '';
  return { userId, accessToken };
}

async function requestUserApiKeyring(method, payload, context = {}) {
  const { userId, accessToken } = resolveAuthContext(context);
  const options = { method, headers: {}, credentials: 'include' };

  if (method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(payload ?? {});
  }

  if (accessToken) {
    options.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (userId) {
    options.headers['x-rank-user-id'] = userId;
    options.headers['x-user-id'] = userId;
  }

  const response = await fetch('/api/rank/user-api-keyring', options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      const err = new Error('user-api-keyring 응답을 해석하지 못했습니다.');
      err.status = response.status;
      throw err;
    }
  }

  if (!response.ok) {
    const message = data?.detail || data?.error || 'API 키 작업 중 오류가 발생했습니다.';
    const err = new Error(message);
    err.status = response.status;
    err.payload = data;
    throw err;
  }

  return data || {};
}

function toTimestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeKeyringEntry(row) {
  if (!row) return null;
  return {
    id: row.id || '',
    provider: row.provider || 'unknown',
    modelLabel: row.modelLabel || row.model_label || null,
    apiVersion: row.apiVersion || row.api_version || null,
    geminiMode: row.geminiMode || row.gemini_mode || null,
    geminiModel: row.geminiModel || row.gemini_model || null,
    keySample: row.keySample || row.key_sample || '',
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
    isActive: row.isActive === true || row.is_active === true,
  };
}

export function mergeKeyringEntries(existing = [], entry, activated) {
  if (!entry) return existing.slice();
  const base = existing.filter(item => item?.id && item.id !== entry.id);
  const sanitized = activated ? { ...entry, isActive: true } : { ...entry };
  const next = activated ? base.map(item => ({ ...item, isActive: false })) : base;
  next.push(sanitized);
  next.sort(
    (a, b) => toTimestamp(b.updatedAt || b.createdAt) - toTimestamp(a.updatedAt || a.createdAt)
  );
  return next;
}

export function sanitizeKeyringStorageEntry(entry) {
  if (!entry) {
    return {
      id: '',
      isActive: false,
      provider: 'unknown',
      modelLabel: null,
      apiVersion: null,
      geminiMode: null,
      geminiModel: null,
      keySample: '',
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: entry.id || '',
    isActive: !!entry.isActive,
    provider: entry.provider || 'unknown',
    modelLabel: entry.modelLabel || null,
    apiVersion: entry.apiVersion || null,
    geminiMode: entry.geminiMode || null,
    geminiModel: entry.geminiModel || null,
    keySample: entry.keySample || '',
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
  };
}

export function formatKeyProviderLabel(provider) {
  if (!provider) return KEY_PROVIDER_LABELS.unknown;
  return KEY_PROVIDER_LABELS[provider] || KEY_PROVIDER_LABELS.unknown;
}

export async function fetchRankUserKeyring(context) {
  const data = await requestUserApiKeyring('GET', null, context);
  const entries = Array.isArray(data?.entries)
    ? data.entries.map(normalizeKeyringEntry).filter(Boolean)
    : [];
  const limit = Number.isFinite(data?.limit) ? Number(data.limit) : KEYRING_LIMIT_FALLBACK;
  return { entries, limit };
}

export async function registerRankApiKey({ apiKey, activate = true, context = {} }) {
  return requestUserApiKeyring(
    'POST',
    { apiKey, activate },
    context
  );
}

export async function activateRankApiKey({ entryId, context = {} }) {
  return requestUserApiKeyring('PATCH', { id: entryId }, context);
}

export async function deactivateRankApiKey({ entryId, context = {} }) {
  return requestUserApiKeyring('PATCH', { id: entryId, action: 'deactivate' }, context);
}

export async function deleteRankApiKeyEntry({ entryId, context = {} }) {
  return requestUserApiKeyring('DELETE', { id: entryId }, context);
}

export function readCachedKeyringSnapshot() {
  return readRankKeyringSnapshot();
}

export function persistKeyringSnapshot(userId, entries) {
  persistRankKeyringSnapshot({
    userId: userId || '',
    entries: entries.map(sanitizeKeyringStorageEntry),
  });
}
