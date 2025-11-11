"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "./CodeWorkspaceProvider.jsx";
import FileTree from "./FileTree.jsx";
import EditorMonaco from "../EditorMonaco.jsx";
import dynamic from 'next/dynamic';
const MainGameMobileUI = dynamic(() => import('../game/MainGameMobileUI.jsx'), { ssr: false });
import SyncTemplateToVfs from './SyncTemplateToVfs.jsx';
import AIChatDock from './AIChatDock.jsx';
import { usePersistentState } from './hooks/usePersistentState';

  function EditorPane() {
    const { files, activePath, inferLang, saveFileAndPush, saveFile, storageNamespace, writeFile } = useWorkspace();
    const file = files[activePath];
    const lang = useMemo(() => inferLang(activePath), [activePath, inferLang]);
    const [buf, setBuf] = useState(() => (file?.content ?? ''));
    // When switching files, load content into buffer
    useEffect(() => { setBuf(file?.content ?? ''); }, [activePath]);
    if (!file) return <div style={{ padding: 16, color: "#e2e8f0" }}>파일을 선택하세요.</div>;
    const doSave = async () => {
      try {
        if (file.readonly) return;
        // Commit buffer to VFS then push to server
        writeFile(activePath, buf);
        saveFile(activePath);
        const id = storageNamespace || '';
        if (id) await saveFileAndPush(id, activePath);
      } catch {}
    };
    return (
      <div style={{ position:'relative', height:'100%', width:'100%' }}>
        <div style={{ position:'absolute', inset:0 }}>
          <EditorMonaco
            value={buf}
            onChange={(val) => setBuf(val)}
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
  // 코드 에디터 전면 플레이 오버레이
  const [showPlay, setShowPlay] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const [chatDockOpen, setChatDockOpen] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const fileMenuRef = useRef(null);
  const aiMenuRef = useRef(null);
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
  // 클릭 바깥 감지로 드롭다운 자동 닫기
  useEffect(() => {
    const onDoc = (e) => {
      try {
        const t = e.target;
        // 에디터 내부 클릭은 드롭다운/트리 닫기에서 제외
        if (t && (t.closest && (t.closest('.monaco-editor') || t.closest('.overflowingContentWidgets')))) return;
        const fm = fileMenuRef.current;
        const am = aiMenuRef.current;
        const tr = treeRef.current;
        const tm = toolsMenuRef.current;
        if (fileMenuOpen && fm && !fm.contains(e.target)) setFileMenuOpen(false);
        if (aiMenuOpen && am && !am.contains(e.target)) setAiMenuOpen(false);
        if (toolsMenuOpen && tm && !tm.contains(e.target)) setToolsMenuOpen(false);
        // 파일트리가 열려있을 때, 파일트리 영역 밖을 터치하면 닫기
        if (showTree && tr && !tr.contains(e.target)) setShowTree(false);
      } catch {}
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (fileMenuOpen) setFileMenuOpen(false);
        if (aiMenuOpen) setAiMenuOpen(false);
        if (toolsMenuOpen) setToolsMenuOpen(false);
        if (showTree) setShowTree(false);
      }
    };
    const onScroll = () => {
      // 스크롤/터치 이동 시 열린 메뉴/파일트리는 닫기(간단 편의)
      if (fileMenuOpen) setFileMenuOpen(false);
      if (aiMenuOpen) setAiMenuOpen(false);
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
  }, [fileMenuOpen, aiMenuOpen, showTree]);

  // 툴바 접힘 시 드롭다운 모두 닫기
  useEffect(() => {
    if (toolbarCollapsed) {
      setFileMenuOpen(false);
      setAiMenuOpen(false);
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
    const doRename = () => { const cur = activePath; if (!cur) return; const next = window.prompt('새 경로', cur); if (next && next!==cur) rename(cur, next); setFileMenuOpen(false); };
    const doDelete = () => { const cur = activePath; if (!cur) return; if (window.confirm(`${cur} 를 삭제할까요?`)) remove(cur); setFileMenuOpen(false); };
    const doResetRoot = () => {
      open('/');
    };
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
        try { window.dispatchEvent(new CustomEvent('toast:show', { detail: { text: '모두 저장 완료', type: 'success' } })); } catch {}
      } catch (e) {
        console.warn('[Workspace] 모두 저장 실패', e);
        try { window.dispatchEvent(new CustomEvent('toast:show', { detail: { text: '모두 저장 실패', type: 'error' } })); } catch {}
      }
      setFileMenuOpen(false);
    };

    return (
      <div style={{ display: 'grid', gridTemplateRows: toolbarCollapsed ? 'auto' : 'auto auto auto', gap: 6, padding: '8px', borderBottom: '1px solid #25314a', background: 'rgba(2,6,23,0.5)' }}>
        {/* 1열: 햄버거 / 파일 메뉴 / AI 코딩 / 테스트 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => { setFileMenuOpen(false); setAiMenuOpen(false); setShowTree(v=>!v); }} title="파일트리" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #334155', background: showTree ? '#172033' : '#0b1220', color: '#e2e8f0' }}>☰</button>
          <div ref={fileMenuRef} style={{ position:'relative' }}>
            <MenuButton onClick={() => setFileMenuOpen(v=>{ const next=!v; if (next) { setAiMenuOpen(false); setShowTree(false); } return next; })} active={fileMenuOpen} label="파일" />
            {fileMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6, minWidth:180 }}>
                <button onClick={doNewFile} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>새 파일</button>
                <button onClick={doNewFolder} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>새 폴더</button>
                <button onClick={doRename} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>이름 변경</button>
                <button onClick={doDelete} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca', whiteSpace:'nowrap' }}>삭제</button>
                <div style={{ height:1, background:'rgba(148,163,184,0.2)', margin:'4px 2px' }} />
                <button onClick={doSaveAll} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #10b981', background:'#064e3b', color:'#d1fae5', whiteSpace:'nowrap' }}>모두 저장</button>
                <button onClick={doLoadSample} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #2563eb', background:'#0b1220', color:'#93c5fd', whiteSpace:'nowrap' }}>샘플 그래프 불러오기</button>
              </div>
            )}
          </div>
          <div ref={aiMenuRef} style={{ position:'relative' }}>
            <MenuButton onClick={() => setAiMenuOpen(v=>{ const next=!v; if (next) { setFileMenuOpen(false); setShowTree(false); } return next; })} active={aiMenuOpen} label="AI 코딩" />
            {aiMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6, minWidth:180 }}>
                <button onClick={() => { setChatDockOpen(true); setAiMenuOpen(false); }} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>AI 채팅 열기</button>
              </div>
            )}
          </div>
          <MenuButton onClick={() => setShowPlay(true)} active={showPlay} label="플레이" />
          <div ref={toolsMenuRef} style={{ position:'relative' }}>
            <MenuButton onClick={() => setToolsMenuOpen(v=>{ const next=!v; if (next) { setFileMenuOpen(false); setAiMenuOpen(false); setShowTree(false); } return next; })} active={toolsMenuOpen} label="도구" />
            {toolsMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6, minWidth:200 }}>
                <button onClick={() => { try { window.location.href = '/prompts'; } catch {} finally { setToolsMenuOpen(false); } }} data-test-id="open-prompt-editor" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>프롬프트 에디터</button>
                <button onClick={() => { try { open('/graph/prompt-graph.json'); } catch {} finally { setToolsMenuOpen(false); } }} data-test-id="open-prompt-graph" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>프롬프트 그래프 열기</button>
                <button onClick={() => { try { open('/game/runtime.config.json'); } catch {} finally { setToolsMenuOpen(false); } }} data-test-id="open-runtime-config" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>런타임 설정 열기</button>
                <button onClick={() => { try { window.location.href = '/studio?mode=ui'; } catch {} finally { setToolsMenuOpen(false); } }} data-test-id="open-ui-editor" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>UI 편집기</button>
                <div style={{ height:1, background:'rgba(148,163,184,0.2)', margin:'4px 2px' }} />
                <button onClick={() => { setChatDockOpen(true); setToolsMenuOpen(false); }} data-test-id="open-ai-agent" style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #2563eb', background:'#0b1220', color:'#93c5fd', whiteSpace:'nowrap' }}>AI 채팅</button>
                <button onClick={() => { try { window.location.href = '/game/dev-local'; } catch {} finally { setToolsMenuOpen(false); } }} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>메인게임 (dev-local)</button>
                <button onClick={() => { try { window.location.href = '/game/dev-graph'; } catch {} finally { setToolsMenuOpen(false); } }} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>메인게임 (dev-graph)</button>
              </div>
            )}
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <MenuButton onClick={onSaveServer} active={false} label={saving ? '저장중…' : '저장'} />
            <MenuButton onClick={() => setToolbarCollapsed(v=>!v)} active={toolbarCollapsed} label={toolbarCollapsed?'펼치기':'접기'} />
          </div>
        </div>

        {/* 새 파일/폴더 입력 UI */}
        {creating && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:'#e2e8f0', fontSize:12 }}>{creating==='file'?'파일 경로':'폴더 경로'}</span>
            <input value={createPath} onChange={e=>setCreatePath(e.target.value)} style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
            <button onClick={() => { try { creating==='file'? createFile(createPath,'\n') : createFolder(createPath); open(createPath.replace(/\/$/, '')); } finally { setCreating(null); } }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>생성</button>
            <button onClick={() => setCreating(null)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>취소</button>
          </div>
        )}

        {!toolbarCollapsed && (
          <>
            {/* 2열: 파일목록(탭) */}
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {openPaths.map((p) => {
                const active = p === activePath;
                return (
                  <div key={p} style={{ display:'flex', alignItems:'center' }}>
                    <button onClick={() => open(p)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background: active ? '#172033' : '#0b1220', color:'#e2e8f0', fontSize:12 }}>{p.split('/').pop()}</button>
                    <button onClick={() => close(p)} style={{ marginLeft:-6, padding:'6px 6px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>×</button>
                  </div>
                );
              })}
            </div>
            {/* 3열: 현재 파일 / 엔트리로 / 접기 */}
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', fontSize:12 }}>
              <span>현재: <strong style={{ color:'#e2e8f0' }}>{activePath}</strong></span>
              <button title="엔트리 파일 지정" onClick={() => setEntryPath(activePath)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>엔트리로</button>
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
      <div style={{ position:'relative', display: "flex", height: "calc(var(--vh, 1vh) * 100)", background: "#0b1220" }}>
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
          {/* 중앙 영역: 툴바 아래 컨텐츠가 1fr로 동작, 에디터는 100% 채움 */}
          <div style={{ position:'relative', flex: 1, minHeight: 0, overflow:'hidden' }}>
            <div style={{ position:'absolute', inset: 0 }}>
              <EditorPane />
            </div>
            {/* overlayTree 모드의 파일트리를 컨텐츠 영역 위에 오버레이 */}
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
        <div style={{ position:'fixed', inset:0, zIndex: 1600, background:'rgba(2,6,23,0.94)' }}>
          <div style={{ position:'absolute', left:0, top:0, right:0, bottom:0, paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }}>
            <button onClick={() => setShowPlay(false)} title="닫기" style={{ position:'absolute', top:'calc(env(safe-area-inset-top) + 10px)', right:'calc(env(safe-area-inset-right) + 10px)', zIndex: 10, padding:'8px 10px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>닫기</button>
            <div style={{ height:'calc(var(--vh, 1vh) * 100)', display:'flex', alignItems:'stretch', justifyContent:'center' }}>
              <div style={{ flex:1, minWidth:0 }}>
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
  const { files } = useWorkspace();
  try {
    const tplText = (typeof templateBinding?.text === 'string' && templateBinding.text.length > 0)
      ? templateBinding.text
      : (files?.['/template.json']?.content || '{}');
    const tpl = JSON.parse(tplText || '{}');
    return (
      <div style={{ height:'100%', width:'100%' }}>
        <MainGameMobileUI template={tpl} />
      </div>
    );
  } catch (e) {
    return <div style={{ padding:16, color:'#94a3b8' }}>템플릿을 불러올 수 없습니다.</div>;
  }
}
