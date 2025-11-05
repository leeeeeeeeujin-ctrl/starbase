"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { CodeWorkspaceProvider, useWorkspace } from './CodeWorkspaceProvider.jsx';
import FileTree from './FileTree.jsx';
import EditorMonaco from '../EditorMonaco.jsx';
import dynamic from 'next/dynamic';
import SyncTemplateToVfs from './SyncTemplateToVfs.jsx';
import AICodeChatPanel from './AICodeChatPanel.jsx';

const MainGameMobileUI = dynamic(() => import('../game/MainGameMobileUI.jsx'), { ssr: false });

function PlayOverlayContent({ templateBinding }) {
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

function EditorPane() {
  const { files, activePath, writeFile, inferLang } = useWorkspace();
  const file = files[activePath];
  const lang = useMemo(() => inferLang(activePath), [activePath, inferLang]);
  if (!file) return <div style={{ padding: 16, color: '#e2e8f0' }}>파일을 선택하세요.</div>;
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
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
  const [chatSize, setChatSize] = useState({ w: 420, h: 360 });
  const [resizing, setResizing] = useState(false);

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
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    return (
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {openPaths.map((p) => {
          const active = p === activePath;
          return (
            <div key={p} style={{ display:'flex', alignItems:'center' }}>
              <button onClick={() => open(p)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background: active ? '#172033' : '#0b1220', color:'#e2e8f0', fontSize:12, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis' }}>{p.split('/').pop()}</button>
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
    const { root, normalizeDir, open, createFile, createFolder, rename, remove, files, activePath, writeFile, entryPath, setEntryPath, openPaths, isDirty, saveAll } = useWorkspace();
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
          <ToolbarButton onClick={requestClose} title="닫기">닫기</ToolbarButton>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <ToolbarButton onClick={() => setToolbarCollapsed(v=>!v)} active={toolbarCollapsed} title={toolbarCollapsed?'펼치기':'접기'}>{toolbarCollapsed?'펼치기':'접기'}</ToolbarButton>
          </div>
        </div>
        {!toolbarCollapsed && (
          <>
            <TabsBar />
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', fontSize:12 }}>
              <span>현재: <strong style={{ color:'#e2e8f0' }}>{useWorkspace().activePath}</strong></span>
              <button title="엔트리 파일 지정" onClick={() => useWorkspace().setEntryPath(useWorkspace().activePath)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>엔트리로</button>
              <button title="모두 저장" onClick={() => saveAll()} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>모두 저장</button>
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

  return (
    <CodeWorkspaceProvider>
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
            <div style={{ height:'calc(var(--vh, 1vh) * 100)', display:'flex', alignItems:'stretch', justifyContent:'center' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <PlayOverlayContent templateBinding={templateBinding} />
              </div>
            </div>
          </div>
        </div>
      )}
      {closeConfirm && (
        <ConfirmCloseMany
          paths={closeConfirm.paths}
          onSaveAll={() => { const { saveAll } = useWorkspace(); saveAll(); setCloseConfirm(null); onRequestClose && onRequestClose(); }}
          onDiscard={() => { setCloseConfirm(null); onRequestClose && onRequestClose(); }}
          onCancel={() => setCloseConfirm(null)}
        />
      )}
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

function ConfirmCloseMany({ paths, onSaveAll, onDiscard, onCancel }){
  return (
    <ConfirmDialogShell
      title="코드 에디터를 닫기 전에 저장할까요?"
      children={
        <div style={{ color:'#cbd5e1', fontSize:13 }}>
          <div style={{ marginBottom:8 }}>변경 사항이 있는 파일:</div>
          <ul style={{ margin:0, padding:'0 0 0 18px', maxHeight:200, overflow:'auto' }}>
            {paths.map(p => (<li key={p} style={{ marginBottom:4 }}><span style={{ color:'#e2e8f0' }}>{p}</span></li>))}
          </ul>
        </div>
      }
      actions={
        <>
          <button onClick={onDiscard} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca' }}>저장 안 함</button>
          <button onClick={onCancel} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>취소</button>
          <button onClick={onSaveAll} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>모두 저장</button>
        </>
      }
    />
  );
}
