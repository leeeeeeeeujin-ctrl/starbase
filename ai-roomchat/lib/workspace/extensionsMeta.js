"use client";

import { applySupabaseAccessToken, requireSupabaseAccessToken } from '../api/authHeaders';

/**
 * Load extensions metadata for a given workspace set id.
 * Stored in the workspace set's `meta.extensions` field.
 */
export async function loadExtensionsMeta(id) {
  if (!id) return { extensions: [] };

  const token = await requireSupabaseAccessToken();
  const headers = applySupabaseAccessToken({}, token);

  const res = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`, { headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(body?.error || `loadExtensionsMeta failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  const meta = body?.meta || {};
  const extensions = Array.isArray(meta.extensions) ? meta.extensions : [];
  return { extensions };
}

/**
 * Persist extensions metadata for a given workspace set id.
 * Uses PATCH to merge into existing `meta` without touching files.
 */
export async function saveExtensionsMeta(id, extensions) {
  if (!id) throw new Error('saveExtensionsMeta: missing workspace id');

  const token = await requireSupabaseAccessToken();
  const headers = applySupabaseAccessToken({ 'Content-Type': 'application/json' }, token);

  const res = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ meta: { extensions } }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || `saveExtensionsMeta failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return body;
}

