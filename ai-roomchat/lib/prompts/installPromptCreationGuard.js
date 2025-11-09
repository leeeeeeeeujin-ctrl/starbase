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
      if (!url.includes('/api/debug/creation-log') && url.includes('/api/prompts') && method === 'POST') {
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

        const stack = new Error().stack;
        console.log('[prompt:create] POST', { key, payload, stack });
        try { sendLog('prompt', { url, key, payload, headers: pickHeaders(init), stack }); } catch {}

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
      if (!url.includes('/api/debug/creation-log') && url.includes('/api/workspace/sets') && method === 'POST') {
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
        const stack = new Error().stack;
        console.log('[set:create] POST', { key, payload, stack });
        try { sendLog('set', { url, key, payload, headers: pickHeaders(init), stack }); } catch {}
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

      // Supabase direct REST calls (prompt_sets) — catch accidental client-side inserts
      if (!url.includes('/api/debug/creation-log') && url.includes('/rest/v1/prompt_sets') && method === 'POST') {
        const payload = parseBody(init);
        const key = `spb:prompt_sets:${keyFromPayload(payload)}`;
        const now = Date.now();
        const recent = RECENT.get(key);
        if (recent && now - recent.at < windowMs) {
          console.warn('[supabase:prompt_sets] dedup recent', key, recent);
          return new Response(new Blob([JSON.stringify(recent.result || { ok: true })], { type: 'application/json' }), { status: 201 });
        }
        if (INFLIGHT.has(key)) {
          console.warn('[supabase:prompt_sets] coalesce inflight', key);
          return INFLIGHT.get(key);
        }
        const stack = new Error().stack;
        console.log('[supabase:prompt_sets] POST', { key, payload, stack, url });
        try { sendLog('supabase', { url, key, payload, headers: pickHeaders(init), stack }); } catch {}

        // Optional hard interception: route to our API instead of direct supabase
        const intercept = (typeof process !== 'undefined' ? (process.env?.NEXT_PUBLIC_INTERCEPT_SUPABASE_PROMPT_SETS === '1') : (g.NEXT_PUBLIC_INTERCEPT_SUPABASE_PROMPT_SETS === '1'))
          || (typeof g !== 'undefined' && g.NEXT_PUBLIC_INTERCEPT_SUPABASE_PROMPT_SETS === '1')
          || (typeof window !== 'undefined' && window.NEXT_PUBLIC_INTERCEPT_SUPABASE_PROMPT_SETS === '1')
          || (typeof document !== 'undefined' && (document.documentElement?.dataset?.interceptSupabasePromptSets === '1'));

        if (intercept) {
          const headers = { 'Content-Type': 'application/json' };
          const body = JSON.stringify({ id: payload?.id, name: payload?.name });
          const p = ofetch('/api/prompts', { method: 'POST', headers, body }).then(async (r) => {
            const json = await r.clone().json().catch(() => ({}));
            // Emulate supabase insert return shape minimally
            RECENT.set(key, { at: Date.now(), result: json });
            return new Response(new Blob([JSON.stringify(json)], { type: 'application/json' }), { status: 201 });
          }).finally(() => { INFLIGHT.delete(key); });
          INFLIGHT.set(key, p);
          return p;
        }

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

  function pickHeaders(init){
    const h = (init && init.headers) || {};
    try {
      if (typeof h.get === 'function') {
        return {
          'x-request-id': h.get('x-request-id') || h.get('X-Request-Id') || null,
          'if-match': h.get('if-match') || h.get('If-Match') || null,
          'content-type': h.get('content-type') || h.get('Content-Type') || null,
        };
      }
      return {
        'x-request-id': h['x-request-id'] || h['X-Request-Id'] || null,
        'if-match': h['if-match'] || h['If-Match'] || null,
        'content-type': h['content-type'] || h['Content-Type'] || null,
      };
    } catch { return {}; }
  }

  function sendLog(kind, detail){
    try {
      const info = {
        kind,
        location: (typeof location !== 'undefined') ? (location.href || null) : null,
        detail,
      };
      const blob = new Blob([JSON.stringify(info)], { type: 'application/json' });
      if (navigator && navigator.sendBeacon) {
        navigator.sendBeacon('/api/debug/creation-log', blob);
      } else {
        fetch('/api/debug/creation-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(info) })
          .catch(()=>{});
      }
    } catch {}
  }
}
