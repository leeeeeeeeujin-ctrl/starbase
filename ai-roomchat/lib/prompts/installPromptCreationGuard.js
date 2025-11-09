const g = typeof window !== 'undefined' ? window : globalThis;

function parseBody(init) {
  const b = init && init.body; if (!b) return {};
  try { if (typeof b === 'string') return JSON.parse(b); return b; } catch { return {}; }
}
function keyFromPayload(p) { if (!p) return 'anon'; if (p.id) return `id:${p.id}`; if (p.name) return `name:${p.name}`; return 'anon'; }

export default function installPromptCreationGuard({ windowMs = 3000 } = {}) {
  if (g.__PROMPT_GUARD_INSTALLED__) return;
  const ofetch = g.fetch?.bind(g);
  if (!ofetch) return;
  const INFLIGHT = (g.__PROMPTS_INFLIGHT__ ||= new Map());
  const RECENT = (g.__PROMPTS_RECENT__ ||= new Map());

  g.fetch = async function guardedFetch(input, init) {
    try {
      const url = (typeof input === 'string') ? input : (input?.url || '');
      const method = (init?.method || 'GET').toUpperCase();
      const isPrompts = url.includes('/api/prompts') && method === 'POST';
      const isSets = url.includes('/api/workspace/sets') && method === 'POST';
      const isSupabase = url.includes('/rest/v1/prompt_sets') && method === 'POST';
      if (!(isPrompts || isSets || isSupabase) || url.includes('/api/debug/creation-log')) {
        return ofetch(input, init);
      }
      const payload = parseBody(init);
      const base = isPrompts ? 'prompt' : (isSets ? 'set' : 'supabase');
      const key = base + ':' + keyFromPayload(payload);
      const now = Date.now();
      const recent = RECENT.get(key);
      if (recent && now - recent.at < windowMs) {
        const status = isSupabase ? 201 : 200;
        return new Response(new Blob([JSON.stringify(recent.result || { ok: true })], { type: 'application/json' }), { status });
      }
      if (INFLIGHT.has(key)) return INFLIGHT.get(key);

      // Always intercept Supabase direct creation to our API (single source of truth)
      if (isSupabase) {
        const headers = { 'Content-Type': 'application/json' };
        const body = JSON.stringify({ id: payload?.id, name: payload?.name });
        const p = ofetch('/api/prompts', { method: 'POST', headers, body }).then(async (r) => {
          const json = await r.clone().json().catch(() => ({}));
          RECENT.set(key, { at: Date.now(), result: json });
          return new Response(new Blob([JSON.stringify(json)], { type: 'application/json' }), { status: 201 });
        }).finally(() => { INFLIGHT.delete(key); });
        INFLIGHT.set(key, p); return p;
      }

      const p = ofetch(input, init).then(async (r) => {
        try { const json = await r.clone().json().catch(() => ({})); RECENT.set(key, { at: Date.now(), result: json }); } catch {}
        return r;
      }).finally(() => { INFLIGHT.delete(key); });
      INFLIGHT.set(key, p);
      return p;
    } catch (e) { return g.fetch(input, init); }
  };

  g.__PROMPT_GUARD_INSTALLED__ = true;
}

