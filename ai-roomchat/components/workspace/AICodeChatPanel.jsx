"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';
import { applyMainUiPresetObject, getMainUiModules } from '../../utils/uiPresets';
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showImageUi, setShowImageUi] = useState(false);
  const [imageUiPrompt, setImageUiPrompt] = useState('');
  const [imageUiBusy, setImageUiBusy] = useState(false);
  const [imageUiError, setImageUiError] = useState('');
  const [isFullscreenUi, setIsFullscreenUi] = useState(false);
  const rootRef = useRef(null);
  const historyRef = useRef(null);
  const settingsRef = useRef(null);
  const actionsRef = useRef(null);
  const contextRef = useRef(null);
  const menuBtn = { padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#cbd5e1', textAlign:'left' };
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
  const detectProviderFromKey = (k) => {
    const v = String(k||'').trim();
    if (v.startsWith('AIza')) return 'gemini';
    if (v.startsWith('sk-ant-')) return 'anthropic';
    if (v.startsWith('sk-')) return 'openai';
    return 'unknown';
  };
  useEffect(() => {
    const p = detectProviderFromKey(apiKeyInput);
    if (p === 'gemini') {
      try { setApiVersion && setApiVersion('gemini'); } catch {}
      try {
        if (!geminiModel) {
          const preferred = (geminiModelOptions||[]).find(o => (o.id||o.name||'').includes('2.5-flash')) || (geminiModelOptions||[])[0];
          if (preferred) setGeminiModel(preferred.id || preferred.name);
        }
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeyInput, geminiModelOptions]);
  const refreshApiKeyring = async () => {
    setApiKeysLoading(true);
    setApiKeyError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || null;
      const res = await fetch('/api/rank/user-api-keyring', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
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
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || null;
      const res = await fetch('/api/rank/user-api-keyring', {
        method:'POST', headers:{ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) }, credentials:'include', body: JSON.stringify({ apiKey: trimmed, activate: true })
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
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || null;
      const res = await fetch('/api/rank/user-api-keyring', {
        method:'PATCH', headers:{ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) }, credentials:'include', body: JSON.stringify({ id: entry.id, action: action==='deactivate'?'deactivate':'activate' })
      });
      const payload = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(payload?.detail || payload?.error || 'API 키 상태를 변경할 수 없습니다.');
      await refreshApiKeyring();
    } catch (e) { setApiKeyError(e?.message || 'API 키 상태를 변경할 수 없습니다.'); }
  };
  const handleDeleteApiKey = async (entryId) => {
    if (!entryId) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || null;
      const res = await fetch('/api/rank/user-api-keyring', {
        method:'DELETE', headers:{ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) }, credentials:'include', body: JSON.stringify({ id: entryId })
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
          // 초기 로딩 시, 내용이 전혀 없는 세션은 제외
          const cleaned = parsed.sessions.filter(s => Array.isArray(s.logs) && s.logs.length > 0);
          if (cleaned.length > 0) {
            setSessions(cleaned);
            setCurrentId(parsed.currentId && cleaned.find(x=>x.id===parsed.currentId)?.id || cleaned[0].id);
          } else {
            // 모두 비어있다면 새 세션만 생성
            const s = newSession(); setSessions([s]); setCurrentId(s.id);
          }
          return;
        }
      }
    } catch {}
    const s = newSession();
    setSessions([s]);
    setCurrentId(s.id);
  }, []);
  useEffect(() => {
    try {
      // 저장 시에도, 현재 세션을 제외하고 비어있는 세션은 저장하지 않음
      const toSave = (sessions||[]).filter(s => (Array.isArray(s.logs) && s.logs.length > 0) || s.id === currentId);
      localStorage.setItem(SESS_KEY, JSON.stringify({ sessions: toSave, currentId }));
    } catch {}
  }, [sessions, currentId]);
  const current = useMemo(() => sessions.find(s => s.id === currentId) || newSession(), [sessions, currentId]);
  const logs = current.logs || [];
  useEffect(() => { try { const el = logRef?.current; if (el) el.scrollTop = el.scrollHeight; } catch {} }, [logs]);
  const append = (role, msg) => {
    setSessions(prev => prev.map(s => s.id === currentId ? { ...s, title: s.title === '새 대화' && role==='user' ? (msg.slice(0,24) || '대화') : s.title, logs: [...(s.logs||[]), { t: Date.now(), role, msg }] } : s));
  };
  const startNewChat = () => {
    const s = newSession();
    // 새로 만들 때, 내용이 전혀 없는 기존 세션은 정리
    setSessions(prev => [s, ...prev.filter(p => Array.isArray(p.logs) && p.logs.length > 0)]);
    setCurrentId(s.id);
    setHistoryOpen(false);
  };
  const deleteSession = (id) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      // 현재 세션을 지웠다면 대체 세션 선택
      if (id === currentId) {
        const fallback = next.find(s => Array.isArray(s.logs) && s.logs.length > 0) || newSession();
        if (!next.find(s => s.id === fallback.id)) next.unshift(fallback);
        setCurrentId(fallback.id);
      }
      return next;
    });
  };
  const listFiles = () => Object.keys(files).sort().map(p => ({ path: p, size: (files[p]?.content||'').length, dir: !!files[p]?.dir }));
  // Template helpers
  const TEMPLATE_PATH = '/template.json';
  const getTemplateText = () => {
    try { return String(files?.[TEMPLATE_PATH]?.content || '{}'); } catch { return '{}'; }
  };
  const setTemplateText = (text) => {
    try {
      if (!files[TEMPLATE_PATH]) {
        createFile(TEMPLATE_PATH, String(text||'{}') + (String(text||'').endsWith('\n')?'':'\n'));
      } else {
        writeFile(TEMPLATE_PATH, String(text||'{}') + (String(text||'').endsWith('\n')?'':'\n'));
      }
    } catch {}
  };
  const applyMainUiPreset = () => {
    try {
      const obj = JSON.parse(getTemplateText() || '{}');
      const next = applyMainUiPresetObject(obj);
      setTemplateText(JSON.stringify(next, null, 2));
      append('assistant', 'UI 기본 모듈을 template.json에 적용했습니다.');
    } catch (e) {
      append('error', 'UI 적용 실패: ' + String(e?.message||e));
    }
  };
  const generateImageUi = async () => {
    setImageUiBusy(true); setImageUiError('');
    try {
      const obj = JSON.parse(getTemplateText() || '{}');
      const bg = Array.isArray(obj?.resources?.backgrounds) ? obj.resources.backgrounds : [];
      const id = `bg_${Math.random().toString(36).slice(2,8)}`;
      const next = {
        ...obj,
        ui: {
          ...(obj.ui||{}),
          main: {
            modules: getMainUiModules(),
          }
        },
        resources: { ...(obj.resources||{}), backgrounds: [...bg, { id, name: imageUiName || (imageUiPrompt || 'Generated'), image: imageUiUrl || '' }] }
      };
      setTemplateText(JSON.stringify(next, null, 2));
      setShowImageUi(false); setImageUiPrompt('');
      append('assistant', '배경 리소스를 추가하고 기본 UI 모듈을 적용했습니다.');
    } catch (e) {
      setImageUiError(String(e?.message||e));
    } finally { setImageUiBusy(false); }
  };
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
        runtime: { model: runtimeCfg?.ai?.model || null, entryNode: runtimeCfg?.entryNode || null, roles: runtimeCfg?.roles || null },
        graph: { nodes: Array.isArray(graphObj?.nodes) ? graphObj.nodes.length : 0, edges: Array.isArray(graphObj?.edges) ? graphObj.edges.length : 0 },
        tokens: {
          capability: tokenCapability ? { last4: tokenCapability.last4, length: tokenCapability.length } : null,
          device: tokenDevice ? { last4: tokenDevice.last4, length: tokenDevice.length } : null,
          signing: tokenSigning ? { last4: tokenSigning.last4, length: tokenSigning.length } : null,
        },
        note: '큰 파일은 내용이 잘려서 제공될 수 있음. 필요한 경로만 수정 계획에 포함. 토큰 값은 마스킹되어 제공됩니다.'
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
      if (onToggleFullscreen) onToggleFullscreen();
      setIsFullscreenUi(v=>!v);
    }
    lastTapRef.current = now;
  };
  const handleToggleFullscreen = () => {
    if (onToggleFullscreen) onToggleFullscreen();
    setIsFullscreenUi(v=>!v);
  };

  // Close popovers when clicking outside their area for convenience
  useEffect(() => {
    const onDoc = (e) => {
      try {
        const t = e.target;
        if (historyOpen) {
          const el = historyRef.current; if (el && !el.contains(t)) setHistoryOpen(false);
        }
        if (settingsOpen) {
          const el = settingsRef.current; if (el && !el.contains(t)) setSettingsOpen(false);
        }
        if (actionsOpen) {
          const el = actionsRef.current; if (el && !el.contains(t)) setActionsOpen(false);
        }
        if (contextOpen) {
          const el = contextRef.current; if (el && !el.contains(t)) setContextOpen(false);
        }
      } catch {}
    };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('touchstart', onDoc, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('touchstart', onDoc, true);
    };
  }, [historyOpen, settingsOpen, actionsOpen, contextOpen]);

  // Prompt-graph helper: minimal auto-generation from description
  const [showAutoGraph, setShowAutoGraph] = useState(false);
  const [autoGraphDesc, setAutoGraphDesc] = useState('');
  const [autoGraphBusy, setAutoGraphBusy] = useState(false);
  const [autoGraphError, setAutoGraphError] = useState('');
  const generatePromptGraph = async () => {
    setAutoGraphBusy(true); setAutoGraphError('');
    try {
      const desc = String(autoGraphDesc || '').trim();
      // naive parse: derive 3-4 nodes based on keywords
      const nodes = [
        { id:'start', type:'system', label:'시작' },
        { id:'prompt', type:'ai', label: desc ? desc.slice(0, 60) : '설명을 입력하세요' },
        { id:'action', type:'user_action', label:'사용자 입력' },
        { id:'end', type:'system', label:'종료' },
      ];
      const edges = [
        { id:'e1', source:'start', target:'prompt', label:'' },
        { id:'e2', source:'prompt', target:'action', label:'' },
        { id:'e3', source:'action', target:'end', label:'' },
      ];
      const graph = { nodes, edges };
      writeFile('/graph/prompt-graph.json', JSON.stringify(graph, null, 2)+'\n');
      // ensure runtime config entry points at start
      try {
        const cfgRaw = String(files['/game/runtime.config.json']?.content || '{}');
        const cfg = JSON.parse(cfgRaw || '{}');
        const nextCfg = { ...cfg, entryNode: 'start' };
        writeFile('/game/runtime.config.json', JSON.stringify(nextCfg, null, 2)+'\n');
      } catch {}
      append('assistant', '프롬프트-노드 그래프를 생성했습니다. /graph/prompt-graph.json 을 확인하세요.');
      setShowAutoGraph(false); setAutoGraphDesc('');
    } catch (e) {
      setAutoGraphError(String(e?.message||e));
    } finally { setAutoGraphBusy(false); }
  };

  // Context: variables, visibility, tokens
  const safeJson = (path) => { try { return JSON.parse(String(files?.[path]?.content || 'null')); } catch { return null; } };
  const runtimeCfg = safeJson('/game/runtime.config.json') || {};
  const graphObj = safeJson('/graph/prompt-graph.json') || {};
  const ctxPlayer = safeJson('/context/player.json') || null;
  const ctxOwner = safeJson('/context/owner.json') || null;
  const getTokenInfo = (key) => {
    try {
      const v = (typeof window !== 'undefined' && window.localStorage && localStorage.getItem(key)) || '';
      if (!v) return null;
      const last4 = v.slice(-4);
      return { key, present: true, length: v.length, last4 };
    } catch { return null; }
  };
  const tokenCapability = getTokenInfo('prompt-editor:capabilityToken');
  const tokenDevice = getTokenInfo('prompt-editor:deviceToken');
  const tokenSigning = getTokenInfo('prompt-editor:signingSecret');

  // Image UI: name/url fields
  const [imageUiName, setImageUiName] = useState('');
  const [imageUiUrl, setImageUiUrl] = useState('');

  return (
  <div ref={rootRef} style={{ height:'100%', border:'1px solid #334155', background:'#0b1220', borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }}>
      <div onMouseDown={onDragHandleDown} onTouchStart={onDragHandleDown} onDoubleClick={onToggleFullscreen} onTouchEnd={onHeaderTouchEnd} style={{ padding:'8px 10px', color:'#e2e8f0', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(180deg, rgba(2,6,23,0.8) 0%, rgba(2,6,23,0.6) 100%)', position:'relative', cursor:'move' }}>
        <span>AI 코드 채팅</span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <button onClick={()=>setHistoryOpen(v=>!v)} title="대화 기록" style={{ padding:'3px 8px', borderRadius:6, border:'1px solid #334155', background: historyOpen ? '#172033' : '#0b1220', color:'#94a3b8', fontSize:12 }}>기록</button>
          <button onClick={startNewChat} title="새 대화" style={{ padding:'3px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8', fontSize:12 }}>새 대화</button>
          <button onClick={()=>setContextOpen(v=>!v)} title="컨텍스트" style={{ padding:'3px 8px', borderRadius:6, border:'1px solid #334155', background: contextOpen ? '#172033' : '#0b1220', color:'#94a3b8', fontSize:12 }}>정보</button>
          {enableFullscreenButton && <button onClick={handleToggleFullscreen} title={isFullscreenUi?"창으로":"전체화면으로"} style={{ padding:'3px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8', fontSize:12 }}>{isFullscreenUi ? '−' : '+'}</button>}
          <button onClick={()=>setActionsOpen(v=>!v)} title="옵션" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background: actionsOpen ? '#172033' : '#0b1220', color:'#94a3b8' }}>⋮</button>
          <button onClick={onClose} title="닫기" style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>×</button>
        </div>
        {contextOpen && (
          <div ref={contextRef} style={{ position:'absolute', right:8, top:'100%', marginTop:6, zIndex:45, width:340, maxHeight:320, overflow:'auto', background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:8, display:'grid', gap:8 }}>
            <div style={{ color:'#e2e8f0', fontWeight:700, fontSize:12 }}>컨텍스트</div>
            <div style={{ fontSize:12, color:'#cbd5e1' }}>
              <div><strong style={{ color:'#e2e8f0' }}>런타임</strong>: 모델 {String(runtimeCfg?.ai?.model||'')}, entry {String(runtimeCfg?.entryNode||'없음')}, roles {Array.isArray(runtimeCfg?.roles)? runtimeCfg.roles.join(', ') : '없음'}</div>
              <div style={{ marginTop:4 }}><strong style={{ color:'#e2e8f0' }}>그래프</strong>: 노드 {Array.isArray(graphObj?.nodes)? graphObj.nodes.length : 0}개, 엣지 {Array.isArray(graphObj?.edges)? graphObj.edges.length : 0}개</div>
            </div>
            <div style={{ fontSize:12, color:'#cbd5e1' }}>
              <div><strong style={{ color:'#e2e8f0' }}>변수(샘플)</strong></div>
              <pre style={{ whiteSpace:'pre-wrap', background:'#0c1322', padding:6, borderRadius:6, border:'1px solid #334155', color:'#e2e8f0', maxHeight:120, overflow:'auto' }}>{JSON.stringify({ player: ctxPlayer, owner: ctxOwner }, null, 2)}</pre>
            </div>
            <div style={{ fontSize:12, color:'#cbd5e1' }}>
              <div><strong style={{ color:'#e2e8f0' }}>토큰</strong> (마스킹 표시)</div>
              <ul style={{ margin:0, paddingLeft:16 }}>
                {tokenCapability ? <li>Capability: …{tokenCapability.last4} ({tokenCapability.length}자)</li> : <li>Capability: 없음</li>}
                {tokenDevice ? <li>Device: …{tokenDevice.last4} ({tokenDevice.length}자)</li> : <li>Device: 없음</li>}
                {tokenSigning ? <li>Signing: …{tokenSigning.last4} ({tokenSigning.length}자)</li> : <li>Signing: 없음</li>}
              </ul>
            </div>
          </div>
        )}
        {actionsOpen && (
          <div ref={actionsRef} style={{ position:'absolute', right:8, top:'100%', marginTop:6, zIndex:50, width:220, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6 }}>
            <button onClick={()=>{ applyMainUiPreset(); setActionsOpen(false); }} style={menuBtn}>UI 제작(메인 기본) 적용</button>
            <button onClick={()=>{ setShowImageUi(true); setActionsOpen(false); }} style={menuBtn}>이미지로 UI 생성</button>
            <button onClick={()=>{ setShowAutoGraph(true); setActionsOpen(false); }} style={menuBtn}>프롬프트-노드 자동생성</button>
            <button onClick={()=>{ setSettingsOpen(v=>!v); setActionsOpen(false); }} style={menuBtn}>설정</button>
            {enableMinimizeButton && <button onClick={()=>{ onMinimize && onMinimize(); setActionsOpen(false); }} style={menuBtn}>축소</button>}
            <button onClick={()=> setActionsOpen(false)} style={{ ...menuBtn, border:'1px solid #334155', color:'#cbd5e1' }}>메뉴 닫기</button>
          </div>
        )}
        {historyOpen && (
          <div ref={historyRef} style={{ position:'absolute', right:8, top:'100%', marginTop:6, zIndex:30, width:300, maxHeight:260, overflow:'auto', background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6 }}>
            {(sessions||[]).filter(s => Array.isArray(s.logs) && s.logs.length > 0).map(s => (
              <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background: s.id===currentId?'#172033':'#0b1220', color:'#e2e8f0', marginBottom:6 }}>
                <button onClick={() => { setCurrentId(s.id); setHistoryOpen(false); }} style={{ textAlign:'left', background:'transparent', border:'none', color:'#e2e8f0', padding:0 }}>
                  <div style={{ fontSize:12, fontWeight:700 }}>{s.title || '대화'}</div>
                  <div style={{ fontSize:11, color:'#94a3b8' }}>{new Date(s.createdAt).toLocaleString()}</div>
                </button>
                <button onClick={(e)=>{ e.stopPropagation(); deleteSession(s.id); }} title="삭제" style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca' }}>삭제</button>
              </div>
            ))}
            {((sessions||[]).filter(s => Array.isArray(s.logs) && s.logs.length > 0).length === 0) && (
              <div style={{ fontSize:12, color:'#94a3b8', padding:'6px 8px' }}>저장된 대화가 없습니다.</div>
            )}
          </div>
        )}
        {settingsOpen && (
          <div ref={settingsRef} style={{ position:'absolute', right:8, top:'100%', marginTop:6, zIndex:40, width:320, maxHeight:320, overflow:'auto', background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:8, display:'grid', gap:8 }}>
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
              <label style={{ fontSize:12, color:'#cbd5e1' }}>내 키링</label>
              {apiKeyError && <div style={{ fontSize:12, color:'#fca5a5' }}>{apiKeyError}</div>}
              <div style={{ display:'flex', gap:6 }}>
                <input type="password" value={apiKeyInput} onChange={e=>setApiKeyInput(e.target.value)} placeholder="API 키 (붙여넣기만 하면 자동 설정)" style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
                <button onClick={handleAddApiKey} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>추가</button>
              </div>
              <div style={{ maxHeight:160, overflow:'auto', border:'1px solid #334155', borderRadius:6, padding:6 }}>
                {apiKeysLoading ? (
                  <div style={{ fontSize:12, color:'#94a3b8' }}>불러오는 중…</div>
                ) : (apiKeys||[]).length ? (
                  <ul style={{ margin:0, padding:'0 0 0 0' }}>
                    {(apiKeys||[]).map(entry => (
                      <li key={entry.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8, padding:'6px 4px', borderBottom:'1px solid rgba(51,65,85,0.4)' }}>
                        <div style={{ fontSize:12, color:'#e2e8f0' }}>
                          <div>
                            {(entry.label || entry.provider || 'key')}
                            {' '}
                            <span style={{ color:'#94a3b8' }}>{entry.sample || (entry.last4 ? ('…'+entry.last4) : '')}</span>
                            {' '}
                            {entry.isActive ? <span style={{ color:'#10b981' }}>(활성)</span> : null}
                          </div>
                          <div style={{ fontSize:11, color:'#94a3b8' }}>
                            {entry.provider ? `제공자: ${entry.provider}` : ''}
                            {entry.modelName ? `  ·  모델: ${entry.modelName}` : ''}
                            {entry.createdAt ? `  ·  등록: ${new Date(entry.createdAt).toLocaleString()}` : ''}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:6, justifySelf:'end' }}>
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
            <button onClick={()=>setShowAdvanced(v=>!v)} style={{ padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#cbd5e1', fontSize:12 }}>{showAdvanced?'고급 숨기기':'고급 설정 보기'}</button>
            {showAdvanced && (
              <div style={{ display:'grid', gap:6 }}>
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
              </div>
            )}
            <div style={{ fontSize:12, color:'#94a3b8' }}>
              현재 API: <strong style={{ color:'#e2e8f0' }}>{apiVersion}</strong> / 모델 <strong style={{ color:'#e2e8f0' }}>{geminiModel}</strong> / 소스 <strong style={{ color:'#e2e8f0' }}>{preferSource}</strong>
            </div>
          </div>
        )}
      </div>
      <div ref={logRef} onScroll={(e)=>{ try { const el=e.currentTarget; const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 20; setScrolledUp(!nearBottom); } catch {} }} style={{ flex:1, overflow:'auto', padding:'8px 10px' }}>
        {(scrolledUp ? logs : logs.slice(-50)).map((l,i,arr)=> {
          const prev = i>0 ? arr[i-1] : null;
          const roleChanged = prev && prev.role !== l.role;
          const mt = roleChanged ? 12 : 6;
          const color = l.role==='error'?'#fecaca': (l.role==='user'?'#e2e8f0':'#a7f3d0');
          return (
            <div key={i} style={{ fontSize:12, color, marginTop: mt, lineHeight: 1.5 }}>
              {l.role}: {l.msg}
            </div>
          );
        })}
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
      {showImageUi && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', zIndex:60 }}>
          <div style={{ position:'absolute', right:12, top:12, width:360, background:'#0b1220', border:'1px solid #334155', borderRadius:10, boxShadow:'0 12px 32px rgba(0,0,0,0.6)', padding:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', color:'#e2e8f0' }}>
              <strong>이미지로 UI 생성</strong>
              <button onClick={()=>setShowImageUi(false)} style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>닫기</button>
            </div>
            <div style={{ marginTop:8, display:'grid', gap:8 }}>
              <label style={{ fontSize:12, color:'#cbd5e1' }}>이미지 이름</label>
              <input value={imageUiName} onChange={e=> setImageUiName(e.target.value)} placeholder="예: 배경-바다" style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
              <label style={{ fontSize:12, color:'#cbd5e1' }}>이미지 URL</label>
              <input value={imageUiUrl} onChange={e=> setImageUiUrl(e.target.value)} placeholder="https://..." style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
              <label style={{ fontSize:12, color:'#cbd5e1' }}>프롬프트(선택)</label>
              <textarea rows={4} value={imageUiPrompt} onChange={e=> setImageUiPrompt(e.target.value)} style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', fontFamily:'monospace', fontSize:12 }} />
              <button disabled={imageUiBusy} onClick={generateImageUi} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>{imageUiBusy?'생성 중…':'생성(스텁)'}</button>
              {imageUiError && <div style={{ color:'#fca5a5', fontSize:12 }}>{imageUiError}</div>}
              <div style={{ fontSize:11, color:'#94a3b8' }}>현재는 스텁으로 template.json의 resources.backgrounds에 항목을 추가하고 기본 UI 모듈을 적용합니다. 실제 이미지 생성 연동은 이후 브리지/스토리지와 연결하세요.</div>
            </div>
          </div>
        </div>
      )}
      {showAutoGraph && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', zIndex:60 }}>
          <div style={{ position:'absolute', right:12, top:12, width:380, background:'#0b1220', border:'1px solid #334155', borderRadius:10, boxShadow:'0 12px 32px rgba(0,0,0,0.6)', padding:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', color:'#e2e8f0' }}>
              <strong>프롬프트-노드 자동생성</strong>
              <button onClick={()=>setShowAutoGraph(false)} style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>닫기</button>
            </div>
            <div style={{ marginTop:8, display:'grid', gap:8 }}>
              <label style={{ fontSize:12, color:'#cbd5e1' }}>설명(말로 써 보세요)</label>
              <textarea rows={6} value={autoGraphDesc} onChange={e=> setAutoGraphDesc(e.target.value)} placeholder="예: 3라운드 게임, 먼저 시스템 안내 → AI 설명 → 사용자 행동 입력 → 결과 요약" style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', fontFamily:'monospace', fontSize:12 }} />
              <button disabled={autoGraphBusy} onClick={generatePromptGraph} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #10b981', background:'#065f46', color:'#d1fae5' }}>{autoGraphBusy?'생성 중…':'그래프 생성'}</button>
              {autoGraphError && <div style={{ color:'#fca5a5', fontSize:12 }}>{autoGraphError}</div>}
              <div style={{ fontSize:11, color:'#94a3b8' }}>간단한 설명으로 /graph/prompt-graph.json 스켈레톤을 생성합니다. 이후 세부 내용은 직접 편집하세요.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
