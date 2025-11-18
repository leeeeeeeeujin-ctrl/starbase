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
  const github = meta.github && typeof meta.github === 'object' ? meta.github : null;
  return { extensions, github };
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

/**
 * Persist GitHub repository link metadata for a given workspace set id.
 * Stored under `meta.github = { owner, repo, branch }`.
 * Uses PATCH to merge into existing `meta` without touching files.
 */
export async function saveGithubMeta(id, github) {
  if (!id) throw new Error('saveGithubMeta: missing workspace id');

  const token = await requireSupabaseAccessToken();
  const headers = applySupabaseAccessToken({ 'Content-Type': 'application/json' }, token);

  const safe = github || {};
  const payload = {
    meta: {
      github: {
        owner: String(safe.owner || '').trim(),
        repo: String(safe.repo || '').trim(),
        branch: String(safe.branch || 'main').trim(),
      },
    },
  };

  const res = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || `saveGithubMeta failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return body;
}
