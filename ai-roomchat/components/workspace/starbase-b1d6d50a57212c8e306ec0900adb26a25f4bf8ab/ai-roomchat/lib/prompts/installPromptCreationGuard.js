// Client-side fetch interceptor to dedupe prompt creations and add debug logs.
// - Coalesces concurrent POST /api/prompts with same id or name
// - Returns the same promise/result for duplicates within a short window
// - Emits console logs to help trace double-trigger sources

const g = typeof window !== 'undefined' ? window : globalThis;

function parseBody(init) {
  const b = init && init.body;
  if (!b) return {};
  try {
    if (typeof b === 'string') return JSON.parse(b);
    if (b instanceof Blob) return {}; // avoid reading
    return b; // assume already object
  } catch (_) {
    return {};
  }
}

function keyFromPayload(p) {
  if (!p) return 'anon';
  if (p.id) return `id:${p.id}`;
  if (p.name) return `name:${p.name}`;
  return 'anon';
}

export default function installPromptCreationGuard({ windowMs = 3000 } = {}) {
  if (g.__PROMPT_GUARD_INSTALLED__) return;
  const ofetch = g.fetch?.bind(g);
  if (!ofetch) return;

  const INFLIGHT = (g.__PROMPTS_INFLIGHT__ ||= new Map()); // key -> Promise
  const RECENT = (g.__PROMPTS_RECENT__ ||= new Map()); // key -> { at, result }

  g.fetch = async function guardedFetch(input, init) {
    try {
      const url = (typeof input === 'string') ? input : (input?.url || '');
      const method = (init?.method || 'GET').toUpperCase();
      if (url.includes('/api/prompts') && method === 'POST') {
        const payload = parseBody(init);
        const key = keyFromPayload(payload);
        const now = Date.now();

        const recent = RECENT.get(key);
        if (recent && now - recent.at < windowMs) {
          console.warn('[prompt:create] dedup recent', key, recent);
          return new Response(new Blob([JSON.stringify(recent.result)], { type: 'application/json' }), { status: 200 });
        }

        if (INFLIGHT.has(key)) {
          console.warn('[prompt:create] coalesce inflight', key);
          return INFLIGHT.get(key);
        }

        console.log('[prompt:create] POST', { key, payload, stack: new Error().stack });

        const p = ofetch(input, init).then(async (r) => {
          try {
            const json = await r.clone().json().catch(() => ({}));
            RECENT.set(key, { at: Date.now(), result: json });
          } catch {}
          return r;
        }).finally(() => {
          INFLIGHT.delete(key);
        });

        INFLIGHT.set(key, p);
        return p;
        return p;
      }

      // Also trace and dedupe /api/workspace/sets POST to see early set creations
      if (url.includes('/api/workspace/sets') && method === 'POST') {
        const payload = parseBody(init);
        const key = `set:${keyFromPayload(payload)}`;
        const now = Date.now();
        const recent = RECENT.get(key);
        if (recent && now - recent.at < windowMs) {
          console.warn('[set:create] dedup recent', key, recent);
          return new Response(new Blob([JSON.stringify(recent.result || { ok: true })], { type: 'application/json' }), { status: 200 });
        }
        if (INFLIGHT.has(key)) {
          console.warn('[set:create] coalesce inflight', key);
          return INFLIGHT.get(key);
        }
        console.log('[set:create] POST', { key, payload, stack: new Error().stack });
        const p = ofetch(input, init).then(async (r) => {
          try {
            const json = await r.clone().json().catch(() => ({}));
            RECENT.set(key, { at: Date.now(), result: json });
          } catch {}
          return r;
        }).finally(() => {
          INFLIGHT.delete(key);
        });
        INFLIGHT.set(key, p);
        return p;
      }
    } catch (e) {
      console.warn('[prompt:create] guard error', e);
    }
    return ofetch(input, init);
  };

  g.__PROMPT_GUARD_INSTALLED__ = true;
}
