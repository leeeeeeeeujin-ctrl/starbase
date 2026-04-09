"use client";

import { supabase } from '../supabase';

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4 || 4)) % 4)}`;
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      return JSON.parse(window.atob(padded));
    }
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isLikelyUserAccessToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return false;
  if (!payload.sub) return false;
  if (payload.role && payload.role !== 'authenticated') return false;
  return true;
}

function normalizeHeaders(input) {
  if (!input) return {};
  if (typeof Headers !== 'undefined' && input instanceof Headers) {
    const out = {};
    input.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(input)) {
    return input.reduce((acc, entry) => {
      if (Array.isArray(entry) && entry.length >= 2) {
        acc[entry[0]] = entry[1];
      }
      return acc;
    }, {});
  }
  return { ...input };
}

export async function getSupabaseAccessToken() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const token = data?.session?.access_token || null;
    return isLikelyUserAccessToken(token) ? token : null;
  } catch {
    return null;
  }
}

export async function requireSupabaseAccessToken() {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error('로그인 세션이 필요합니다. 다시 로그인해 주세요.');
  }
  return token;
}

export function applySupabaseAccessToken(headers = {}, token) {
  const normalized = normalizeHeaders(headers);
  if (token) {
    normalized.Authorization = `Bearer ${token}`;
  }
  return normalized;
}

export async function buildSupabaseAuthHeaders(headers = {}) {
  const token = await getSupabaseAccessToken();
  return {
    headers: applySupabaseAccessToken(headers, token),
    token,
  };
}
