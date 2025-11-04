"use client";

import { GameRuntimeProvider, useGameRuntime } from "./GameRuntimeProvider.jsx";
import MainGameUI from "./MainGameUI.jsx";
import GameChatPanel from "./GameChatPanel.jsx";
import CountdownNextBar from "./CountdownNextBar.jsx";
import HistoryPanel from "./HistoryPanel.jsx";
import Dummy2D from "./engines/Dummy2D.jsx";
import Dummy3D from "./engines/Dummy3D.jsx";
import UISchemaRenderer from "./ui/UISchemaRenderer.jsx";
import { prefetchResources } from "../../utils/resourceCache.js";
import { decompressToString } from "../../utils/compress.js";

function useResponsiveCols() {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const onR = () => setNarrow((typeof window!=='undefined') && (window.innerWidth < 980));
    onR();
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return narrow;
}

import * as React from 'react';
import { useWorkspace } from "../workspace/CodeWorkspaceProvider.jsx";

function RuntimeLoader() {
  const { files } = useWorkspace();
  const assetUrlCacheRef = React.useRef({});
  // Build cache of blob URLs for compressed assets (async)
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const entries = Object.entries(files||{});
      for (const [path, meta] of entries) {
        try {
          if (!meta || !meta.meta || !meta.meta.data) continue;
          // skip if already cached
          if (assetUrlCacheRef.current[path]) continue;
          const str = await decompressToString(meta.meta);
          const ext = (path.split('.').pop() || '').toLowerCase();
          const mime = (
            ext === 'png' ? 'image/png' :
            ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
            ext === 'gif' ? 'image/gif' :
            ext === 'webp' ? 'image/webp' :
            ext === 'svg' ? 'image/svg+xml' :
            ext === 'mp3' ? 'audio/mpeg' :
            ext === 'wav' ? 'audio/wav' :
            'application/octet-stream'
          );
          const isB64 = /^[A-Za-z0-9+/=\r\n]+$/.test(str || '') && (str.length % 4 === 0);
          let url;
          if (typeof str === 'string' && str.startsWith('data:')) {
            url = str;
          } else if (isB64) {
            const bstr = atob(str.replace(/\s+/g, ''));
            const buf = new Uint8Array(bstr.length);
            for (let i=0;i<bstr.length;i++) buf[i] = bstr.charCodeAt(i);
            const blob = new Blob([buf], { type: mime });
            url = URL.createObjectURL(blob);
          } else {
            const blob = new Blob([str], { type: mime });
            url = URL.createObjectURL(blob);
          }
          if (!alive) return;
          assetUrlCacheRef.current[path] = url;
        } catch {}
      }
    })();
    return () => { alive = false; };
  }, [files]);
  const rt = useGameRuntime();
  // Prefetch remote resources for this game if a manifest is available
  React.useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const gameId = rt?.roomId || 'local-demo';
        const r = await fetch(`/api/games/${encodeURIComponent(gameId)}/assets-manifest`);
        if (!r.ok) return;
        const j = await r.json();
        if (aborted) return;
        const baseUrl = j?.baseUrl || '';
        const list = Array.isArray(j?.assets) ? j.assets : [];
        if (list.length) await prefetchResources({ gameId, baseUrl, manifest: list });
      } catch {}
    })();
    return () => { aborted = true; };
  }, [rt?.roomId]);
  React.useEffect(() => {
    try {
      const graph = JSON.parse(files['/graph/prompt-graph.json']?.content || '{"nodes":[],"edges":[]}');
      const config = JSON.parse(files['/game/runtime.config.json']?.content || '{"durations":[30,60,90,120,180]}');
      const src = String(files['/game/hooks/automation.js']?.content || '');
      const compiled = transpileHooks(src);
      // wrap transformPrompt to resolve include markers using current files
      const resolveIncludes = (text) => {
        try {
          return String(text||'').replace(/\{\{\s*(file|code)\s*:\s*([^}]+)\s*\}\}/g, (_, kind, spec) => {
            let p = String(spec||''); let lines=null;
            const m = p.match(/^(.*)#L(\d+)-(\d+)$/); if (m) { p=m[1]; lines=[parseInt(m[2],10),parseInt(m[3],10)]; }
            const meta = files[p]; let s = typeof meta?.content==='string'? meta.content : '';
            if (lines) { const L=s.split(/\r?\n/); const a=Math.max(1,lines[0]), b=Math.min(L.length,lines[1]); s=L.slice(a-1,b).join('\n'); }
            if (s.length>2000) { const pre=s.slice(0,1200); const suf=s.slice(-700); s=pre+"\n…\n/* …중략… */\n"+suf; }
            return s;
          });
        } catch { return text; }
      };
      const hooks = { ...compiled };
      if (typeof compiled.transformPrompt === 'function') {
        hooks.transformPrompt = (ctx) => {
          try {
            const out = compiled.transformPrompt({ ...ctx, files });
            if (out && typeof out === 'object' && typeof out.prompt === 'string') return { ...out, prompt: resolveIncludes(out.prompt) };
            if (typeof out === 'string') return resolveIncludes(out);
            return out;
          } catch { return ctx?.node?.label || ''; }
        };
      }
      rt.setRuntime({ graph, hooks, config, files });
    } catch {}
  }, [files['/graph/prompt-graph.json']?.content, files['/game/runtime.config.json']?.content, files['/game/hooks/automation.js']?.content]);
  return null;
}

function transpileHooks(src){
  try {
    // very naive transform: remove 'export ' keywords and return known names
    const body = src.replace(/export\s+function/g, 'function');
    const fn = new Function(`${body}; return { onTurnStart: (typeof onTurnStart==='function')?onTurnStart:undefined, onUserAction: (typeof onUserAction==='function')?onUserAction:undefined, transformPrompt: (typeof transformPrompt==='function')?transformPrompt:undefined, selectNext: (typeof selectNext==='function')?selectNext:undefined };`);
    const hooks = fn() || {};
    return hooks;
  } catch { return {}; }
}

export default function GameRealtimeRuntime({ roomId = 'local-demo', currentUser = { id:'local', role:'players' }, roles = { players:['local','ai1','ai2'], observers:[] } }){
  const narrow = useResponsiveCols();
  const cols = narrow ? '1fr' : '1.15fr 0.85fr';
  // Page system (optional)
  const { files } = useWorkspace();
  const [pagesMeta, setPagesMeta] = React.useState({});
  const [pageId, setPageId] = React.useState(null);
  const [pageSchema, setPageSchema] = React.useState(null);
  const handlersRef = React.useRef({});
  const loadPages = React.useCallback(() => {
    try {
      const meta = JSON.parse(files['/game/pages/index.json']?.content || '{}');
      setPagesMeta(meta || {});
      const first = Object.keys(meta||{})[0] || null; setPageId(p=>p||first);
    } catch {}
  }, [files['/game/pages/index.json']?.content]);
  const loadPage = React.useCallback((id) => {
    try {
      const def = pagesMeta?.[id]; if (!def) return;
      if (def.type === 'ui') {
        const schema = JSON.parse(files[def.path]?.content || '{}');
        setPageSchema(schema); handlersRef.current = {};
      } else if (def.type === 'script') {
        const src = String(files[def.path]?.content || '');
        const fn = new Function(`${src}; return (typeof render==='function')?render:undefined;`);
        const render = fn();
        if (render) {
          const out = render({ files });
          if (out && typeof out === 'object') { setPageSchema(out.schema || null); handlersRef.current = out.handlers || {}; }
        }
      }
    } catch {}
  }, [pagesMeta, files]);
  React.useEffect(()=>{ loadPages(); }, [loadPages]);
  React.useEffect(()=>{ if (pageId) loadPage(pageId); }, [pageId, loadPage]);
  const onEvent = (name, payload) => { try { const fn = handlersRef.current?.[name]; if (typeof fn==='function') fn(payload); } catch {} };
  const resolveAsset = React.useCallback((src) => {
    try {
      if (!src) return src;
      if (/^https?:/i.test(src) || /^data:/i.test(src)) return src;
      // treat absolute VFS path
      const meta = files[src];
      if (!meta) return src;
      // cached decoded URL from compressed meta
      const cached = assetUrlCacheRef.current[src];
      if (cached) return cached;
      // modern compressed payload: meta.meta = { algo, data }
      if (meta.meta && (meta.meta.algo || meta.meta.data)) {
        return (async () => {
          const str = await decompressToString(meta.meta);
          if (typeof str === 'string' && str.startsWith('data:')) return str;
          // Infer mime from extension
          const ext = (src.split('.').pop() || '').toLowerCase();
          const mime = (
            ext === 'png' ? 'image/png' :
            ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
            ext === 'gif' ? 'image/gif' :
            ext === 'webp' ? 'image/webp' :
            ext === 'svg' ? 'image/svg+xml' :
            ext === 'mp3' ? 'audio/mpeg' :
            ext === 'wav' ? 'audio/wav' :
            'application/octet-stream'
          );
          // If looks like base64, decode; else treat as utf-8 text
          const isB64 = /^[A-Za-z0-9+/=\r\n]+$/.test(str || '') && (str.length % 4 === 0);
          let blob;
          if (isB64) {
            const bstr = atob(str.replace(/\s+/g, ''));
            const buf = new Uint8Array(bstr.length);
            for (let i=0;i<bstr.length;i++) buf[i] = bstr.charCodeAt(i);
            blob = new Blob([buf], { type: mime });
          } else {
            blob = new Blob([str], { type: mime });
          }
          return URL.createObjectURL(blob);
        })();
      }
      // legacy compressed shape
      if (meta.compressed && meta.data) {
        const bstr = atob(meta.data);
        const buf = new Uint8Array(bstr.length);
        for (let i=0;i<bstr.length;i++) buf[i] = bstr.charCodeAt(i);
        const blob = new Blob([buf], { type: 'application/octet-stream' });
        return URL.createObjectURL(blob);
      }
      if (typeof meta.content === 'string' && meta.content.startsWith('data:')) return meta.content;
      return src;
    } catch { return src; }
  }, [files]);
  return (
    <GameRuntimeProvider roomId={roomId} roles={roles}>
      <RuntimeLoader />
      <div style={{ display:'grid', gridTemplateRows:'auto 1fr', height:'100%', gap:8 }}>
        <CountdownNextBar currentUser={currentUser} />
        <div style={{ display:'grid', gridTemplateColumns: cols, gap:8, minHeight:0 }}>
          <div style={{ display:'grid', gridTemplateRows: narrow ? 'auto auto' : '1fr 1fr', gap:8, minHeight:0 }}>
            <MainGameUI currentUser={currentUser} />
            <HistoryPanel currentUser={currentUser} />
          </div>
          <div style={{ display:'grid', gridTemplateRows: narrow ? 'auto auto' : '1fr 1fr', gap:8, minHeight:0 }}>
            <GameChatPanel currentUser={currentUser} />
            <div style={{ display:'grid', gridTemplateRows:'auto 1fr', gap:8, minHeight:0, border:'1px solid #25314a', borderRadius:12, overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'rgba(2,6,23,0.6)', color:'#e2e8f0' }}>
                <strong style={{ fontSize:13 }}>Pages</strong>
                <select value={pageId||''} onChange={e=>setPageId(e.target.value)} style={{ marginLeft:8, padding:'6px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>
                  {Object.entries(pagesMeta||{}).map(([id,def]) => (<option key={id} value={id}>{def.title || id}</option>))}
                </select>
                <span style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8' }}>{pageId || '-'}</span>
              </div>
              <div style={{ minHeight:0, overflow:'auto', padding:10, background:'#0b1120' }}>
                {pageSchema ? <UISchemaRenderer schema={pageSchema} onEvent={onEvent} resolveAsset={resolveAsset} /> : (
                  <div style={{ color:'#94a3b8', fontSize:12 }}>페이지가 없습니다. /game/pages/index.json을 추가하세요.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </GameRuntimeProvider>
  );
}
