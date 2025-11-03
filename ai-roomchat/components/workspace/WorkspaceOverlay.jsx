"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CodeWorkspaceProvider, useWorkspace } from "./CodeWorkspaceProvider.jsx";
import FileTree from "./FileTree.jsx";
import EditorMonaco from "../EditorMonaco.jsx";
import GameSimulator from "../maker/editor/GameSimulator";
import { supabase } from "../../lib/supabase";

function EditorPane() {
  const { files, activePath, writeFile, inferLang } = useWorkspace();
  const file = files[activePath];
  const lang = useMemo(() => inferLang(activePath), [activePath, inferLang]);
  if (!file) return <div style={{ padding: 16, color: "#e2e8f0" }}>파일을 선택하세요.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorMonaco
          value={file.content}
          onChange={(val) => !file.readonly && writeFile(activePath, val)}
          language={lang}
          theme="vs-dark"
          height="100%"
        />
      </div>
    </div>
  );
}

export default function WorkspaceOverlay({ gameData, templateBinding }) {
  // 오른쪽 영역에서 코드/테스트 동시 표시 + 리사이저
  const [showTest, setShowTest] = useState(false);
  const [splitPct, setSplitPct] = useState(60); // 에디터:테스트 비율
  const [dragging, setDragging] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const [showCodeChat, setShowCodeChat] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [creating, setCreating] = useState(null); // null | 'file' | 'folder'
  const [createPath, setCreatePath] = useState('');
  const treeWidth = 240;
  // 안정적 레이아웃: 상단/하단 패널 높이를 측정해 에디터를 절대 배치
  const toolbarRef = useRef(null);
  const bottomRef = useRef(null);
  const [toolbarH, setToolbarH] = useState(0);
  const [bottomH, setBottomH] = useState(0);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const w = window.innerWidth || 1200;
        if (w < 980) { setShowTree(false); setToolbarCollapsed(true); }
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const h = toolbarRef.current ? toolbarRef.current.getBoundingClientRect().height : 0;
      setToolbarH(Math.round(h));
    } catch {}
  }, [toolbarCollapsed, fileMenuOpen, aiMenuOpen, creating, showTree]);
  useEffect(() => {
    try {
      const h = bottomRef.current ? bottomRef.current.getBoundingClientRect().height : 0;
      setBottomH(Math.round(h));
    } catch {}
  }, [showCodeChat]);
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
      const left = showTree ? treeWidth : 0;
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
    const extractGeminiText = (result) => {
      try {
        const cand = result?.candidates?.[0];
        const parts = cand?.content?.parts || [];
        const textPart = parts.find(p => typeof p?.text === 'string')?.text || '';
        return String(textPart || '');
      } catch { return ''; }
    };
    const stripFences = (t) => t.replace(/^```(?:[a-z]+)?/i, '').replace(/```$/i, '').trim();
    const aiQuickEdit = async () => {
      try {
        const file = files[activePath];
        if (!file) return alert('파일을 먼저 선택하세요.');
        if (file.readonly) return alert('읽기 전용 파일입니다.');
        const instruction = prompt('AI 수정 지시문을 입력하세요 (현재 파일 내용을 기반으로 수정합니다):');
        if (!instruction) return;
        const prompt = [
          '다음 파일 내용을 지시문에 맞게 수정하세요. 결과는 오직 코드 본문만 출력하세요. 설명/마크다운/코드펜스 금지.',
          '\n\n--- 지시문 ---\n', instruction,
          '\n\n--- 파일 경로 ---\n', activePath,
          '\n\n--- 현재 내용 ---\n', file.content || ''
        ].join('');
        let token = null;
        try { const { data } = await supabase.auth.getSession(); token = data?.session?.access_token || null; } catch {}
        if (!token) return alert('로그인이 필요합니다.');
        const res = await fetch('/api/ai/gemini', {
          method: 'POST', headers: { 'content-type':'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ model: 'gemini-2.5-flash', contents: prompt, prefer: 'keyring' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `AI 호출 실패: ${res.status}`);
        let out = extractGeminiText(data?.result) || (typeof data?.result === 'string' ? data.result : '');
        if (!out) throw new Error('AI 결과가 비었습니다.');
        out = stripFences(out);
        writeFile(activePath, out);
        alert('AI 수정이 적용되었습니다.');
      } catch (e) {
        alert(e?.message || 'AI 수정 실패');
      }
    };

    const MenuButton = ({ onClick, active, label }) => (
      <button onClick={onClick} title={label} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #334155', background: active ? '#172033' : '#0b1220', color: '#e2e8f0' }}>{label}</button>
    );

    return (
      <div ref={toolbarRef} style={{ display: 'grid', gridTemplateRows: toolbarCollapsed ? 'auto' : 'auto auto auto', gap: 6, padding: '8px', borderBottom: '1px solid #25314a', background: 'rgba(2,6,23,0.5)' }}>
        {/* 1열: 햄버거 / 파일 메뉴 / AI 코딩 / 테스트 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowTree(v=>!v)} title="파일트리" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #334155', background: showTree ? '#172033' : '#0b1220', color: '#e2e8f0' }}>☰</button>
          <div style={{ position:'relative' }}>
            <MenuButton onClick={() => setFileMenuOpen(v=>!v)} active={fileMenuOpen} label="파일" />
            {fileMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6 }}>
                <button onClick={doNewFile} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>새 파일</button>
                <button onClick={doNewFolder} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>새 폴더</button>
                <button onClick={doRename} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>이름 변경</button>
                <button onClick={doDelete} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca' }}>삭제</button>
              </div>
            )}
          </div>
          <div style={{ position:'relative' }}>
            <MenuButton onClick={() => setAiMenuOpen(v=>!v)} active={aiMenuOpen} label="AI 코딩" />
            {aiMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6 }}>
                <button onClick={() => { setAiMenuOpen(false); aiQuickEdit(); }} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>AI 수정</button>
                <button onClick={() => { setShowCodeChat(v=>!v); setAiMenuOpen(false); }} style={{ textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>{showCodeChat?'AI 코드채팅 끄기':'AI 코드채팅 켜기'}</button>
              </div>
            )}
          </div>
          <MenuButton onClick={() => setShowTest(v=>!v)} active={showTest} label="테스트" />
          <div style={{ marginLeft:'auto' }}>
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
      <div style={{ display: "flex", height: "calc(var(--vh, 1vh) * 100)", background: "#0b1220" }}>
        {showTree ? <FileTree /> : null}
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
                    <GameSimulator visible={true} gameData={gameData} />
                  </div>
                </>
              )}
            </div>
          </div>
          {showCodeChat ? <div ref={bottomRef}><AICodeChatPanel /></div> : <div ref={bottomRef} />}
        </div>
      </div>
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

function AICodeChatPanel(){
  const { files, activePath, createFile, writeFile, remove, rename } = useWorkspace();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState([]);
  const append = (role,msg) => setLogs(l => [...l, { t: Date.now(), role, msg }]);
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
        '파일 목록과 일부 내용이 제공됩니다. 아래 JSON 스키마로만 응답하세요.',
        '{ "actions": [ {"type":"create|write|delete|rename", "path":"/path", "content?":"string", "from?":"/old", "to?":"/new"} ] }',
        '설명/코드펜스 없이 JSON만 반환하세요.'
      ].join('\n');
      const context = {
        activePath,
        files: listFiles().slice(0, 200),
        note: '큰 파일은 내용 생략됨. 필요한 경로만 수정 계획에 포함.'
      };
      const prompt = `${sys}\n\n### CONTEXT\n${JSON.stringify(context)}\n\n### USER\n${input}`;
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
      let plan = null; try { plan = JSON.parse(raw); } catch {}
      const n = applyActions(plan);
      append('assistant', `수정 ${n}건 적용 완료.`);
    } catch (e) {
      append('error', e?.message || String(e));
    } finally { setBusy(false); }
  };
  return (
    <div style={{ borderTop:'1px solid #25314a', background:'#0c1322' }}>
      <div style={{ padding:'8px 10px', color:'#e2e8f0', fontWeight:600 }}>AI 코드 채팅</div>
      <div style={{ maxHeight: 180, overflow:'auto', padding:'0 10px 8px' }}>
        {logs.map((l,i)=> (
          <div key={i} style={{ fontSize:12, color: l.role==='error'?'#fecaca': (l.role==='user'?'#e2e8f0':'#a7f3d0') }}>{l.role}: {l.msg}</div>
        ))}
      </div>
      <div style={{ display:'flex', gap:6, padding:10 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="명령을 입력하세요. 예: utils/date.js 생성하고 오늘 날짜 반환 함수 추가" style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
        <button onClick={send} disabled={busy} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #7c3aed', background:'#0b1220', color:'#c4b5fd' }}>{busy?'전송 중…':'전송'}</button>
      </div>
    </div>
  );
}
