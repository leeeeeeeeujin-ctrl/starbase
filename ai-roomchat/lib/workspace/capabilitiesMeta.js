"use client";

import { applySupabaseAccessToken, requireSupabaseAccessToken } from '../api/authHeaders';

/**
 * Load capabilities metadata for a given workspace set id.
 * Stored in the workspace set's `meta.capabilities` field.
 */
export async function loadCapabilitiesMeta(id) {
  if (!id) return { capabilities: [] };

  const token = await requireSupabaseAccessToken();
  const headers = applySupabaseAccessToken({}, token);

  const res = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`, { headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(body?.error || `loadCapabilitiesMeta failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  const meta = body?.meta || {};
  const capabilities = Array.isArray(meta.capabilities) ? meta.capabilities : [];
  return { capabilities };
}

/**
 * Persist capabilities metadata for a given workspace set id.
 * Uses PATCH to merge into existing `meta` without touching files.
 *
 * `capabilities` is typically an array of ids, or objects
 * `{ id, enabled, config }` depending on caller needs.
 */
export async function saveCapabilitiesMeta(id, capabilities) {
  if (!id) throw new Error('saveCapabilitiesMeta: missing workspace id');

  const token = await requireSupabaseAccessToken();
  const headers = applySupabaseAccessToken({ 'Content-Type': 'application/json' }, token);

  const res = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ meta: { capabilities } }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || `saveCapabilitiesMeta failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return body;
}

