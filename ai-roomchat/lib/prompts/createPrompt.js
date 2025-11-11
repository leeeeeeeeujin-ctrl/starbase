import { applySupabaseAccessToken, requireSupabaseAccessToken } from '../api/authHeaders';

const g = (typeof window !== 'undefined' ? window : globalThis);
const INFLIGHT = (g.__CREATE_PROMPT_INFLIGHT__ ||= new Map()); // key -> Promise
const RECENT = (g.__CREATE_PROMPT_RECENT__ ||= new Map()); // key -> { at, result }

function keyFrom(payload) {
  const p = payload || {};
  // Prefer id; else name; else a constant to coalesce duplicate anonymous creations
  return p.id || `name:${p.name || ''}` || 'anon';
}

export default async function createPrompt(payload) {
  const key = keyFrom(payload);
  const now = Date.now();
  const recent = RECENT.get(key);
  if (recent && now - recent.at < 3000) {
    return recent.result; // return last success within 3s window
  }
  if (INFLIGHT.has(key)) {
    return INFLIGHT.get(key);
  }

  const reqId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(1);
  const p = (payload && typeof payload === 'object') ? payload : {};

  const promise = (async () => {
    const sessionToken = await requireSupabaseAccessToken();
    const headers = applySupabaseAccessToken({ 'Content-Type': 'application/json', 'X-Request-Id': reqId }, sessionToken);
    const r = await fetch('/api/prompts', {
      method: 'POST',
      headers,
      body: JSON.stringify(p),
    });
    if (!r.ok) throw new Error(`createPrompt failed ${r.status}`);
    const json = await r.json();
    RECENT.set(key, { at: Date.now(), result: json });
    return json;
  })().finally(() => {
    INFLIGHT.delete(key);
  });

  INFLIGHT.set(key, promise);
  return promise;
}
