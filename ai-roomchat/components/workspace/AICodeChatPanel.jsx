"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';
import { supabase } from '../../lib/supabase';
import { useStartApiKeyManager } from '../rank/StartClient/hooks/useStartApiKeyManager';

export default function AICodeChatPanel({ onClose, onDragHandleDown, onToggleFullscreen, onMinimize, enableFullscreenButton, enableMinimizeButton }){
  const { files, activePath, createFile, writeFile, remove, rename } = useWorkspace();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const [attachPickerOpen, setAttachPickerOpen] = useState(false);
  const [extraAttach, setExtraAttach] = useState([]); // array of file paths
  const [settingsOpen, setSettingsOpen] = useState(false);
  const PREF_SOURCE_KEY = 'workspace:aiChat:preferSource';
  const [preferSource, setPreferSource] = useState(() => {
    try { return localStorage.getItem(PREF_SOURCE_KEY) || 'keyring'; } catch { return 'keyring'; }
  }); // 'keyring' | 'server'
  useEffect(() => { try { localStorage.setItem(PREF_SOURCE_KEY, preferSource); } catch {} }, [preferSource]);

  // API Key manager
  const {
    apiKey,
    setApiKey,
    apiVersion,
    setApiVersion,
    geminiMode,
    setGeminiMode,
    geminiModel,
    setGeminiModel,
    apiKeyWarning,
    effectiveApiKey,
    geminiModelOptions,
    geminiModelLoading,
    persistApiKeyOnServer,
  } = useStartApiKeyManager({});

  // 사용자 키링(여러 키 관리)
  const [apiKeys, setApiKeys] = useState([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const refreshApiKeyring = async () => {
    setApiKeysLoading(true);
    setApiKeyError(null);
    try {
      const res = await fetch('/api/rank/user-api-keyring');
      if (!res.ok) {
        const payload = await res.json().catch(()=>({}));
        throw new Error(payload?.detail || payload?.error || 'API 키 목록을 불러올 수 없습니다.');
      }
      const payload = await res.json().catch(()=>({}));
      const entries = Array.isArray(payload?.keys) ? payload.keys : (Array.isArray(payload?.entries) ? payload.entries : []);
      setApiKeys(entries);
    } catch (e) {
      setApiKeyError(e?.message || 'API 키 목록을 불러올 수 없습니다.');
    } finally {
      setApiKeysLoading(false);
    }
  };
  useEffect(() => { if (settingsOpen) refreshApiKeyring(); }, [settingsOpen]);

  const handleAddApiKey = async () => {
    const trimmed = (apiKeyInput||'').trim();
    if (!trimmed) { setApiKeyError('API 키를 입력해 주세요.'); return; }
    try {
      const res = await fetch('/api/rank/user-api-keyring', {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ apiKey: trimmed, activate: true })
      });
      const payload = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(payload?.detail || payload?.error || 'API 키를 저장할 수 없습니다.');
      setApiKeyInput('');
      await refreshApiKeyring();
    } catch (e) {
      setApiKeyError(e?.message || 'API 키를 저장할 수 없습니다.');
    }
  };
  const handleToggleApiKey = async (entry, action) => {
    if (!entry?.id) return;
    try {
      const res = await fetch('/api/rank/user-api-keyring', {
        method:'PATCH', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ id: entry.id, action: action==='deactivate'?'deactivate':'activate' })
      });
      const payload = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(payload?.detail || payload?.error || 'API 키 상태를 변경할 수 없습니다.');
      await refreshApiKeyring();
    } catch (e) { setApiKeyError(e?.message || 'API 키 상태를 변경할 수 없습니다.'); }
  };
  const handleDeleteApiKey = async (entryId) => {
    if (!entryId) return;
    try {
      const res = await fetch('/api/rank/user-api-keyring', {
        method:'DELETE', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ id: entryId })
      });
      const payload = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(payload?.detail || payload?.error || 'API 키를 삭제할 수 없습니다.');
      await refreshApiKeyring();
    } catch (e) { setApiKeyError(e?.message || 'API 키를 삭제할 수 없습니다.'); }
  };
  const MAX_INLINE = 4000; // prompt에 포함하는 최대 코드 길이 (문자)
  const SESS_KEY = 'workspace:aiChat:sessions.v1';
  const newSession = () => ({ id: `s_${Date.now()}`, title: '새 대화', createdAt: Date.now(), logs: [] });
  const [sessions, setSessions] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
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
        body: JSON.stringify({ model: geminiModel || 'gemini-2.5-flash', contents: prompt, prefer: (preferSource==='server' ? 'server' : 'keyring') })
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
  // simple double-tap detection for touch
  const lastTapRef = useRef(0);
  const onHeaderTouchEnd = () => {
    const now = Date.now();
    if (now - (lastTapRef.current || 0) < 320) {
      onToggleFullscreen && onToggleFullscreen();
    }
    lastTapRef.current = now;
  };

  return (
    <div style={{ height:'100%', border:'1px solid #334155', background:'#0b1220', borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }}>
      <div onMouseDown={onDragHandleDown} onTouchStart={onDragHandleDown} onDoubleClick={onToggleFullscreen} onTouchEnd={onHeaderTouchEnd} style={{ padding:'8px 10px', color:'#e2e8f0', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(180deg, rgba(2,6,23,0.8) 0%, rgba(2,6,23,0.6) 100%)', position:'relative', cursor:'move' }}>
        <span>AI 코드 채팅</span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => setHistoryOpen(v=>!v)} title="대화 기록" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background: historyOpen ? '#172033' : '#0b1220', color:'#94a3b8' }}>기록</button>
          {enableFullscreenButton && <button onClick={onToggleFullscreen} title="전체화면" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>전체화면</button>}
          <button onClick={() => setSettingsOpen(v=>!v)} title="설정" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background: settingsOpen ? '#172033' : '#0b1220', color:'#93c5fd' }}>설정</button>
          <button onClick={startNewChat} title="새 대화" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>새 대화</button>
          {enableMinimizeButton && <button onClick={onMinimize} title="축소" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>축소</button>}
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
        {settingsOpen && (
          <div style={{ position:'absolute', right:8, top:'100%', marginTop:6, zIndex:40, width:360, maxHeight:320, overflow:'auto', background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:8, display:'grid', gap:8 }}>
            <div style={{ color:'#e2e8f0', fontWeight:700, fontSize:12 }}>API 키 설정</div>
            <div style={{ display:'grid', gap:6 }}>
              <label style={{ fontSize:12, color:'#cbd5e1' }}>사용 소스</label>
              <div style={{ display:'flex', gap:8 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#e2e8f0' }}>
                  <input type="radio" name="preferSource" checked={preferSource==='keyring'} onChange={()=>setPreferSource('keyring')} /> 사용자 키링
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#e2e8f0' }}>
                  <input type="radio" name="preferSource" checked={preferSource==='server'} onChange={()=>setPreferSource('server')} /> 서버 키
                </label>
              </div>
            </div>
            <div style={{ display:'grid', gap:6 }}>
              <label style={{ fontSize:12, color:'#cbd5e1' }}>API 버전</label>
              <select value={apiVersion} onChange={e=>setApiVersion(e.target.value)} style={{ padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>
                <option value="gemini">gemini</option>
              </select>
            </div>
            <div style={{ display:'grid', gap:6 }}>
              <label style={{ fontSize:12, color:'#cbd5e1' }}>Gemini 모델</label>
              <select value={geminiModel} onChange={e=>setGeminiModel(e.target.value)} disabled={geminiModelLoading} style={{ padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>
                {(geminiModelOptions||[]).map(opt => (
                  <option key={opt.id || opt.name} value={(opt.id||opt.name)}>{opt.label || opt.name || opt.id}</option>
                ))}
              </select>
            </div>
            <div style={{ display:'grid', gap:6 }}>
              <label style={{ fontSize:12, color:'#cbd5e1' }}>내 키링</label>
              {apiKeyError && <div style={{ fontSize:12, color:'#fca5a5' }}>{apiKeyError}</div>}
              <div style={{ display:'flex', gap:6 }}>
                <input type="password" value={apiKeyInput} onChange={e=>setApiKeyInput(e.target.value)} placeholder="sk-..." style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
                <button onClick={handleAddApiKey} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>추가</button>
              </div>
              <div style={{ maxHeight:160, overflow:'auto', border:'1px solid #334155', borderRadius:6, padding:6 }}>
                {apiKeysLoading ? (
                  <div style={{ fontSize:12, color:'#94a3b8' }}>불러오는 중…</div>
                ) : (apiKeys||[]).length ? (
                  <ul style={{ margin:0, padding:'0 0 0 0' }}>
                    {(apiKeys||[]).map(entry => (
                      <li key={entry.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'6px 4px', borderBottom:'1px solid rgba(51,65,85,0.4)' }}>
                        <div style={{ fontSize:12, color:'#e2e8f0' }}>
                          {(entry.label || entry.provider || 'key')} <span style={{ color:'#94a3b8' }}>{entry.sample || (entry.last4 ? ('…'+entry.last4) : '')}</span> {entry.isActive ? <span style={{ color:'#10b981' }}>(활성)</span> : null}
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>handleToggleApiKey(entry, entry.isActive?'deactivate':'activate')} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>{entry.isActive?'해제':'활성화'}</button>
                          <button onClick={()=>handleDeleteApiKey(entry.id)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca' }}>삭제</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize:12, color:'#94a3b8' }}>등록된 키가 없습니다.</div>
                )}
              </div>
            </div>
            <div style={{ fontSize:12, color:'#94a3b8' }}>
              현재 API: <strong style={{ color:'#e2e8f0' }}>{apiVersion}</strong> / 모델 <strong style={{ color:'#e2e8f0' }}>{geminiModel}</strong> / 소스 <strong style={{ color:'#e2e8f0' }}>{preferSource}</strong>
            </div>
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
