"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';
import { supabase } from '../../lib/supabase';

export default function AICodeChatPanel({ onClose }){
  const { files, activePath, createFile, writeFile, remove, rename } = useWorkspace();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const [attachPickerOpen, setAttachPickerOpen] = useState(false);
  const [extraAttach, setExtraAttach] = useState([]); // array of file paths
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
