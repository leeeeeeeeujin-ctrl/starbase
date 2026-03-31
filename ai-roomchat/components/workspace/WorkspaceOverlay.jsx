"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "./CodeWorkspaceProvider.jsx";
import FileTree from "./FileTree.jsx";
import EditorMonaco from "../EditorMonaco.jsx";
import SyncTemplateToVfs from './SyncTemplateToVfs.jsx';
import AIChatDock from './AIChatDock.jsx';
import { usePersistentState } from './hooks/usePersistentState';
import { readRankKeyringSnapshot, RANK_KEYRING_STORAGE_EVENT } from '@/lib/rank/keyringStorage';

function EditorPane() {
  const { files, drafts, setDraft, activePath, inferLang, saveFileAndPush, saveFile, storageNamespace, writeFile } = useWorkspace();
  const file = files[activePath];
  const lang = useMemo(() => inferLang(activePath), [activePath, inferLang]);
  const initialBuf = drafts?.[activePath] ?? (file?.content ?? '');
  const [buf, setBuf] = useState(() => initialBuf);
  // When switching files or drafts, load content into buffer
  useEffect(() => { setBuf(drafts?.[activePath] ?? (file?.content ?? '')); }, [activePath, drafts, file]);
  if (!file) return <div style={{ padding: 16, color: "#e2e8f0" }}>파일을 선택하세요.</div>;
  const doSave = async () => {
    try {
      if (file.readonly) return;
      // Commit buffer to VFS then push to server
      writeFile(activePath, buf);
      saveFile(activePath);
      const id = storageNamespace || '';
      if (id) await saveFileAndPush(id, activePath, buf);
    } catch {}
  };
  const handleChange = (val) => {
    setBuf(val);
    if (file.readonly) return;
    try { setDraft(activePath, val); } catch {}
  };
  return (
    <div style={{ position:'relative', height:'100%', width:'100%' }}>
      <div style={{ position:'absolute', inset:0 }}>
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

export default function WorkspaceOverlay({ gameData, templateBinding }) {
  // 肄붾뱶 ?먮뵒???꾨㈃ ?뚮젅???ㅻ쾭?덉씠
  const [showPlay, setShowPlay] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const [chatDockOpen, setChatDockOpen] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [keyringStatus, setKeyringStatus] = useState(() => {
    const snapshot = readRankKeyringSnapshot();
    return {
      ready: Array.isArray(snapshot.entries) && snapshot.entries.some(entry => entry.isActive),
      count: Array.isArray(snapshot.entries) ? snapshot.entries.length : 0,
    };
  });
  const fileMenuRef = useRef(null);
  const toolsMenuRef = useRef(null);
  const treeRef = useRef(null);
  const [creating, setCreating] = useState(null); // null | 'file' | 'folder'
  const [createPath, setCreatePath] = useState('');
  // Responsive tree width: clamp(180px, 22vw, 320px)
  const computeTreeWidth = () => {
    if (typeof window === 'undefined') return 240;
    const vw = window.innerWidth || 1200;
    return Math.round(Math.max(180, Math.min(320, vw * 0.22)));
  };
  const [treeWidth, setTreeWidth] = useState(computeTreeWidth());
  // On narrow screens, show tree as overlay so editor keeps full width
  const computeOverlayTree = () => {
    if (typeof window === 'undefined') return false;
    const vw = window.innerWidth || 1200;
    return vw < 1280; // overlay mode under 1280px
  };
  const [overlayTree, setOverlayTree] = useState(computeOverlayTree());
  const PREF_SNAP = 'maker:ui:snap';

  useEffect(() => {
    const updateKeyringStatus = () => {
      const snapshot = readRankKeyringSnapshot();
      setKeyringStatus({
        ready: Array.isArray(snapshot.entries) && snapshot.entries.some(entry => entry.isActive),
        count: Array.isArray(snapshot.entries) ? snapshot.entries.length : 0,
      });
    };
    updateKeyringStatus();
    if (typeof window !== 'undefined') {
      window.addEventListener(RANK_KEYRING_STORAGE_EVENT, updateKeyringStatus);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(RANK_KEYRING_STORAGE_EVENT, updateKeyringStatus);
      }
    };
  }, []);
  // keep tree width responsive on resize
  useEffect(() => {
    const onResize = () => {
      setTreeWidth(computeTreeWidth());
      setOverlayTree(computeOverlayTree());
    };
    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', onResize);
      }
    } catch {}
    return () => {
      try { if (typeof window !== 'undefined') window.removeEventListener('resize', onResize); } catch {}
    };
  }, []);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(PREF_SNAP);
        if (saved === 'mobile') { setShowTree(false); setToolbarCollapsed(true); }
        else if (saved === 'desktop') { setShowTree(true); setToolbarCollapsed(false); }
        else {
          const w = window.innerWidth || 1200;
          if (w < 980) { setShowTree(false); setToolbarCollapsed(true); }
        }
      }
    } catch {}
  }, []);
  // ?대┃ 諛붽묑 媛먯?濡??쒕∼?ㅼ슫 ?먮룞 ?リ린
  useEffect(() => {
    const onDoc = (e) => {
      try {
        const t = e.target;
        // ?먮뵒???대? ?대┃? ?쒕∼?ㅼ슫/?몃━ ?リ린?먯꽌 ?쒖쇅
        if (t && (t.closest && (t.closest('.monaco-editor') || t.closest('.overflowingContentWidgets')))) return;
        const fm = fileMenuRef.current;
        const tr = treeRef.current;
        const tm = toolsMenuRef.current;
        if (fileMenuOpen && fm && !fm.contains(e.target)) setFileMenuOpen(false);
        if (toolsMenuOpen && tm && !tm.contains(e.target)) setToolsMenuOpen(false);
        // ?뚯씪?몃━媛 ?대젮?덉쓣 ?? ?뚯씪?몃━ ?곸뿭 諛뽰쓣 ?곗튂?섎㈃ ?リ린
        if (showTree && tr && !tr.contains(e.target)) setShowTree(false);
      } catch {}
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (fileMenuOpen) setFileMenuOpen(false);
        if (toolsMenuOpen) setToolsMenuOpen(false);
        if (showTree) setShowTree(false);
        if (chatDockOpen) setChatDockOpen(false);
      }
    };
    const onScroll = () => {
      // ?ㅽ겕濡??곗튂 ?대룞 ???대┛ 硫붾돱/?뚯씪?몃━???リ린(媛꾨떒 ?몄쓽)
      if (fileMenuOpen) setFileMenuOpen(false);
      if (showTree) setShowTree(false);
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('touchmove', onScroll, { passive: true });
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('touchmove', onScroll);
    };
  }, [chatDockOpen, fileMenuOpen, showTree, toolsMenuOpen]);

  // ?대컮 ?묓옒 ???쒕∼?ㅼ슫 紐⑤몢 ?リ린
  useEffect(() => {
    if (toolbarCollapsed) {
      setFileMenuOpen(false);
      setToolsMenuOpen(false);
    }
  }, [toolbarCollapsed]);
  // lock visual height to avoid mobile browser chrome jumps
  useEffect(() => {
    try {
      const setVh = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      };
      setVh();
      window.addEventListener('resize', setVh);
      return () => window.removeEventListener('resize', setVh);
    } catch {}
  }, []);
  // no split dragging in overlay mode
  const Toolbar = () => {
    const { root, normalizeDir, open, createFile, createFolder, rename, remove, files, activePath, writeFile, openPaths, close, entryPath, setEntryPath, saveAllAndPush, storageNamespace } = useWorkspace();
    const doNewFile = () => { setCreating('file'); setCreatePath(normalizeDir(root)+'untitled.js'); setFileMenuOpen(false); };
    const doNewFolder = () => { setCreating('folder'); setCreatePath(normalizeDir(root)+'folder/'); setFileMenuOpen(false); };
    const doRename = () => { const cur = activePath; if (!cur) return; const next = window.prompt('??寃쎈줈', cur); if (next && next!==cur) rename(cur, next); setFileMenuOpen(false); };
    const doDelete = () => { const cur = activePath; if (!cur) return; if (window.confirm(`${cur} 瑜???젣?좉퉴??`)) remove(cur); setFileMenuOpen(false); };
    const doResetRoot = () => {
      open('/');
    };
    const doLoadSample = () => {
      try {
        const g = { nodes: [
          { id: 'start', type:'system', label:'寃뚯엫 ?쒖옉!' },
          { id: 'intro', type:'ai', label:'?뚮젅?댁뼱 ?щ윭遺? 以鍮꾨릺?⑤굹??' },
          { id: 'act', type:'user_action', label:'?됰룞???낅젰?섏꽭??' },
          { id: 'end', type:'system', label:'?쇱슫??醫낅즺.' }
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
          '  if ((input||"").toLowerCase().includes("?ㅼ떆")) return "intro";',
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
    const toggleChatDock = () => {
      setFileMenuOpen(false);
      setToolsMenuOpen(false);
      setShowTree(false);
      setChatDockOpen((prev) => !prev);
    };
    const extractGeminiText = (result) => {
      try {
        const cand = result?.candidates?.[0];
        const parts = cand?.content?.parts || [];
        const textPart = parts.find(p => typeof p?.text === 'string')?.text || '';
        return String(textPart || '');
      } catch { return ''; }
    };
    const stripFences = (t) => t.replace(/^```(?:[a-z]+)?/i, '').replace(/```$/i, '').trim();

    const MenuButton = ({ onClick, active, label }) => (
      <button onClick={onClick} title={label} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #334155', background: active ? '#172033' : '#0b1220', color: '#e2e8f0', whiteSpace: 'nowrap' }}>{label}</button>
    );
    const doSaveAll = async () => {
      try {
        const id = storageNamespace || '';
        if (!id) return;
        await saveAllAndPush(id);
        try { window.dispatchEvent(new CustomEvent('toast:show', { detail: { text: '紐⑤몢 ????꾨즺', type: 'success' } })); } catch {}
      } catch (e) {
        console.warn('[Workspace] 紐⑤몢 ????ㅽ뙣', e);
        try { window.dispatchEvent(new CustomEvent('toast:show', { detail: { text: '紐⑤몢 ????ㅽ뙣', type: 'error' } })); } catch {}
      }
      setFileMenuOpen(false);
    };

    return (
      <div style={{ display: 'grid', gridTemplateRows: toolbarCollapsed ? 'auto' : 'auto auto auto', gap: 6, padding: '8px', borderBottom: '1px solid #25314a', background: 'rgba(2,6,23,0.5)' }}>
        {/* 1?? ?꾨쾭嫄?/ ?뚯씪 硫붾돱 / AI 肄붾뵫 / ?뚯뒪??*/}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => { setFileMenuOpen(false); setShowTree(v=>!v); }} title="파일 트리" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #334155', background: showTree ? '#172033' : '#0b1220', color: '#e2e8f0' }}>트리</button>
          <div ref={fileMenuRef} style={{ position:'relative' }}>
            <MenuButton onClick={() => setFileMenuOpen(v=>{ const next=!v; if (next) {  setShowTree(false); } return next; })} active={fileMenuOpen} label="?뚯씪" />
            {fileMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6, minWidth:180 }}>
                <button onClick={doNewFile} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>???뚯씪</button>
                <button onClick={doNewFolder} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>???대뜑</button>
                <button onClick={doRename} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>이름 변경</button>
                <button onClick={doDelete} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca', whiteSpace:'nowrap' }}>??젣</button>
                <div style={{ height:1, background:'rgba(148,163,184,0.2)', margin:'4px 2px' }} />
                <button onClick={doSaveAll} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #10b981', background:'#064e3b', color:'#d1fae5', whiteSpace:'nowrap' }}>모두 저장</button>
                <button onClick={doLoadSample} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #2563eb', background:'#0b1220', color:'#93c5fd', whiteSpace:'nowrap' }}>?섑뵆 洹몃옒??遺덈윭?ㅺ린</button>
              </div>
            )}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <MenuButton onClick={toggleChatDock} active={chatDockOpen} label="AI Chat" />
            <span
              style={{
                padding: '4px 8px',
                borderRadius: 999,
                border: keyringStatus.ready ? '1px solid rgba(14,165,233,0.5)' : '1px solid rgba(248,113,113,0.4)',
                background: keyringStatus.ready ? 'rgba(14,165,233,0.15)' : 'rgba(248,113,113,0.15)',
                color: keyringStatus.ready ? '#7dd3fc' : '#fecaca',
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              {keyringStatus.ready ? `AI keys ${keyringStatus.count}` : 'No AI key'}
            </span>
          </div>
          <MenuButton onClick={() => setShowPlay(true)} active={showPlay} label="플레이" />
          <div ref={toolsMenuRef} style={{ position:'relative' }}>
            <MenuButton onClick={() => setToolsMenuOpen(v=>{ const next=!v; if (next) { setFileMenuOpen(false); setShowTree(false); } return next; })} active={toolsMenuOpen} label="도구" />
            {toolsMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6, minWidth:200 }}>
                <button onClick={() => { try { window.location.href = '/prompts'; } catch {} finally { setToolsMenuOpen(false); } }} data-test-id="open-prompt-editor" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>프롬프트 에디터</button>
                <button onClick={() => { try { open('/graph/prompt-graph.json'); } catch {} finally { setToolsMenuOpen(false); } }} data-test-id="open-prompt-graph" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>?꾨＼?꾪듃 洹몃옒???닿린</button>
                <button onClick={() => { try { open('/game/runtime.config.json'); } catch {} finally { setToolsMenuOpen(false); } }} data-test-id="open-runtime-config" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>?고????ㅼ젙 ?닿린</button>
                <button onClick={() => { try { window.location.href = '/studio?mode=ui'; } catch {} finally { setToolsMenuOpen(false); } }} data-test-id="open-ui-editor" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>UI 편집기</button>
                <div style={{ height:1, background:'rgba(148,163,184,0.2)', margin:'4px 2px' }} />
                <button onClick={() => { setChatDockOpen(true); setToolsMenuOpen(false); }} data-test-id="open-ai-agent" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #2563eb', background:'#0b1220', color:'#93c5fd', whiteSpace:'nowrap' }}>AI 梨꾪똿</button>
                <button onClick={() => { try { window.location.href = '/game/dev-local'; } catch {} finally { setToolsMenuOpen(false); } }} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>硫붿씤寃뚯엫 (dev-local)</button>
                <button onClick={() => { try { window.location.href = '/game/dev-graph'; } catch {} finally { setToolsMenuOpen(false); } }} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>硫붿씤寃뚯엫 (dev-graph)</button>
              </div>
            )}
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <MenuButton onClick={onSaveServer} active={false} label={saving ? '저장중…' : '저장'} />
            <MenuButton onClick={() => setToolbarCollapsed(v=>!v)} active={toolbarCollapsed} label={toolbarCollapsed ? '펼치기' : '접기'} />
          </div>
        </div>

        {/* ???뚯씪/?대뜑 ?낅젰 UI */}
        {creating && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:'#e2e8f0', fontSize:12 }}>{creating==='file'?'?뚯씪 寃쎈줈':'?대뜑 寃쎈줈'}</span>
            <input value={createPath} onChange={e=>setCreatePath(e.target.value)} style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
            <button onClick={() => { try { creating==='file'? createFile(createPath,'\n') : createFolder(createPath); open(createPath.replace(/\/$/, '')); } finally { setCreating(null); } }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>?앹꽦</button>
            <button onClick={() => setCreating(null)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>痍⑥냼</button>
          </div>
        )}

        {!toolbarCollapsed && (
          <>
            {/* 2?? ?뚯씪紐⑸줉(?? */}
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {openPaths.map((p) => {
                const active = p === activePath;
                return (
                  <div key={p} style={{ display:'flex', alignItems:'center' }}>
                    <button onClick={() => open(p)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background: active ? '#172033' : '#0b1220', color:'#e2e8f0', fontSize:12 }}>{p.split('/').pop()}</button>
                    <button onClick={() => close(p)} style={{ marginLeft:-6, padding:'6px 6px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>횞</button>
                  </div>
                );
              })}
            </div>
            {/* 3?? ?꾩옱 ?뚯씪 / ?뷀듃由щ줈 / ?묎린 */}
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', fontSize:12 }}>
              <span>?꾩옱: <strong style={{ color:'#e2e8f0' }}>{activePath}</strong></span>
              <button title="?뷀듃由??뚯씪 吏?? onClick={() => setEntryPath(activePath)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>?뷀듃由щ줈</button>
            </div>
          </>
        )}
      </div>
    );
  };
  class WorkspaceBoundary extends React.Component {
    constructor(p){ super(p); this.state={ hasError:false }; }
    static getDerivedStateFromError(){ return { hasError:true }; }
    componentDidCatch(err){ try{ console.warn('[WorkspaceOverlay] workspace unavailable', err?.message||err); }catch{} }
    render(){ return this.state.hasError ? null : this.props.children; }
  }

  return (
    <WorkspaceBoundary>
    {templateBinding ? (
      <SyncTemplateToVfs text={templateBinding.text} setText={templateBinding.setText} />
    ) : null}
      <div style={{ position: 'relative', display: 'flex', height: 'calc(var(--vh, 1vh) * 100)', background: '#0b1220' }}>
        {!overlayTree && (
          <div
            ref={treeRef}
            style={{
              width: showTree ? treeWidth : 0,
              transition: 'width 200ms ease, opacity 200ms ease',
              opacity: showTree ? 1 : 0,
              overflow: 'hidden',
              pointerEvents: showTree ? 'auto' : 'none',
            }}
          >
            <FileTree />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }}>
          <Toolbar />
          {/* 以묒븰 ?곸뿭: ?대컮 ?꾨옒 而⑦뀗痢좉? 1fr濡??숈옉, ?먮뵒?곕뒗 100% 梨꾩? */}
          <div style={{ position:'relative', flex: 1, minHeight: 0, overflow:'hidden' }}>
            <div style={{ position:'absolute', inset: 0 }}>
              <EditorPane />
            </div>
            {/* overlayTree 紐⑤뱶???뚯씪?몃━瑜?而⑦뀗痢??곸뿭 ?꾩뿉 ?ㅻ쾭?덉씠 */}
            {overlayTree && showTree && (
              <div
                ref={treeRef}
                style={{
                  position:'absolute', left:0, top:0, bottom:0,
                  width: treeWidth, background:'#0b1220', borderRight:'1px solid #25314a',
                  boxShadow:'8px 0 24px -12px rgba(0,0,0,0.4)',
                  transition:'opacity 200ms ease',
                  zIndex: 300,
                }}
              >
                <FileTree />
              </div>
            )}
            {overlayTree && showTree && (
              <div onClick={()=>setShowTree(false)} style={{ position:'absolute', inset:0, background:'rgba(2,6,23,0.4)', backdropFilter:'blur(2px)', zIndex: 250 }} />
            )}
          </div>
          {/* Floating chat overlay (independent of editor layout) */}
          <div />
        </div>
      </div>
      {/* Fullscreen Play Overlay */}
      {showPlay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(2,6,23,0.94)' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
              paddingRight: 'env(safe-area-inset-right)',
            }}
          >
            <button
              onClick={() => setShowPlay(false)}
              title="닫기"
              style={{
                position: 'absolute',
                top: 'calc(env(safe-area-inset-top) + 10px)',
                right: 'calc(env(safe-area-inset-right) + 10px)',
                zIndex: 10,
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #334155',
                background: '#0b1220',
                color: '#e2e8f0',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
            >
              닫기
            </button>
            <div style={{ height: 'calc(var(--vh, 1vh) * 100)', display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <PlayOverlayContent templateBinding={templateBinding} />
              </div>
            </div>
          </div>
        </div>
      )}
      {chatDockOpen && (
        <div style={{ position:'fixed', right:24, bottom:24, zIndex:40 }}>
          <AIChatDock onClose={() => setChatDockOpen(false)} />
        </div>
      )}
    </WorkspaceBoundary>
  );
}

function PlayOverlayContent({ templateBinding }){
  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 560,
          display: 'grid',
          gap: 10,
          padding: 24,
          borderRadius: 20,
          border: '1px solid rgba(148,163,184,0.24)',
          background: 'rgba(2,6,23,0.72)',
          color: '#cbd5e1',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Legacy Play Disabled
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#f8fafc' }}>
          워크스페이스 플레이 프리뷰는 중단되었습니다.
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7 }}>
          기존 `MainGameMobileUI` 프리뷰는 새 텍스트 배틀 실행기로 다시 연결할 예정입니다.
        </div>
      </div>
    </div>
  );
}
