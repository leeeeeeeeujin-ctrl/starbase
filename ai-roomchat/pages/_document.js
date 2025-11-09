import Document, { Html, Head, Main, NextScript } from 'next/document';
import React from 'react';

// Inject an early, inlined fetch guard before app hydration.
// This runs as soon as the HTML parses, so we can trace/dedupe
// any prompt/set creations that occur during initial load/navigation.
const EARLY_GUARD = `(() => {
  try {
    var g = typeof window !== 'undefined' ? window : globalThis;
    if (g.__EARLY_GUARD_INSTALLED__) return; // idempotent
    var ofetch = g.fetch && g.fetch.bind(g);
    if (!ofetch) return;
    var INFLIGHT = (g.__EARLY_INFLIGHT__ ||= new Map());
    var RECENT = (g.__EARLY_RECENT__ ||= new Map());
    var windowMs = 3000;
    function keyFromPayload(p) {
      if (!p) return 'anon';
      if (p.id) return 'id:' + p.id;
      if (p.name) return 'name:' + p.name;
      return 'anon';
    }
    function parseBody(init) {
      var b = init && init.body; if (!b) return {};
      try { if (typeof b === 'string') return JSON.parse(b); return b; } catch(_) { return {}; }
    }
    function coalesce(key, p) { INFLIGHT.set(key, p); return p.finally(() => { INFLIGHT.delete(key); }); }
    function recentHit(key) {
      var now = Date.now(); var r = RECENT.get(key);
      return r && (now - r.at < windowMs) ? r : null;
    }
    function pickHeaders(init){
      var h = (init && init.headers) || {};
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
        var info = { kind: kind, location: (typeof location !== 'undefined') ? (location.href || null) : null, detail: detail };
        var json = JSON.stringify(info);
        var blob = new Blob([json], { type: 'application/json' });
        if (navigator && navigator.sendBeacon) { navigator.sendBeacon('/api/debug/creation-log', blob); }
        else { ofetch('/api/debug/creation-log', { method:'POST', headers:{'Content-Type':'application/json'}, body: json }).catch(function(){}); }
      } catch(_){}
    }
    g.fetch = function(input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var method = (init && init.method || 'GET').toUpperCase();
        var isPrompts = url.includes('/api/prompts') && method === 'POST';
        var isSets = url.includes('/api/workspace/sets') && method === 'POST';
        var isSpb = url.includes('/rest/v1/prompt_sets') && method === 'POST';
        if ((isPrompts || isSets || isSpb) && !url.includes('/api/debug/creation-log')) {
          var payload = parseBody(init);
          var base = isPrompts ? 'prompt' : (isSets ? 'set' : 'supabase:prompt_sets');
          var key = base + ':' + keyFromPayload(payload);
          var r = recentHit(key);
          if (r) {
            console.warn('[early-guard] dedup recent', key, r);
            var blob = new Blob([JSON.stringify(r.result || { ok: true })], { type:'application/json' });
            var status = isSpb ? 201 : 200;
            return Promise.resolve(new Response(blob, { status: status }));
          }
          if (INFLIGHT.has(key)) {
            console.warn('[early-guard] coalesce inflight', key);
            return INFLIGHT.get(key);
          }
          var stack = (new Error()).stack;
          console.log('[early-guard] POST', { url, key, payload, stack: stack });
          try { var hdrs = pickHeaders(init); sendLog(isPrompts ? 'prompt' : (isSets ? 'set' : 'supabase'), { url: url, key: key, payload: payload, headers: hdrs, stack: stack }); } catch(_){ }
          var p = ofetch(input, init).then(function(resp){
            try { resp.clone().json().then(function(j){ RECENT.set(key, { at: Date.now(), result: j }); }).catch(function(){}); } catch(_){}
            return resp;
          });
          return coalesce(key, p);
        }
      } catch(e) { try { console.warn('[early-guard] error', e); } catch(_){} }
      return ofetch(input, init);
    };
    g.__EARLY_GUARD_INSTALLED__ = true;
  } catch(_) {}
})();`;

export default class MyDocument extends Document {
  render() {
    return (
      <Html data-intercept-supabase-prompt-sets="1">
        <Head>
          <script dangerouslySetInnerHTML={{ __html: EARLY_GUARD }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
