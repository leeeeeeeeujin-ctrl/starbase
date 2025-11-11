"use client";

import { supabase } from '../supabase';

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
    return data?.session?.access_token || null;
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
