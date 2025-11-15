"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { unifiedSave } from '../../lib/workspace/unifiedSave.js';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';
import FileTree from './FileTree.jsx';
import EditorMonaco from '../EditorMonaco.jsx';
import dynamic from 'next/dynamic';
import SyncTemplateToVfs from './SyncTemplateToVfs.jsx';
import AICodeChatPanel from './AICodeChatPanel.jsx';

const MainGameMobileUI = dynamic(() => import('../game/MainGameMobileUI.jsx'), {
  ssr: false,
  // Loading fallback to avoid blank screen during chunk fetch
  loading: () => (
    <div style={{ display:'grid', placeItems:'center', height:'100%', color:'#94a3b8' }}>
      <div>플레이 화면 로딩 중…</div>
    </div>
  ),
});

class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error){
    return { hasError: true, error };
  }
  componentDidCatch(error, info){
    try { console.error('Play overlay error:', error, info); } catch {}
  }
  render(){
    if (this.state.hasError) {
      const e = this.state.error;
      return (
        <div style={{ height:'100%', display:'grid', placeItems:'center', padding:16 }}>
          <div style={{ maxWidth: 560, background:'#0b1220', border:'1px solid #334155', borderRadius:12, padding:16 }}>
            <div style={{ color:'#e2e8f0', fontWeight:700, marginBottom:8 }}>플레이 로드에 실패했어요</div>
            <div style={{ color:'#cbd5e1', fontSize:13, lineHeight:1.5 }}>
              리소스 청크를 불러오지 못했습니다. 개발 서버 재시작 또는 강력 새로고침(Ctrl+F5)을 시도해 주세요.
              {String(e?.message||'').includes('Loading chunk') || String(e||'').includes('ChunkLoadError') ? (
                <div style={{ marginTop:6, color:'#93c5fd' }}>오래된 번들을 참조 중일 수 있습니다. 서비스워커를 해제하면 해결될 수 있어요.</div>
              ) : null}
            </div>
            <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={() => { try { location.reload(); } catch {} }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>강력 새로고침</button>
              <button onClick={() => { try { navigator.serviceWorker?.getRegistrations?.().then(rs => rs.forEach(r => r.unregister())); setTimeout(()=>location.reload(), 300); } catch {} }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>서비스워커 해제</button>
              {this.props.onRetry ? (
                <button onClick={this.props.onRetry} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>다시 시도</button>
              ) : null}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PlayOverlayContent({ templateBinding }) {
  const { files } = useWorkspace();
  const router = useRouter();
  const [runnerInfo, setRunnerInfo] = React.useState(null);
  const [runnerErr, setRunnerErr] = React.useState(null);
  const bus = React.useMemo(() => {
    const listeners = new Map();
    return {
      on(event, fn){ const arr=listeners.get(event)||[]; listeners.set(event, [...arr, fn]); return () => this.off(event, fn); },
      off(event, fn){ const arr=listeners.get(event)||[]; listeners.set(event, arr.filter(f=>f!==fn)); },
      emit(event, payload){ const arr=listeners.get(event)||[]; arr.forEach(fn=>{ try{ fn(payload);}catch(e){ console.warn('bus handler error', e);} }); },
    };
  }, []);
  try {
    const tplText = (typeof templateBinding?.text === 'string' && templateBinding.text.length > 0)
      ? templateBinding.text
      : (files?.['/template.json']?.content || '{}');
    const tpl = JSON.parse(tplText || '{}');
    const cfgText = files?.['/game/runtime.config.json']?.content || '{}';
    let cfg = {};
    try { cfg = JSON.parse(cfgText || '{}'); } catch {}
    const engine = String(cfg?.engine || 'builtin').toLowerCase();
    const mode = String(cfg?.mode || (cfg?.durations ? 'turn' : 'realtime')).toLowerCase();

    // Best-effort invoke Runtime/runner.js when engine === builtin (behind flag)
    React.useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          if (process.env.NEXT_PUBLIC_RUNTIME_RUNNER !== '1') return;
          const runnerPath = '/Runtime/runner.js';
          let src = files?.[runnerPath]?.content;
          // Fallback: search a reference pack runner if user has not created one
          if (!src) {
            try {
              const keys = Object.keys(files || {});
              const refKey = keys.find(k => /\/Reference\/.+\/Runtime\/runner\.js$/.test(k));
              if (refKey) src = files[refKey]?.content;
            } catch {}
          }
          if (!src) return; // no runner present
          if (engine !== 'builtin') return; // only call runner for builtin engine to avoid adapter import errors
          const blob = new Blob([src], { type: 'text/javascript' });
          const url = URL.createObjectURL(blob);
          try {
            const mod = await import(/* webpackIgnore: true */ url);
            if (cancelled) return;
            if (mod && typeof mod.run === 'function') {
              const flatFiles = Object.fromEntries(Object.entries(files||{}).map(([p, m]) => [p, { content: m?.content || '' }]));
              const res = await mod.run(tpl, flatFiles, { ...cfg, bus, setId: String(router?.query?.id || '') });
              if (!cancelled) setRunnerInfo(res || { ok: true });
            }
          } finally {
            try { URL.revokeObjectURL(url); } catch {}
          }
        } catch (e) {
          if (!cancelled) setRunnerErr(String(e?.message||e));
        }
      })();
      return () => { cancelled = true; };
    }, [engine, JSON.stringify(files), tplText, cfgText, bus]);

    const showBanner = process.env.NEXT_PUBLIC_PLAY_BANNER === '1';
    const banner = showBanner ? (
      <div style={{ position:'absolute', left:12, top:12, zIndex:10, padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'rgba(2,6,23,0.75)', color:'#cbd5e1', fontSize:12 }}>
        <span style={{ color:'#93c5fd' }}>Engine:</span> {engine} <span style={{ margin:'0 6px', opacity:0.5 }}>|</span>
        <span style={{ color:'#93c5fd' }}>Mode:</span> {mode}
        {engine !== 'builtin' ? (
          <span style={{ marginLeft:8, color:'#fbbf24' }} title="Adapter stub">
            adapter stub — falling back to builtin UI
          </span>
        ) : null}
        {runnerInfo ? (
          <span style={{ marginLeft:8, color:'#86efac' }} title="Runner result">runner ok</span>
        ) : null}
        {runnerErr ? (
          <span style={{ marginLeft:8, color:'#fca5a5' }} title="Runner error">runner error</span>
        ) : null}
      </div>
    ) : null;
    return (
      <div style={{ position:'relative', height:'100%', width:'100%' }}>
        {banner}
        <ErrorBoundary onRetry={() => { try { window.dispatchEvent(new Event('play:retry')); } catch {} }}>
          <MainGameMobileUI template={tpl} runtimeConfig={cfg} runtimeBus={bus} />
        </ErrorBoundary>
      </div>
    );
  } catch (e) {
    return <div style={{ padding:16, color:'#94a3b8' }}>템플릿을 불러올 수 없습니다.</div>;
  }
}

function EditorPane() {
  const { files, activePath, inferLang, writeFile, saveFile, saveFileAndPush, storageNamespace } = useWorkspace();
  const file = files[activePath];
  const lang = useMemo(() => inferLang(activePath), [activePath, inferLang]);
  const [buf, setBuf] = useState(() => (file?.content ?? ''));
  useEffect(() => { setBuf(file?.content ?? ''); }, [activePath]);
  if (!file) return <div style={{ padding: 16, color: '#e2e8f0' }}>파일을 선택하세요.</div>;
  const doSave = async () => {
    try {
      if (file.readonly) return;
      // writeFile는 onChange에서 이미 최신 buf를 반영하므로 여기서는 저장 메타만 갱신
      saveFile(activePath);
      const id = storageNamespace || '';
      if (id) await saveFileAndPush(id, activePath);
    } catch {}
  };
  const handleChange = (val) => {
    setBuf(val);
    try {
      writeFile(activePath, val);
    } catch {
      // ignore write errors in change handler; save will surface issues
    }
  };
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <EditorMonaco
          value={buf}
          onChange={handleChange}
          onSave={doSave}
          language={lang}
          theme="vs-dark"
          height="100%"
          currentPath={activePath}
        />
      </div>
    </div>
  );
}

export default function CodeEditorOverlayV2({ templateBinding, onRequestClose }){
  const [showTree, setShowTree] = useState(true);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [creating, setCreating] = useState(null);
  const [createPath, setCreatePath] = useState('');
  const fileMenuRef = useRef(null);
  const aiMenuRef = useRef(null);
  const treeRef = useRef(null);
  const [showPlay, setShowPlay] = useState(false);
  const [showCodeChat, setShowCodeChat] = useState(false);
  const [chatSize, setChatSize] = useState({ w: 360, h: 360 });
  const [resizing, setResizing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [chatPos, setChatPos] = useState({ x: 16, y: 16 });
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const dragLastRef = useRef(null);
  const resizeLastRef = useRef(null);
  const [playKey, setPlayKey] = useState(0);

  const LS_CHAT_POS = 'workspace:aiChat:pos';
  const LS_CHAT_SIZE = 'workspace:aiChat:size';
  const LS_SHOW_TREE = 'workspace:showTree';

  const computeTreeWidth = () => {
    if (typeof window === 'undefined') return 240;
    const vw = window.innerWidth || 1200;
    return Math.round(Math.max(180, Math.min(320, vw * 0.22)));
  };
  const [treeWidth, setTreeWidth] = useState(computeTreeWidth());
  const computeOverlayTree = () => {
    if (typeof window === 'undefined') return false;
    const vw = window.innerWidth || 1200;
    return vw < 1280;
  };
  const [overlayTree, setOverlayTree] = useState(computeOverlayTree());

  useEffect(() => {
    const onResize = () => {
      setTreeWidth(computeTreeWidth());
      setOverlayTree(computeOverlayTree());
      // update --vh to avoid chrome jumps
      try {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      } catch {}

      // initialize chat position near bottom-right if not dragged yet
      try {
        setChatPos(pos => {
          if (pos && pos.__init) return pos; // already initialized
          // try restore from localStorage first
          try {
            const raw = localStorage.getItem(LS_CHAT_POS);
            if (raw) {
              const p = JSON.parse(raw);
              return { ...(p||{}), __init: true };
            }
          } catch {}
          const w = window.innerWidth || 1200;
          const h = window.innerHeight || 800;
          return { x: Math.max(8, w - (chatSize.w||420) - 16), y: Math.max(8, h - (chatSize.h||360) - 16), __init: true };
        });
        // also try restore size once
        setChatSize(sz => {
          try {
            if (sz && sz.__init) return sz;
            const raw = localStorage.getItem(LS_CHAT_SIZE);
            if (raw) {
              const s = JSON.parse(raw);
              return { ...(s||{}), __init: true };
            }
          } catch {}
          return { ...sz, __init: true };
        });
        // restore file tree visibility
        try {
          const sv = localStorage.getItem(LS_SHOW_TREE);
          if (sv === '0') setShowTree(false);
          else if (sv === '1') setShowTree(true);
        } catch {}
      } catch {}
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const getPoint = (e) => {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const p = getPoint(e);
      const last = resizeLastRef.current || p;
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      resizeLastRef.current = p;
      setChatSize(s => ({ w: Math.min(Math.max(320, s.w + dx), 900), h: Math.min(Math.max(240, s.h + dy), 1200) }));
    };
    const onUp = () => { setResizing(false); resizeLastRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, [resizing]);

  useEffect(() => {
    if (!dragging) return;
    const getPoint = (e) => {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const p = getPoint(e);
      const last = dragLastRef.current || p;
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      dragLastRef.current = p;
      setChatPos(prev => {
        try {
          const w = window.innerWidth || 1200;
          const h = window.innerHeight || 800;
          const nx = Math.min(Math.max(0, (prev.x||0) + dx), Math.max(0, w - (chatSize.w||360)));
          const ny = Math.min(Math.max(0, (prev.y||0) + dy), Math.max(0, h - (chatSize.h||360)));
          const np = { ...(prev||{}), x: nx, y: ny, __init: true };
          try { localStorage.setItem(LS_CHAT_POS, JSON.stringify({ x: np.x, y: np.y })); } catch {}
          return np;
        } catch {
          return { ...(prev||{}), x: (prev.x||0)+dx, y: (prev.y||0)+dy };
        }
      });
    };
    const onUp = () => { setDragging(false); dragLastRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, [dragging, chatSize.w, chatSize.h]);

  useEffect(() => {
    // persist size
    try {
      const { w, h } = chatSize || {};
      if (w && h) localStorage.setItem(LS_CHAT_SIZE, JSON.stringify({ w, h }));
    } catch {}
  }, [chatSize.w, chatSize.h]);

  useEffect(() => {
    // persist showTree
    try { localStorage.setItem(LS_SHOW_TREE, showTree ? '1' : '0'); } catch {}
  }, [showTree]);

  useEffect(() => {
    const onDoc = (e) => {
      try {
        const t = e.target;
        if (t && (t.closest && (t.closest('.monaco-editor') || t.closest('.overflowingContentWidgets')))) return;
        const fm = fileMenuRef.current; const am = aiMenuRef.current; const tr = treeRef.current;
        if (fileMenuOpen && fm && !fm.contains(e.target)) setFileMenuOpen(false);
        if (aiMenuOpen && am && !am.contains(e.target)) setAiMenuOpen(false);
        if (showTree && tr && !tr.contains(e.target) && overlayTree) setShowTree(false);
      } catch {}
    };
    const onKey = (e) => { if (e.key === 'Escape') { if (fileMenuOpen) setFileMenuOpen(false); if (aiMenuOpen) setAiMenuOpen(false); if (overlayTree && showTree) setShowTree(false); } };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [fileMenuOpen, aiMenuOpen, showTree, overlayTree]);

  const ToolbarButton = ({ onClick, active, children, title }) => (
    <button onClick={onClick} title={title} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #334155', background: active ? '#172033' : '#0b1220', color: '#e2e8f0', whiteSpace: 'nowrap' }}>{children}</button>
  );

  const TabsBar = () => {
    const { openPaths, activePath, open, close, isDirty, saveFile } = useWorkspace();
    const [confirm, setConfirm] = useState(null); // { path }
    const containerRef = useRef(null);
    useEffect(() => {
      // Ensure active tab stays visible when many files are open
      try {
        const el = containerRef.current;
        if (!el) return;
        const target = el.querySelector(`[data-path="${CSS && CSS.escape ? CSS.escape(activePath || '') : (activePath || '').replace(/"/g, '\\"')}"]`);
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' });
        }
      } catch {}
    }, [activePath, openPaths]);
    return (
      <div ref={containerRef} style={{ display:'flex', alignItems:'center', gap:6, overflowX:'auto', overflowY:'hidden', paddingBottom:2, scrollbarWidth:'thin', WebkitOverflowScrolling:'touch', maxWidth:'100%' }}>
        {openPaths.map((p) => {
          const active = p === activePath;
          const dirty = isDirty(p);
          return (
            <div key={p} data-path={p} style={{ display:'flex', alignItems:'center', flex:'0 0 auto' }}>
              <button onClick={() => open(p)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background: active ? '#172033' : '#0b1220', color:'#e2e8f0', fontSize:12, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis' }}>
                {p.split('/').pop()} {dirty ? '•' : ''}
              </button>
              <button onClick={() => { if (isDirty(p)) setConfirm({ path: p }); else close(p); }} style={{ marginLeft:-6, padding:'6px 6px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>×</button>
            </div>
          );
        })}
        {confirm && (
          <ConfirmCloseOne path={confirm.path} onSave={() => { saveFile(confirm.path); close(confirm.path); setConfirm(null); }} onDiscard={() => { close(confirm.path); setConfirm(null); }} onCancel={() => setConfirm(null)} />
        )}
      </div>
    );
  };

  const Toolbar = () => {
    const router = useRouter();
    const { id } = router.query || {};
    const { root, normalizeDir, open, createFile, createFolder, rename, remove, files, activePath, writeFile, entryPath, setEntryPath, openPaths, isDirty, saveAll } = useWorkspace();
    const [saving, setSaving] = useState(false);
    const onSaveServer = async () => {
      if (!id || saving) return;
      try { setSaving(true); await unifiedSave(String(id), files); alert('Saved'); }
      catch(e){ alert('Save failed: ' + String(e?.message||e)); }
      finally { setSaving(false); }
    };
    const doNewFile = () => { setCreating('file'); setCreatePath(normalizeDir(root)+'untitled.js'); setFileMenuOpen(false); };
    const doNewFolder = () => { setCreating('folder'); setCreatePath(normalizeDir(root)+'folder/'); setFileMenuOpen(false); };
    const doRename = () => { const cur = activePath; if (!cur) return; const next = window.prompt('새 경로', cur); if (next && next!==cur) rename(cur, next); setFileMenuOpen(false); };
    const doDelete = () => { const cur = activePath; if (!cur) return; if (window.confirm(`${cur} 를 삭제할까요?`)) remove(cur); setFileMenuOpen(false); };
    const doLoadSample = () => {
      try {
        const g = { nodes: [
          { id: 'start', type:'system', label:'게임 시작!' },
          { id: 'intro', type:'ai', label:'플레이어 여러분, 준비되셨나요?' },
          { id: 'act', type:'user_action', label:'행동을 입력하세요.' },
          { id: 'end', type:'system', label:'라운드 종료.' }
        ], edges:[
          { id:'e1', source:'start', target:'intro', label:'' },
          { id:'e2', source:'intro', target:'act', label:'' },
          { id:'e3', source:'act', target:'end', label:'' }
        ]};
        writeFile('/graph/prompt-graph.json', JSON.stringify(g, null, 2)+'\n');
        const cfg = { version:1, roles:['players','observers'], voteThreshold:0.6667, durations:[30,60,90,120,180], entryNode:'start', ai:{ model:'gemini-2.5-flash' } };
        writeFile('/game/runtime.config.json', JSON.stringify(cfg, null, 2)+'\n');
        const hooks = [
          'export function onUserAction(ctx, input){',
          '  if ((input||"").toLowerCase().includes("다시")) return "intro";',
          '  return "end";',
          '}',
          'export function selectNext(ctx, neighbors){',
          '  return neighbors?.[0]?.id ?? null;',
          '}',
        ].join('\n');
        writeFile('/game/hooks/automation.js', hooks+'\n');
        open('/graph/prompt-graph.json');
      } catch {}
      setFileMenuOpen(false);
    };

    // Overlay close with dirty check
    const requestClose = () => {
      const dirtyList = (openPaths||[]).filter(p => isDirty(p));
      if (dirtyList.length === 0) { onRequestClose && onRequestClose(); return; }
      setCloseConfirm({ paths: dirtyList });
    };

    return (
      <div style={{ display:'grid', gridTemplateRows: toolbarCollapsed ? 'auto' : 'auto auto auto', gap:6, padding:'8px', borderBottom:'1px solid #25314a', background:'rgba(2,6,23,0.5)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <ToolbarButton onClick={() => { setFileMenuOpen(false); setAiMenuOpen(false); setShowTree(v=>!v); }} active={showTree} title="파일트리">☰</ToolbarButton>
          <div ref={fileMenuRef} style={{ position:'relative' }}>
            <ToolbarButton onClick={() => setFileMenuOpen(v=>{ const next=!v; if (next) { setAiMenuOpen(false); if (overlayTree) setShowTree(false); } return next; })} active={fileMenuOpen} title="파일">파일</ToolbarButton>
            {fileMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6, minWidth:180 }}>
                <button onClick={doNewFile} style={menuItem}>새 파일</button>
                <button onClick={doNewFolder} style={menuItem}>새 폴더</button>
                <button onClick={doRename} style={menuItem}>이름 변경</button>
                <button onClick={doDelete} style={{ ...menuItem, border:'1px solid #7f1d1d', color:'#fecaca' }}>삭제</button>
                <div style={{ height:1, background:'rgba(148,163,184,0.2)', margin:'4px 2px' }} />
                <button onClick={doLoadSample} style={{ ...menuItem, border:'1px solid #2563eb', color:'#93c5fd' }}>샘플 그래프 불러오기</button>
              </div>
            )}
          </div>
          <div ref={aiMenuRef} style={{ position:'relative' }}>
            <ToolbarButton onClick={() => setAiMenuOpen(v=>{ const next=!v; if (next) { setFileMenuOpen(false); if (overlayTree) setShowTree(false); } return next; })} active={aiMenuOpen} title="AI 코딩">AI 코딩</ToolbarButton>
            {aiMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6, minWidth:180 }}>
                <button onClick={() => { setShowCodeChat(v=>!v); setAiMenuOpen(false); }} style={menuItem}>{showCodeChat?'AI 코드채팅 끄기':'AI 코드채팅 켜기'}</button>
              </div>
            )}
          </div>
          <ToolbarButton onClick={() => setShowPlay(true)} active={showPlay} title="플레이">플레이</ToolbarButton>
          <ToolbarButton onClick={onSaveServer} title="저장" disabled={!id || saving}>{saving?'저장중…':'저장'}</ToolbarButton>
          <ToolbarButton onClick={requestClose} title="닫기">닫기</ToolbarButton>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <ToolbarButton onClick={() => setToolbarCollapsed(v=>!v)} active={toolbarCollapsed} title={toolbarCollapsed?'펼치기':'접기'}>{toolbarCollapsed?'펼치기':'접기'}</ToolbarButton>
          </div>
        </div>
        {!toolbarCollapsed && (
          <>
            <TabsBar />
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', fontSize:12 }}>
              <span>현재: <strong style={{ color:'#e2e8f0' }}>{activePath}</strong></span>
              <button title="엔트리 파일 지정" onClick={() => setEntryPath(activePath)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>엔트리로</button>
              <button title="모두 저장" onClick={() => saveAll()} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>모두 저장</button>
              <button title="프롬프트 편집기 열기" onClick={() => open('/graph/prompt-graph.json')} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>프롬프트</button>
              <button title="런타임 설정 열기" onClick={() => open('/game/runtime.config.json')} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>런타임</button>
            </div>
          </>
        )}
        {creating && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:'#e2e8f0', fontSize:12 }}>{creating==='file'?'파일 경로':'폴더 경로'}</span>
            <input value={createPath} onChange={e=>setCreatePath(e.target.value)} style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
            <button onClick={() => { try { creating==='file'? createFile(createPath,'\n') : createFolder(createPath); open(createPath.replace(/\/$/, '')); } finally { setCreating(null); } }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>생성</button>
            <button onClick={() => setCreating(null)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>취소</button>
          </div>
        )}
      </div>
    );
  };

  const [closeConfirm, setCloseConfirm] = useState(null); // { paths: [] }

  class WorkspaceBoundary extends React.Component {
    constructor(p){ super(p); this.state={ hasError:false }; }
    static getDerivedStateFromError(){ return { hasError:true }; }
    componentDidCatch(err){ try{ console.warn('[CodeEditorOverlayV2] workspace unavailable', err?.message||err); }catch{} }
    render(){ return this.state.hasError ? (
      <div style={{ padding:16, color:'#94a3b8' }}>작업공간 컨텍스트가 없어 코드를 표시할 수 없습니다.</div>
    ) : this.props.children; }
  }

  return (
    <WorkspaceBoundary>
      {templateBinding ? (
        <SyncTemplateToVfs text={templateBinding.text} setText={templateBinding.setText} />
      ) : null}
      <div style={{ position:'relative', display:'flex', height:'calc(var(--vh, 1vh) * 100)', background:'#0b1220', paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }}>
        {!overlayTree && (
          <div ref={treeRef} style={{ width: showTree ? treeWidth : 0, transition: 'width 200ms ease, opacity 200ms ease', opacity: showTree ? 1 : 0, overflow: 'hidden', pointerEvents: showTree ? 'auto' : 'none' }}>
            <FileTree />
          </div>
        )}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
          <Toolbar />
          <div style={{ position:'relative', flex:1, minHeight:0, overflow:'hidden' }}>
            <div style={{ position:'absolute', inset:0 }}>
              <EditorPane />
            </div>
            {overlayTree && showTree && (
              <div ref={treeRef} style={{ position:'absolute', left:0, top:0, bottom:0, width:treeWidth, background:'#0b1220', borderRight:'1px solid #25314a', boxShadow:'8px 0 24px -12px rgba(0,0,0,0.4)', transition:'opacity 200ms ease', zIndex:300 }}>
                <FileTree />
              </div>
            )}
            {overlayTree && showTree && (
              <div onClick={()=>setShowTree(false)} style={{ position:'absolute', inset:0, background:'rgba(2,6,23,0.4)', backdropFilter:'blur(2px)', zIndex: 250 }} />
            )}
          </div>
        </div>
      </div>
      {showPlay && (
        <div style={{ position:'absolute', inset:0, zIndex: 1600, background:'rgba(2,6,23,0.94)' }}>
          <div style={{ position:'absolute', left:0, top:0, right:0, bottom:0, paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }}>
            <button onClick={() => setShowPlay(false)} title="닫기" style={{ position:'absolute', top:'calc(env(safe-area-inset-top) + 10px)', right:'calc(env(safe-area-inset-right) + 10px)', zIndex: 10, padding:'8px 10px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>닫기</button>
            <button onClick={() => setPlayKey(k=>k+1)} title="재시작" style={{ position:'absolute', top:'calc(env(safe-area-inset-top) + 10px)', left:'calc(env(safe-area-inset-left) + 10px)', zIndex: 10, padding:'8px 10px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>재시작</button>
            <div style={{ height:'calc(var(--vh, 1vh) * 100)', display:'flex', alignItems:'stretch', justifyContent:'center' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div key={playKey} style={{ height:'100%', width:'100%' }}>
                  <PlayOverlayContent templateBinding={templateBinding} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {closeConfirm && (
        <ConfirmCloseMany
          paths={closeConfirm.paths}
          onAfterSaveAll={() => { setCloseConfirm(null); onRequestClose && onRequestClose(); }}
          onDiscard={() => { setCloseConfirm(null); onRequestClose && onRequestClose(); }}
          onCancel={() => setCloseConfirm(null)}
        />
      )}
      {showCodeChat && !chatMinimized && (
        <div style={chatFullscreen
          ? { position:'fixed', left:0, top:0, right:0, bottom:0, zIndex: 1400, paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }
          : { position:'fixed', left: (chatPos.x||16), top: (chatPos.y||16), zIndex: 1200, width: chatSize.w, height: chatSize.h, background:'transparent' }
        }>
          <div style={chatFullscreen ? { position:'absolute', inset:0 } : { position:'absolute', inset:0 }}>
            <AICodeChatPanel
              onClose={() => setShowCodeChat(false)}
              onDragHandleDown={(e) => { setDragging(true); dragLastRef.current = null; }}
              onToggleFullscreen={() => setChatFullscreen(v=>!v)}
              onMinimize={() => setChatMinimized(true)}
              enableFullscreenButton
              enableMinimizeButton
            />
            {!chatFullscreen && (
              <div onMouseDown={(e)=>{ resizeLastRef.current = { x: e.clientX, y: e.clientY }; setResizing(true); }} onTouchStart={(e)=>{ const t=e.touches?.[0]; resizeLastRef.current = t?{x:t.clientX,y:t.clientY}:null; setResizing(true); }} title="드래그로 크기 조절" style={{ position:'absolute', left:8, bottom:8, width:16, height:16, border:'1px solid #334155', background:'#0b1220', borderRadius:4, cursor:'nwse-resize', opacity:0.9 }} />
            )}
          </div>
        </div>
      )}
      {showCodeChat && chatMinimized && (
        <button onClick={() => setChatMinimized(false)} title="AI 채팅 열기" style={{ position:'fixed', right:'calc(env(safe-area-inset-right) + 12px)', bottom:'calc(env(safe-area-inset-bottom) + 12px)', zIndex:1500, width:48, height:48, borderRadius:24, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', boxShadow:'0 10px 24px rgba(0,0,0,0.5)' }}>AI</button>
      )}
    </WorkspaceBoundary>
  );
}

const menuItem = {
  textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap'
};

function ConfirmDialogShell({ title, children, actions }){
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,23,0.6)', zIndex: 2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'env(safe-area-inset-top) 12px env(safe-area-inset-bottom)' }}>
      <div style={{ width:'min(560px, 96vw)', background:'#0b1220', border:'1px solid #334155', borderRadius:12, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ padding:'12px 14px', borderBottom:'1px solid #25314a', color:'#e2e8f0', fontWeight:700 }}>{title}</div>
        <div style={{ padding:12 }}>{children}</div>
        <div style={{ padding:12, borderTop:'1px solid #25314a', display:'flex', gap:8, justifyContent:'flex-end' }}>
          {actions}
        </div>
      </div>
    </div>
  );
}

function ConfirmCloseOne({ path, onSave, onDiscard, onCancel }){
  return (
    <ConfirmDialogShell
      title="파일을 닫기 전에 저장할까요?"
      children={<div style={{ color:'#cbd5e1', fontSize:13 }}>변경 사항이 있는 파일: <strong style={{ color:'#e2e8f0' }}>{path}</strong></div>}
      actions={
        <>
          <button onClick={onDiscard} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca' }}>저장 안 함</button>
          <button onClick={onCancel} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>취소</button>
          <button onClick={onSave} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>저장</button>
        </>
      }
    />
  );
}

function ConfirmCloseMany({ paths, onAfterSaveAll, onDiscard, onCancel }){
  // Access workspace context at component top-level (valid hook usage)
  const { saveAll, files } = useWorkspace();
  const router = useRouter();
  const { id } = router.query || {};
  const handleSaveAll = async () => {
    try {
      // Persist both Maker (if present) and workspace files
      if (id) await unifiedSave(String(id), files);
      // Mark workspace clean locally
      try { saveAll(); } catch {}
    } catch (e) {
      console.error('unified saveAll failed', e);
    }
    onAfterSaveAll && onAfterSaveAll();
  };
  return (
    <ConfirmDialogShell
      title="수정사항을 저장하시겠습니까?"
      children={<div style={{ color:'#cbd5e1', fontSize:13 }}>작성 중인 변경 사항이 있습니다. 저장하시겠습니까?</div>}
      actions={
        <>
          <button onClick={onDiscard} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca' }}>저장 안 함</button>
          <button onClick={onCancel} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>취소</button>
          <button onClick={handleSaveAll} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>모두 저장</button>
        </>
      }
    />
  );
}

// (모바일 전용) 단축키는 제외
