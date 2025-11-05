"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CodeWorkspaceProvider, useWorkspace } from "./CodeWorkspaceProvider.jsx";
import FileTree from "./FileTree.jsx";
import EditorMonaco from "../EditorMonaco.jsx";
import GameSimulator from "../maker/editor/GameSimulator";
import { supabase } from "../../lib/supabase";
import GameRealtimeRuntime from "../game/GameRealtimeRuntime.jsx";
import dynamic from 'next/dynamic';
const MainGameMobileUI = dynamic(() => import('../game/MainGameMobileUI.jsx'), { ssr: false });

  function EditorPane() {
  const { files, activePath, writeFile, inferLang } = useWorkspace();
  const file = files[activePath];
  const lang = useMemo(() => inferLang(activePath), [activePath, inferLang]);
  if (!file) return <div style={{ padding: 16, color: "#e2e8f0" }}>파일을 선택하세요.</div>;
  return (
    <div style={{ position:'relative', height:'100%', width:'100%' }}>
      <div style={{ position:'absolute', inset:0 }}>
        <EditorMonaco
          value={file.content}
          onChange={(val) => !file.readonly && writeFile(activePath, val)}
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
  // 오른쪽 영역에서 코드/테스트 동시 표시 + 리사이저
  const [showTest, setShowTest] = useState(false);
  const [previewMode, setPreviewMode] = useState(() => {
    try { return localStorage.getItem('workspace:preview:mode') || 'realtime'; } catch { return 'realtime'; }
  }); // 'realtime' | 'main'
  const [splitPct, setSplitPct] = useState(60); // 에디터:테스트 비율
  const [dragging, setDragging] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const [showCodeChat, setShowCodeChat] = useState(false);
  const [chatSize, setChatSize] = useState(() => {
    try {
      const raw = localStorage.getItem('workspace:chat:size');
      if (raw) return JSON.parse(raw);
    } catch {}
    return { w: 420, h: 360 };
  });
  useEffect(() => {
    try { localStorage.setItem('workspace:chat:size', JSON.stringify(chatSize)); } catch {}
  }, [chatSize]);
  useEffect(() => {
    try { localStorage.setItem('workspace:preview:mode', previewMode); } catch {}
  }, [previewMode]);
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      const dx = -(e.movementX || 0);
      const dy = -(e.movementY || 0);
      setChatSize(s => ({ w: Math.min(Math.max(320, s.w - dx), 900), h: Math.min(Math.max(240, s.h - dy), 900) }));
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, [resizing]);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const fileMenuRef = useRef(null);
  const aiMenuRef = useRef(null);
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
  const PREF_SPLIT = 'workspace:split:pct';
  // 안정적 레이아웃: 상단/하단 패널 높이를 측정해 에디터를 절대 배치
  const toolbarRef = useRef(null);
  const bottomRef = useRef(null);
  const [toolbarH, setToolbarH] = useState(0);
  const [bottomH, setBottomH] = useState(0);
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
        if (saved === 'mobile') { setShowTree(false); setToolbarCollapsed(true); setShowTest(false); }
        else if (saved === 'desktop') { setShowTree(true); setToolbarCollapsed(false); }
        else {
          const w = window.innerWidth || 1200;
          if (w < 980) { setShowTree(false); setToolbarCollapsed(true); }
        }
      }
    } catch {}
  }, []);
  // split 비율 복원
  useEffect(() => {
    try {
      const s = localStorage.getItem(PREF_SPLIT);
      const pct = parseInt(s || '60', 10);
      if (!Number.isNaN(pct)) setSplitPct(Math.min(80, Math.max(20, pct)));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const h = toolbarRef.current ? toolbarRef.current.getBoundingClientRect().height : 0;
      setToolbarH(Math.round(h));
    } catch {}
  }, [toolbarCollapsed, fileMenuOpen, aiMenuOpen, creating, showTree]);
  // Chat panel is now floating overlay; editor area bottom inset remains 0
  useEffect(() => { setBottomH(0); }, [showCodeChat]);
  // split 비율 저장
  useEffect(() => {
    try { localStorage.setItem(PREF_SPLIT, String(splitPct)); } catch {}
  }, [splitPct]);

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
        if (fileMenuOpen && fm && !fm.contains(e.target)) setFileMenuOpen(false);
        if (aiMenuOpen && am && !am.contains(e.target)) setAiMenuOpen(false);
        // 파일트리가 열려있을 때, 파일트리 영역 밖을 터치하면 닫기
        if (showTree && tr && !tr.contains(e.target)) setShowTree(false);
      } catch {}
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (fileMenuOpen) setFileMenuOpen(false);
        if (aiMenuOpen) setAiMenuOpen(false);
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
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const x = e.clientX ?? (e.touches ? e.touches[0]?.clientX : 0);
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
      const left = (!overlayTree && showTree) ? treeWidth : 0;
      const pct = Math.min(80, Math.max(20, Math.round(((x - left) / (vw - left)) * 100)));
      setSplitPct(pct);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging]);
  const Toolbar = () => {
    const { root, normalizeDir, open, createFile, createFolder, rename, remove, files, activePath, writeFile, openPaths, close, entryPath, setEntryPath } = useWorkspace();
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

    return (
      <div ref={toolbarRef} style={{ display: 'grid', gridTemplateRows: toolbarCollapsed ? 'auto' : 'auto auto auto', gap: 6, padding: '8px', borderBottom: '1px solid #25314a', background: 'rgba(2,6,23,0.5)' }}>
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
                <button onClick={doLoadSample} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #2563eb', background:'#0b1220', color:'#93c5fd', whiteSpace:'nowrap' }}>샘플 그래프 불러오기</button>
              </div>
            )}
          </div>
          <div ref={aiMenuRef} style={{ position:'relative' }}>
            <MenuButton onClick={() => setAiMenuOpen(v=>{ const next=!v; if (next) { setFileMenuOpen(false); setShowTree(false); } return next; })} active={aiMenuOpen} label="AI 코딩" />
            {aiMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6, minWidth:180 }}>
                <button onClick={() => { setShowCodeChat(v=>!v); setAiMenuOpen(false); }} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap' }}>{showCodeChat?'AI 코드채팅 끄기':'AI 코드채팅 켜기'}</button>
              </div>
            )}
          </div>
          <MenuButton onClick={() => setShowTest(v=>!v)} active={showTest} label="테스트" />
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            {showTest && (
              <>
                <MenuButton onClick={() => setSplitPct(50)} active={false} label="50/50" />
                <MenuButton onClick={() => setSplitPct(70)} active={false} label="70/30" />
                <MenuButton onClick={() => setSplitPct(30)} active={false} label="30/70" />
                <MenuButton onClick={() => setPreviewMode(m => m==='realtime'?'main':'realtime')} active={false} label={previewMode==='realtime' ? '미리보기: 메인 UI' : '미리보기: 실시간'} />
              </>
            )}
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
  return (
    <CodeWorkspaceProvider>
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
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Toolbar />
          {/* 중앙 영역: 절대 배치로 상단/하단 고정 높이를 제외한 영역 전체를 에디터/테스트가 차지 */}
          <div style={{ position:'relative', flex: 1, minHeight: 0 }}>
            <div style={{ position:'absolute', inset: `${toolbarH}px 0 ${bottomH}px 0`, display:'flex', minHeight:0 }}>
              <div style={{ width: showTest ? `${splitPct}%` : '100%', minWidth: 0 }}>
                <EditorPane />
              </div>
              {showTest && (
                <>
                  <div
                    onMouseDown={() => setDragging(true)}
                    onTouchStart={() => setDragging(true)}
                    onDoubleClick={() => setSplitPct(50)}
                    title="더블클릭: 50/50"
                    style={{ width: 6, cursor: 'col-resize', background: 'rgba(148,163,184,0.3)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0, background: '#0a0f1a' }}>
                    {previewMode === 'main' ? (
                      <div style={{ height:'100%' }}>
                        {(() => {
                          try {
                            const tplText = (useWorkspace()?.files?.['/template.json']?.content) || (templateBinding?.text) || '{}';
                            const tpl = JSON.parse(tplText || '{}');
                            return <MainGameMobileUI template={tpl} />;
                          } catch {
                            return <div style={{ padding:12, color:'#94a3b8' }}>템플릿을 불러올 수 없습니다.</div>;
                          }
                        })()}
                      </div>
                    ) : (
                      <div style={{ height:'100%', padding:8 }}>
                        <div style={{ height:'100%' }}>
                          <GameRealtimeRuntime roomId={'editor-preview'} roles={{ players:['local','ai1','ai2'], observers:[] }} currentUser={{ id:'local', role:'players' }} />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          {/* Floating chat overlay (independent of editor layout) */}
          <div ref={bottomRef} />
        </div>
        {overlayTree && showTree && (
          <div
            ref={treeRef}
            style={{
              position:'absolute', left:0, top: toolbarH, bottom:0,
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
      {showCodeChat && (
        <div style={{ position:'fixed', right:16, bottom:16, zIndex: 1200, width: chatSize.w, height: chatSize.h, background:'transparent' }}>
          <div style={{ position:'absolute', inset:0 }}>
            <AICodeChatPanel onClose={() => setShowCodeChat(false)} />
            <div onMouseDown={()=>setResizing(true)} onTouchStart={()=>setResizing(true)} title="드래그로 크기 조절" style={{ position:'absolute', left:8, bottom:8, width:16, height:16, border:'1px solid #334155', background:'#0b1220', borderRadius:4, cursor:'nwse-resize', opacity:0.9 }} />
          </div>
        </div>
      )}
    </CodeWorkspaceProvider>
  );
}

function SyncTemplateToVfs({ text, setText }){
  // 양방향 동기화 에코 방지
  const { files, writeFile } = useWorkspace();
  const current = files['/template.json']?.content ?? '';
  const guard = useRef({ toVfs:false, toText:false });
  useEffect(() => {
    try {
      if (typeof text === 'string' && text !== current && !guard.current.toText) {
        guard.current.toVfs = true;
        writeFile('/template.json', text);
        // also derive graph
        try {
          const obj = JSON.parse(text || '{}');
          const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
          const edges = Array.isArray(obj.edges) ? obj.edges : [];
          const g = {
            nodes: nodes.map(n => ({ id: n.id, type: n.type || 'prompt', label: n.data?.name || n.label || '' })),
            edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label || '' })),
          };
          writeFile('/graph/prompt-graph.json', JSON.stringify(g, null, 2)+'\n');
        } catch {}
        setTimeout(()=>{ guard.current.toVfs = false; },0);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  useEffect(() => {
    try {
      if (typeof current === 'string' && typeof setText === 'function' && current !== text && !guard.current.toVfs) {
        guard.current.toText = true;
        setText(current);
        setTimeout(()=>{ guard.current.toText = false; },0);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  return null;
}

function AICodeChatPanel({ onClose }){
  const { files, activePath, createFile, writeFile, remove, rename } = useWorkspace();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  // removed checkboxes; always attach selection or current file
  const [attachPickerOpen, setAttachPickerOpen] = useState(false);
  const [extraAttach, setExtraAttach] = useState([]); // array of file paths
  const MAX_INLINE = 4000; // prompt에 포함하는 최대 코드 길이 (문자)
  const SESS_KEY = 'workspace:aiChat:sessions.v1';
  const newSession = () => ({ id: `s_${Date.now()}`, title: '새 대화', createdAt: Date.now(), logs: [] });
  const [sessions, setSessions] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
          setSessions(parsed.sessions);
          setCurrentId(parsed.currentId || parsed.sessions[0].id);
          return;
        }
      }
    } catch {}
    const s = newSession();
    setSessions([s]);
    setCurrentId(s.id);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(SESS_KEY, JSON.stringify({ sessions, currentId })); } catch {}
  }, [sessions, currentId]);
  const current = useMemo(() => sessions.find(s => s.id === currentId) || newSession(), [sessions, currentId]);
  const logs = current.logs || [];
  useEffect(() => { try { const el = logRef?.current; if (el) el.scrollTop = el.scrollHeight; } catch {} }, [logs]);
  const append = (role, msg) => {
    setSessions(prev => prev.map(s => s.id === currentId ? { ...s, title: s.title === '새 대화' && role==='user' ? (msg.slice(0,24) || '대화') : s.title, logs: [...(s.logs||[]), { t: Date.now(), role, msg }] } : s));
  };
  const startNewChat = () => {
    const s = newSession();
    setSessions(prev => [s, ...prev]);
    setCurrentId(s.id);
    setHistoryOpen(false);
  };
  const listFiles = () => Object.keys(files).sort().map(p => ({ path: p, size: (files[p]?.content||'').length, dir: !!files[p]?.dir }));
  const stripFences = (s) => String(s||'').replace(/^```(?:json)?/i,'').replace(/```$/i,'').trim();
  const applyActions = (plan) => {
    const actions = Array.isArray(plan?.actions) ? plan.actions : [];
    let count = 0;
    actions.forEach(a => {
      try {
        if ((a.type === 'write' || a.type === 'create') && typeof a.path === 'string') {
          if (a.type === 'create') createFile(a.path, a.content || ''); else writeFile(a.path, a.content || '');
          count++;
        } else if (a.type === 'delete' && typeof a.path === 'string') {
          remove(a.path); count++;
        } else if (a.type === 'rename' && typeof a.from === 'string' && typeof a.to === 'string') {
          rename(a.from, a.to); count++;
        }
      } catch {}
    });
    return count;
  };
  const send = async () => {
    if (!input.trim()) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || null;
      if (!token) throw new Error('로그인이 필요합니다.');
      const sys = [
        '당신은 파일 시스템 편집 에이전트입니다.',
        '파일 목록과 일부 내용이 제공됩니다.',
        '반드시 JSON으로만 응답하세요(코드펜스/마크다운 금지).',
        '스키마: { "message?": string, "actions?": [ {"type":"create|write|delete|rename", "path":"/path", "content?":"string", "from?":"/old", "to?":"/new"} ] }',
        'message에는 자연어 설명/논의를 담고, 편집이 필요하면 actions를 채워주세요.'
      ].join('\n');
      const fileMeta = files[activePath];
      const contentRaw = typeof fileMeta?.content === 'string' ? fileMeta.content : '';
      // 선택 영역 우선
      let selectionText = '';
      try { selectionText = (typeof window !== 'undefined' && window.__VFS_ACTIVE_SELECTION__?.path === activePath) ? (window.__VFS_ACTIVE_SELECTION__?.text || '') : ''; } catch {}
      const content = (selectionText && selectionText.length>0)
        ? selectionText
        : (contentRaw.length > MAX_INLINE
            ? (contentRaw.slice(0, Math.floor(MAX_INLINE*0.6)) + '\n…\n/* …중략… */\n' + contentRaw.slice(-Math.floor(MAX_INLINE*0.35)))
            : contentRaw);
      const context = {
        activePath,
        files: listFiles().slice(0, 200),
        activeFile: {
          path: activePath,
          size: (fileMeta?.content || '').length,
          attached: true,
          truncated: contentRaw.length > MAX_INLINE,
          },
        note: '큰 파일은 내용이 잘려서 제공될 수 있음. 필요한 경로만 수정 계획에 포함.'
      };
      const historyText = logs
        .filter(l => l.role === 'user' || l.role === 'assistant')
        .slice(-12)
        .map(l => `${l.role.toUpperCase()}: ${l.msg}`)
        .join('\n');
      // 추가 첨부 파일 본문 구성 (최대 5개)
      const mkBody = (txt) => (txt.length > MAX_INLINE ? (txt.slice(0, Math.floor(MAX_INLINE*0.6)) + '\n…\n/* …중략… */\n' + txt.slice(-Math.floor(MAX_INLINE*0.35))) : txt);
      const extra = extraAttach.slice(0,5).map(p => {
        const meta = files[p];
        const c = typeof meta?.content === 'string' ? mkBody(meta.content) : '';
        return `- ${p}\n${c}`;
      }).join('\n\n');
      const prompt = `${sys}\n\n### CONTEXT\n${JSON.stringify(context)}\n\n### ACTIVE_FILE\nPATH: ${activePath}\nCONTENT:\n${content || '(빈 파일)'}\n\n${extraAttach.length>0?`### ADDITIONAL_FILES\n${extra}`:''}\n\n### HISTORY (최근)\n${historyText}\n\n### USER\n${input}`;
      append('user', input);
      setInput('');
      const res = await fetch('/api/ai/gemini', {
        method: 'POST',
        headers: { 'content-type':'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: 'gemini-2.5-flash', contents: prompt, prefer: 'keyring' })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `AI ${res.status}`);
      const text = body?.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const raw = stripFences(text);
      let plan = null; let applied = 0; let parsed = false;
      try { plan = JSON.parse(raw); parsed = true; } catch {}
      if (parsed && plan) {
        if (typeof plan.message === 'string' && plan.message.trim().length > 0) {
          append('assistant', plan.message.trim());
        }
        if (Array.isArray(plan.actions) && plan.actions.length > 0) {
          applied = applyActions(plan);
          append('assistant', `수정 ${applied}건 적용 완료.`);
        }
        if ((!plan.message || plan.message.trim().length === 0) && (!plan.actions || plan.actions.length === 0)) {
          append('assistant', '(변경 없음)');
        }
      } else {
        const say = (raw && raw.length > 0) ? raw : (text || '(응답 없음)');
        append('assistant', say);
      }
    } catch (e) {
      append('error', e?.message || String(e));
    } finally { setBusy(false); }
  };
  return (
    <div style={{ height:'100%', border:'1px solid #25314a', background:'#0c1322', borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 18px 42px -20px rgba(0,0,0,0.5)' }}>
      <div style={{ padding:'8px 10px', color:'#e2e8f0', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(2,6,23,0.6)', position:'relative' }}>
        <span>AI 코드 채팅</span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => setHistoryOpen(v=>!v)} title="대화 기록" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background: historyOpen ? '#172033' : '#0b1220', color:'#94a3b8' }}>기록</button>
          <button onClick={startNewChat} title="새 대화" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>새 대화</button>
          <button onClick={onClose} title="닫기" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>닫기</button>
        </div>
        {historyOpen && (
          <div style={{ position:'absolute', right:8, top:'100%', marginTop:6, zIndex:30, width:280, maxHeight:260, overflow:'auto', background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6 }}>
            {sessions.map(s => (
              <button key={s.id} onClick={() => { setCurrentId(s.id); setHistoryOpen(false); }} style={{ width:'100%', textAlign:'left', padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background: s.id===currentId?'#172033':'#0b1220', color:'#e2e8f0', marginBottom:6 }}>
                <div style={{ fontSize:12, fontWeight:700 }}>{s.title || '대화'}</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>{new Date(s.createdAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={logRef} onScroll={(e)=>{ try { const el=e.currentTarget; const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 20; setScrolledUp(!nearBottom); } catch {} }} style={{ flex:1, overflow:'auto', padding:'8px 10px' }}>
        {(scrolledUp ? logs : logs.slice(-50)).map((l,i)=> (
          <div key={i} style={{ fontSize:12, color: l.role==='error'?'#fecaca': (l.role==='user'?'#e2e8f0':'#a7f3d0') }}>{l.role}: {l.msg}</div>
        ))}
      </div>
      <div style={{ display:'flex', gap:6, padding:10, borderTop:'1px solid #25314a', background:'#0c1322', alignItems:'center' }}>
        <div style={{ position:'relative' }}>
          <button onClick={()=>setAttachPickerOpen(v=>!v)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>파일 추가</button>
          {attachPickerOpen && (
            <div style={{ position:'absolute', right:0, top:'100%', marginTop:6, zIndex:40, width:320, maxHeight:260, overflow:'auto', background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6 }}>
              {Object.keys(files).sort().map(p => (
                <label key={p} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 6px', color:'#e2e8f0', fontSize:12 }}>
                  <input type="checkbox" checked={extraAttach.includes(p)} onChange={e=>{
                    setExtraAttach(prev => e.target.checked ? (prev.includes(p)?prev:[...prev,p]) : prev.filter(x=>x!==p));
                  }} />
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="명령을 입력하세요. 예: utils/date.js 생성하고 오늘 날짜 반환 함수 추가" style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
        <button onClick={send} disabled={busy} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #7c3aed', background:'#0b1220', color:'#c4b5fd' }}>{busy?'전송 중…':'전송'}</button>
      </div>
    </div>
  );
}
