"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import parsePlan from '../../utils/ai/parsePlan.js';
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
  const [uiImage, setUiImage] = useState(null); // { dataUrl, w, h }
  const [uiSel, setUiSel] = useState(null); // { x, y, w, h } in px
  const [pendingUiPreviews, setPendingUiPreviews] = useState([]); // previews to include with next send
  const uploadInputRef = useRef(null);
  const [attachFilter, setAttachFilter] = useState('');
  const [isFullscreenUi, setIsFullscreenUi] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null); // last AI plan awaiting confirmation
  const [pendingPlanMeta, setPendingPlanMeta] = useState(null); // summaries/diffs
  const [recentUiPreviews, setRecentUiPreviews] = useState([]); // last few previews for reuse
  // Upload status
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  // Auto apply/continue (trusted mode)
  const AUTO_LS_KEY = 'workspace:aiChat:autoApply.v1';
  const AUTO_LIMIT_KEY = 'workspace:aiChat:autoLimit.v1';
  const [autoApply, setAutoApply] = useState(false);
  const [autoLimit, setAutoLimit] = useState(2);
  const autoIterRef = useRef(0);
  const autoBudgetRef = useRef(0); // remaining self-calls allowed by AI (trusted mode)
  const [autoBudget, setAutoBudget] = useState(0);
  const chooseAutoMax = (plan) => {
    try {
      const cands = [
        plan?.autoMax,
        plan?.autoLimit,
        plan?.maxAuto,
        plan?.maxSelfCalls,
        plan?.autoCalls,
      ].map(v => parseInt(v, 10)).filter(v => !Number.isNaN(v));
      let n = cands.length ? cands[0] : null;
      if (n == null) return null;
      // Clamp to safe bounds 1..10
      if (n < 1) n = 1; if (n > 10) n = 10;
      return n;
    } catch { return null; }
  };
  useEffect(()=>{
    try {
      const a = localStorage.getItem(AUTO_LS_KEY); if (a !== null) setAutoApply(a === '1');
      const l = parseInt(localStorage.getItem(AUTO_LIMIT_KEY)||''); if (!Number.isNaN(l) && l>=1 && l<=10) setAutoLimit(l);
    } catch {}
  },[]);
  useEffect(()=>{ try { localStorage.setItem(AUTO_LS_KEY, autoApply ? '1' : '0'); } catch {} }, [autoApply]);
  useEffect(()=>{ try { localStorage.setItem(AUTO_LIMIT_KEY, String(autoLimit)); } catch {} }, [autoLimit]);
  const rootRef = useRef(null);
  const historyRef = useRef(null);
  const settingsRef = useRef(null);
  const actionsRef = useRef(null);
  const contextRef = useRef(null);
  const menuBtn = { padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#cbd5e1', textAlign:'left' };
  // Always prefer user keyring; server key is not provided. Persist as 'keyring' for consistency.
  const PREF_SOURCE_KEY = 'workspace:aiChat:preferSource';
  const [preferSource] = useState('keyring');
  useEffect(() => { try { localStorage.setItem(PREF_SOURCE_KEY, 'keyring'); } catch {} }, []);

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
  // Long-message readability helpers
  const [expandedMsgs, setExpandedMsgs] = useState(()=> new Set());
  const toggleExpand = (id) => setExpandedMsgs(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const previewText = (s) => {
    try {
      const maxChars = 480, maxLines = 12;
      if (!s) return '';
      if (s.length <= maxChars) return s;
      const lines = s.split('\n');
      if (lines.length <= maxLines) return s.length > maxChars ? (s.slice(0, maxChars) + '\n… (생략)') : s;
      return lines.slice(0, maxLines).join('\n') + '\n… (생략)';
    } catch { return s; }
  };
  // Chat background (character background) from template.json
  const chatBg = useMemo(() => {
    try {
      const obj = JSON.parse(getTemplateText()||'{}');
      const bg = obj?.ui?.chat?.background || {};
      const color = typeof bg.color === 'string' ? bg.color : null;
      const image = typeof bg.image === 'string' ? bg.image : null; // e.g., '/public/bg.webp'
      return { color, image };
    } catch { return { color:null, image:null }; }
  }, [files['/template.json']?.content]);
  const pickTextColor = (hex) => {
    try {
      if (!hex) return '#e2e8f0';
      const h = hex.replace('#','');
      const r = parseInt(h.substring(0,2),16), g=parseInt(h.substring(2,4),16), b=parseInt(h.substring(4,6),16);
      const lum = 0.2126*r + 0.7152*g + 0.0722*b;
      return lum > 140 ? '#0b1220' : '#e2e8f0';
    } catch { return '#e2e8f0'; }
  };
  const chatTextColor = useMemo(()=> pickTextColor(chatBg.color), [chatBg.color]);
  // Auto-scroll only when user is near bottom (prevents jump while reviewing older logs)
  const atBottomRef = useRef(true);
  useEffect(() => {
    try {
      const el = logRef?.current; if (!el) return;
      if (atBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    } catch {}
  }, [logs]);
  const append = (role, msg) => {
    setSessions(prev => prev.map(s => s.id === currentId ? { ...s, title: s.title === '새 대화' && role==='user' ? (msg.slice(0,24) || '대화') : s.title, logs: [...(s.logs||[]), { t: Date.now(), role, msg }] } : s));
  };
  const appendPreview = (preview) => {
    // preview: { id, comment, thumbDataUrl }
    setSessions(prev => prev.map(s => s.id === currentId ? {
      ...s,
      logs: [...(s.logs||[]), { t: Date.now(), role: 'user', msg: { type:'uiPreview', ...preview } }]
    } : s));
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
  // Upload helpers
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    } catch (e) { reject(e); }
  });
  const arrayBufferToBase64 = (buf) => {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i=0;i<bytes.byteLength;i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };
  const readAsArrayBufferB64 = (file) => new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(arrayBufferToBase64(reader.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    } catch (e) { reject(e); }
  });
  const processImageToWebp = async (file) => {
    try {
      const dataUrl = await fileToBase64(file);
      const img = new Image(); img.src = dataUrl;
      await new Promise((res) => { img.onload = () => res(); });
      // downscale if huge
      const maxSide = 1920;
      let w = img.width, h = img.height;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      w = Math.max(1, Math.floor(w * scale));
      h = Math.max(1, Math.floor(h * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/webp', 0.85);
    } catch { return null; }
  };
  const uploadFilesToVfs = async (fileList) => {
    const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB per file cap
    const dataUrlSizeBytes = (dataUrl) => {
      try {
        const comma = dataUrl.indexOf(',');
        if (comma === -1) return 0;
        const b64 = dataUrl.slice(comma + 1);
        // Base64 size approximation
        return Math.floor((b64.length * 3) / 4);
      } catch { return 0; }
    };
    const arr = Array.from(fileList || []);
    const createdPaths = [];
    setUploading(true);
    setUploadStatus(`처리 중… (0/${arr.length})`);
    for (let idx = 0; idx < arr.length; idx++) {
      const f = arr[idx];
      setUploadStatus(`처리 중… (${idx+1}/${arr.length})`);
      const name = (f.name||'file').replace(/[^a-zA-Z0-9_.-]+/g,'_');
      const ts = Date.now();
      const ext = (name.split('.').pop()||'').toLowerCase();
      const isImage = f.type.startsWith('image/');
      const isAudio = f.type.startsWith('audio/');
      const isText = f.type.startsWith('text/') || ['js','jsx','ts','tsx','json','md','txt','css'].includes(ext);
      let targetPath;
      if (isImage || isAudio) targetPath = `/assets/uploads/${ts}-${name}`;
      else if (isText) targetPath = `/utils/uploads/${ts}-${name}`;
      else targetPath = `/assets/uploads/${ts}-${name}`; // default to assets to enable compression

      // ensure unique
      let finalPath = targetPath; let i=1;
      while (files[finalPath]) { finalPath = targetPath.replace(/(\.[^.]+)$/i, `-${i}$1`); i++; }

      try {
        if (isImage) {
          // For images: allow compression even if raw exceeds cap, then enforce cap on compressed result
          const webp = await processImageToWebp(f);
          const content = webp || (await fileToBase64(f));
          if (dataUrlSizeBytes(content) > MAX_UPLOAD_BYTES) {
            append('error', `업로드 실패(용량 초과): ${name} — 압축 후에도 ${Math.round(dataUrlSizeBytes(content)/1024)}KB > 2048KB`);
          } else {
            if (!files[finalPath]) createFile(finalPath, content); else writeFile(finalPath, content);
            createdPaths.push(finalPath);
          }
        } else if (isAudio) {
          if (f.size > MAX_UPLOAD_BYTES) { append('error', `업로드 실패(용량 초과): ${name} — ${Math.round(f.size/1024)}KB > 2048KB`); continue; }
          const b64 = await readAsArrayBufferB64(f);
          const content = `data:${f.type||'audio/*'};base64,${b64}`;
          if (!files[finalPath]) createFile(finalPath, content); else writeFile(finalPath, content);
          createdPaths.push(finalPath);
        } else if (isText) {
          if (f.size > MAX_UPLOAD_BYTES) { append('error', `업로드 실패(용량 초과): ${name} — ${Math.round(f.size/1024)}KB > 2048KB`); continue; }
          const text = await f.text();
          if (!files[finalPath]) createFile(finalPath, text); else writeFile(finalPath, text);
          createdPaths.push(finalPath);
        } else {
          if (f.size > MAX_UPLOAD_BYTES) { append('error', `업로드 실패(용량 초과): ${name} — ${Math.round(f.size/1024)}KB > 2048KB`); continue; }
          const b64 = await readAsArrayBufferB64(f);
          const content = `data:application/octet-stream;base64,${b64}`;
          if (!files[finalPath]) createFile(finalPath, content); else writeFile(finalPath, content);
          createdPaths.push(finalPath);
        }
      } catch (e) {
        append('error', `업로드 실패: ${name} — ${String(e?.message||e)}`);
      }
    }
    if (createdPaths.length) {
      setExtraAttach(prev => Array.from(new Set([...(prev||[]), ...createdPaths])));
      append('assistant', `업로드 완료: ${createdPaths.length}개 파일을 추가했습니다.`);
    }
    setUploadStatus('');
    setUploading(false);
  };
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
  // Legacy fence stripper (kept for fallback when parsePlan fails to extract)
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
  const collectActionsFromSteps = (plan) => {
    try {
      const list = [];
      if (Array.isArray(plan?.actions)) list.push(...plan.actions);
      if (Array.isArray(plan?.steps)) {
        plan.steps.forEach(step => {
          if (Array.isArray(step?.actions)) list.push(...step.actions);
        });
      }
      return list;
    } catch { return []; }
  };
  const isSafeAction = (a) => {
    try {
      const allowedPrefixes = ['/template.json', '/graph/', '/game/', '/components/', '/pages/', '/styles/', '/utils/', '/lib/', '/hooks/', '/services/', '/contexts/', '/context/', '/modules/'];
      const t = a?.type; if (!t) return false;
      const p = a?.path || a?.to || a?.from; if (!p || typeof p !== 'string') return false;
      if (!allowedPrefixes.some(pref => p === pref || p.startsWith(pref))) return false;
      if ((t === 'create' || t === 'write') && typeof a?.content === 'string' && a.content.length > 200000) return false; // 200KB cap per file
      return true;
    } catch { return false; }
  };
  const applyActionsSafely = (actions) => {
    const MAX_ACTIONS = 20;
    if (!Array.isArray(actions)) return { applied:0, safe:false };
    if (actions.length > MAX_ACTIONS) return { applied:0, safe:false };
    if (!actions.every(isSafeAction)) return { applied:0, safe:false };
    let plan = { actions };
    const applied = applyActions(plan);
    return { applied, safe:true };
  };
  const summarizePlan = (plan) => {
    const actions = Array.isArray(plan?.actions) ? plan.actions : [];
    const items = actions.slice(0, 20).map((a,i) => {
      const t = a?.type || 'unknown';
      if (t === 'rename') return `#${i+1} rename ${a?.from} → ${a?.to}`;
      if (t === 'delete') return `#${i+1} delete ${a?.path}`;
      if (t === 'create') return `#${i+1} create ${a?.path} (${(a?.content||'').length} chars)`;
      if (t === 'write') return `#${i+1} write ${a?.path} (${(a?.content||'').length} chars)`;
      return `#${i+1} ${t}`;
    });
    return { count: actions.length, lines: items };
  };
  const buildPlanFilePreviews = (plan) => {
    try {
      const actions = Array.isArray(plan?.actions) ? plan.actions : [];
      const filesSet = new Map();
      actions.forEach(a => {
        const t = a?.type; const path = a?.path || a?.to || a?.from; if (!path) return;
        if (!filesSet.has(path)) filesSet.set(path, { path, previews: [] });
        const entry = filesSet.get(path);
        if (t === 'create' || t === 'write') {
          const before = String(files?.[path]?.content || '');
          const after = String(a?.content || '');
          const head = (s, n=10) => s.split('\n').slice(0, n).join('\n');
          entry.previews.push({ type: t, beforeHead: head(before), afterHead: head(after) });
        } else if (t === 'delete') {
          const before = String(files?.[path]?.content || '');
          const head = (s, n=10) => s.split('\n').slice(0, n).join('\n');
          entry.previews.push({ type: t, beforeHead: head(before), afterHead: '' });
        } else if (t === 'rename') {
          entry.previews.push({ type: t, beforeHead: '', afterHead: '' });
        }
      });
      return Array.from(filesSet.values());
    } catch { return []; }
  };
  const send = async () => {
    if (!input.trim()) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || null;
      if (!token) throw new Error('로그인이 필요합니다.');
      // System contract: strict schema, separation of chat vs work, and project-specific guidance
      const sys = [
        '당신은 파일 시스템 편집 + 읽기 에이전트입니다.',
        '파일 목록과 일부 내용이 제공되며, 필요하면 read 액션을 통해 추가 파일 내용을 요청할 수 있습니다.',
        '반드시 JSON으로만 응답하세요(코드펜스/마크다운 금지).',
        '스키마 v3: {',
        '  "mode": "chat" | "work",',
        '  "message?": string,',
        '  "questions?": string[],',
        '  "actions?": [ {"type":"create|write|delete|rename|read", "path":"/path", "content?":"string", "from?":"/old", "to?":"/new"} ],',
        '  "steps?": [ { "mode": "chat|work", "message?": string, "actions?": [ ...same as above ] } ],',
        '  "autoContinue?": boolean,',
        '  "autoMax?": number  // 신뢰 모드에서 스스로 이어갈 최대 호출 횟수(1..10). 제공하지 않으면 기본 2회.',
        '  "followup?": string',
        '}',
        '- chat 모드: 정보가 부족하거나 우선 질의가 필요하면 questions 배열로 물어보고, actions는 비웁니다.',
        '- read 액션: 최대 8개 파일까지 요청 가능. 너무 크거나(>120KB) 바이너리 추정 파일은 잘립니다. read 이후 후속 편집이 확정되면 work 모드로 actions(create/write 등)을 제안하세요.',
        '- work 모드: 편집이 확정되면 actions를 채우고 message는 간결 요약만 포함하세요. 수다/해설을 actions 안에 넣지 마세요.',
  '- 여러 작업을 이어서 수행해야 한다면 steps 배열로 묶어서 한 번에 제시하세요. 꼭 필요한 경우에만 질문을 하되, 가능하면 스스로 다음 작업을 이어가세요.',
  '- 신뢰 모드에서 후속 호출이 필요하다면 autoContinue=true 와 autoMax(1..10)를 함께 제시하세요. 미제공 시 기본 2회가 사용됩니다.',
        '',
        'RESPONSE STYLE (message 전용):',
        '- 한국어로 짧고 읽기 쉽게 답하세요.',
        '- 헤더 3~4개(예: 요약, 핵심 변경, 다음 단계, 주의/리스크)와 각 3~5줄 이내의 불릿을 사용하세요.',
        '- 한 줄은 120자 이내로 유지하세요. 표/코드펜스/마크다운 꾸밈은 사용하지 마세요.',
        '- work 모드에서는 message를 1~2줄로 간결히 요약하고 상세 해설은 생략하세요.',
        '- 길어질 경우 가장 중요한 3~5개의 포인트만 남기고 나머지는 생략(… 생략) 표시를 사용하세요.',
        '- 항상 프로젝트 안전수칙을 준수: 외부 URL 이미지는 제안하지 말 것, 이미지 포맷은 .webp 만 사용, 서버/비밀키/토큰을 추출하거나 하드코딩하지 말 것.',
        '- 경로는 워크스페이스 내부만: /template.json, /graph/**, /game/**, /components/**, /pages/**, /styles/** 등. 루트 밖이나 시스템 경로 금지.',
        '- UI PREVIEWS 섹션이 있을 수 있습니다. 각 항목은 이미지 크기(image), 선택 영역(region: 정규화 좌표), 팔레트, ASCII 요약, 코멘트를 포함합니다.',
        '- 사용자가 UI 생성/편집을 요청했다면, template.json의 UI 설정 또는 graph/prompt-graph.json에 필요한 변경을 actions/steps로 제안하세요.',
        '- 형식/변수 가이드: 캐릭터 슬롯, 이름/설명/역할 등 게임 변수는 GAME CONTEXT SUMMARY를 참고하여 누락 시 questions로 요청하세요.'
      ].join('\n');
      const fileMeta = files[activePath];

      // If an image is loaded but no region preview is attached, auto-attach a full-image preview for this send.
      let previewsForThisSend = [...(pendingUiPreviews||[])];
      if ((!previewsForThisSend || previewsForThisSend.length === 0) && uiImage) {
        try {
          const payload = await (async () => {
            const img = new Image(); img.src = uiImage.dataUrl;
            return await new Promise((resolve) => {
              img.onload = () => {
                const regionNorm = { x:0, y:0, w:1, h:1 };
                const sx = 0, sy = 0, sw = img.width, sh = img.height;
                const maxThumb = 128;
                const scale = Math.min(maxThumb / sw, maxThumb / sh, 1);
                const dw = Math.max(1, Math.floor(sw * scale));
                const dh = Math.max(1, Math.floor(sh * scale));
                const c = document.createElement('canvas'); c.width = dw; c.height = dh;
                const cx = c.getContext('2d');
                cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
                cx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
                const { data } = cx.getImageData(0,0,dw,dh);
                let r=0,g=0,b=0,count=0; for (let i=0;i<data.length;i+=4){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; count++; }
                r=Math.round(r/count); g=Math.round(g/count); b=Math.round(b/count);
                const toHex = (n)=> ('0'+n.toString(16)).slice(-2);
                const avg = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
                const ascii = (()=>{
                  try {
                    const cols=28, rows=16;
                    const c2=document.createElement('canvas'); c2.width=cols; c2.height=rows;
                    const ctx2=c2.getContext('2d'); ctx2.drawImage(c,0,0,cols,rows);
                    const { data: d2 } = ctx2.getImageData(0,0,cols,rows);
                    const chars=' .:-=+*#%@'; let out='';
                    for (let y=0;y<rows;y++){
                      for (let x=0;x<cols;x++){
                        const i=(y*cols + x)*4; const rr=d2[i], gg=d2[i+1], bb=d2[i+2];
                        const lum=(0.2126*rr + 0.7152*gg + 0.0722*bb)/255;
                        const idx=Math.min(chars.length-1, Math.max(0, Math.round(lum*(chars.length-1))));
                        out += chars[idx];
                      }
                      out+='\n';
                    }
                    return out;
                  } catch { return ''; }
                })();
                const thumbDataUrl = c.toDataURL('image/webp', 0.6);
                resolve({ thumbDataUrl, palette:[avg], ascii, regionPx:{ x:sx, y:sy, w:sw, h:sh }, regionNorm });
              };
            });
          })();
          const id = 'prev_'+Date.now();
          const p = { id, comment: '(전체 이미지)', thumbDataUrl: payload.thumbDataUrl, imageW: uiImage.w, imageH: uiImage.h, region: payload.regionNorm, palette: payload.palette, ascii: payload.ascii };
          previewsForThisSend.push(p);
          appendPreview(p);
        } catch {}
      }
      const contentRaw = typeof fileMeta?.content === 'string' ? fileMeta.content : '';
      let selectionText = '';
      try { selectionText = (typeof window !== 'undefined' && window.__VFS_ACTIVE_SELECTION__?.path === activePath) ? (window.__VFS_ACTIVE_SELECTION__?.text || '') : ''; } catch {}
      const content = (selectionText && selectionText.length>0)
        ? selectionText
        : (contentRaw.length > MAX_INLINE
            ? (contentRaw.slice(0, Math.floor(MAX_INLINE*0.6)) + '\n…\n/* …중략… */\n' + contentRaw.slice(-Math.floor(MAX_INLINE*0.35)))
            : contentRaw);
      // Derived context: include richer graph and game summaries for better read comprehension
      const templateObj = (()=>{ try { return JSON.parse(getTemplateText()||'{}'); } catch { return {}; } })();
      const readCharacters = () => {
        try {
          const arr = Array.isArray(templateObj?.characters) ? templateObj.characters : [];
          return arr.slice(0, 12).map(c => ({
            id: c.id || c.key || c.name || null,
            name: c.name || null,
            slot: c.slot || c.role || null,
            desc: c.description || c.desc || null,
            tags: Array.isArray(c.tags)? c.tags.slice(0,8) : undefined
          }));
        } catch { return []; }
      };
      const readGraphSummary = () => {
        try {
          const nodes = Array.isArray(graphObj?.nodes) ? graphObj.nodes : [];
          return nodes.slice(0, 24).map(n => ({ id:n.id, label:n.label, type:n.type, slot:n.slot, hidden:!!n.hidden }));
        } catch { return []; }
      };
      const gameContextSummary = {
        runtime: { model: runtimeCfg?.ai?.model || null, entryNode: runtimeCfg?.entryNode || null, roles: runtimeCfg?.roles || null },
        graph: { nodes: Array.isArray(graphObj?.nodes) ? graphObj.nodes.length : 0, edges: Array.isArray(graphObj?.edges) ? graphObj.edges.length : 0, sample: readGraphSummary() },
        variables: { player: ctxPlayer ? Object.keys(ctxPlayer) : [], owner: ctxOwner ? Object.keys(ctxOwner) : [] },
        characters: readCharacters()
      };
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
  const uiBlock = (previewsForThisSend||[]).length ? `\n\n### UI PREVIEWS\n${JSON.stringify(previewsForThisSend.map(p=>({ id:p.id, comment:p.comment, image:{ w:p.imageW, h:p.imageH }, region:{ x:p.region.x, y:p.region.y, w:p.region.w, h:p.region.h, normalized:true }, palette:p.palette||[], ascii:p.ascii||'' })), null, 2)}` : '';
  const gameBlock = `\n\n### GAME CONTEXT SUMMARY\n${JSON.stringify(gameContextSummary, null, 2)}\n\n### PROMPT WRITING HINTS\n- 캐릭터/슬롯/변수가 부족하면 questions로 먼저 물어보세요.\n- UI 변경은 가능한 한 template.json의 ui.* 섹션 또는 prompt-graph.json의 nodes/edges로 반영하세요.\n- 코드 편집은 최소 범위만 제안하고, 생성 파일은 루트 하위 폴더에 위치시키세요.\n- 이미지/미디어는 .webp만 사용하고 URL 경로 제안은 금지됩니다.\n\n### AVAILABLE QUICK CHECKS\n- graph: 노드 id 중복/엣지의 source/target 유효성 검사\n- template: JSON 파싱/주요 키 존재 유무(예: ui, characters) 점검\n- files: 생성/수정 파일 수와 크기 한도 확인\n\n### SELF-TEST GUIDE\n- work 제안 전, 위 QUICK CHECKS를 통과할 수 있도록 설계를 점검하세요.\n- 필요시 steps의 마지막에 followup으로 자체 점검 결과를 요청해 다음 턴에서 검증할 수 있게 하세요.`;
  const prompt = `${sys}\n\n### CONTEXT\n${JSON.stringify(context)}\n${gameBlock}\n\n### ACTIVE_FILE\nPATH: ${activePath}\nCONTENT:\n${content || '(빈 파일)'}\n\n${extraAttach.length>0?`### ADDITIONAL_FILES\n${extra}`:''}${uiBlock}\n\n### HISTORY (최근)\n${historyText}\n\n### USER\n${input}`;
      append('user', input);
      setInput('');
      const res = await fetch('/api/ai/gemini', {
        method: 'POST',
        headers: { 'content-type':'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: geminiModel || 'gemini-2.5-flash', contents: prompt, prefer: 'keyring' })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `AI ${res.status}`);
      const text = body?.result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const primaryRaw = stripFences(text);
      // Robust extraction: attempts to pull first valid JSON object/array from mixed output
      const { plan: planExtracted, parsed: parsedOk, rawJson } = parsePlan(primaryRaw);
      let plan = planExtracted; let applied = 0; let parsed = parsedOk;
      if (!parsed) {
        // Fallback: attempt raw direct parse
        try { plan = JSON.parse(primaryRaw); parsed = true; } catch {}
      }
      // Helper for inline body truncation (shared by read responses)
      const mkBodyLocal = (txt) => (txt.length > MAX_INLINE ? (txt.slice(0, Math.floor(MAX_INLINE*0.6)) + '\n…\n/* …중략… */\n' + txt.slice(-Math.floor(MAX_INLINE*0.35))) : txt);
      if (parsed && plan) {
        // Show questions proactively to keep chat vs work separated
        if (Array.isArray(plan.questions) && plan.questions.length > 0) {
          append('assistant', `질문:\n- ${plan.questions.map(q=>String(q)).join('\n- ')}`);
        }
        // Respect explicit mode if provided
        const mode = (plan.mode === 'work' || plan.mode === 'chat') ? plan.mode : (Array.isArray(plan.actions) && plan.actions.length>0 ? 'work' : 'chat');
        if (typeof plan.message === 'string' && plan.message.trim().length > 0) {
          append('assistant', plan.message.trim());
        }
        // Aggregate actions from top-level and steps
        const allActions = collectActionsFromSteps(plan);
        // Separate read actions (non-destructive introspection)
        const readActions = allActions.filter(a => a?.type === 'read');
        const nonReadActions = allActions.filter(a => a?.type !== 'read');
        if (readActions.length > 0) {
          // Guard: limit number & path safety
          const MAX_READ = 8;
          const safeReads = readActions.slice(0, MAX_READ).filter(a => {
            if (!a?.path || typeof a.path !== 'string') return false;
            // Reuse prefixes from isSafeAction (light copy to avoid circular usage before definition)
            const allowedPrefixes = ['/template.json', '/graph/', '/game/', '/components/', '/pages/', '/styles/', '/utils/', '/lib/', '/hooks/', '/services/', '/contexts/', '/context/', '/modules/'];
            return allowedPrefixes.some(pref => a.path === pref || a.path.startsWith(pref));
          });
          const readReport = safeReads.map(r => {
            const meta = files[r.path];
            if (!meta) return { path: r.path, exists:false, content:'(파일 없음)' };
            const raw = String(meta.content || '');
            const truncated = raw.length > 120000; // 120KB cap for raw
            return { path: r.path, exists:true, size: raw.length, truncated, body: mkBodyLocal(raw) };
          });
          // Append as assistant message (structured summary)
          try {
            append('assistant', '파일 읽기 결과:\n' + readReport.map(r => `- ${r.path} (${r.exists? r.size+' chars' : '없음'}${r.truncated? ', truncated':''})`).join('\n'));
          } catch {}
          // Provide bodies in a follow-up compact block (could be large; keep under limit by slicing)
          readReport.forEach(r => {
            try {
              if (r.exists) {
                append('assistant', `내용(${r.path}):\n${r.body}`);
              }
            } catch {}
          });
          // If trusted mode and AI asked to auto-continue, schedule next call using AI-chosen budget
          if (autoApply && plan.autoContinue) {
            const chosen = chooseAutoMax(plan);
            if (chosen != null && autoBudgetRef.current <= 0) { autoBudgetRef.current = chosen; setAutoBudget(autoBudgetRef.current); }
            if (autoBudgetRef.current <= 0) { autoBudgetRef.current = 2; setAutoBudget(autoBudgetRef.current); } // default when unspecified
            if (autoBudgetRef.current > 0) {
              autoBudgetRef.current -= 1; setAutoBudget(autoBudgetRef.current);
              const follow = typeof plan.followup === 'string' && plan.followup.trim().length>0 ? plan.followup.trim() : input;
              setTimeout(()=>{ try { setInput(follow); send(); } catch {} }, 0);
            }
          }
        }
        if (mode === 'work' && Array.isArray(nonReadActions) && nonReadActions.length > 0) {
          if (autoApply) {
            // Trusted mode: apply within guardrails, else fall back to preview
            const { applied:ap, safe } = applyActionsSafely(nonReadActions);
            if (safe) {
              append('assistant', `자동 적용 완료: ${ap}건`);
              // Auto-continue if requested and within AI-chosen budget
              if (plan.autoContinue) {
                const chosen = chooseAutoMax(plan);
                if (chosen != null && autoBudgetRef.current <= 0) { autoBudgetRef.current = chosen; setAutoBudget(autoBudgetRef.current); }
                if (autoBudgetRef.current <= 0) { autoBudgetRef.current = 2; setAutoBudget(autoBudgetRef.current); } // default when unspecified
                if (autoBudgetRef.current > 0) {
                  autoBudgetRef.current -= 1; setAutoBudget(autoBudgetRef.current);
                  const follow = typeof plan.followup === 'string' && plan.followup.trim().length>0 ? plan.followup.trim() : input;
                  setTimeout(()=>{ try { setInput(follow); send(); } catch {} }, 0);
                } else {
                  autoIterRef.current = 0; setAutoBudget(0);
                }
              } else {
                autoIterRef.current = 0; autoBudgetRef.current = 0; setAutoBudget(0);
              }
            } else {
              const hold = { actions: nonReadActions };
              const summary = summarizePlan(hold);
              const filePreviews = buildPlanFilePreviews(hold);
              setPendingPlan(hold);
              setPendingPlanMeta({ summary, filePreviews });
              append('assistant', `안전 제한으로 인해 자동 적용 대신 미리보기를 표시합니다. 변경 제안 ${summary.count}건.`);
              autoIterRef.current = 0; autoBudgetRef.current = 0; setAutoBudget(0);
            }
          } else {
            // Hold changes for preview instead of immediate apply
            const hold = { actions: nonReadActions };
            const summary = summarizePlan(hold);
            const filePreviews = buildPlanFilePreviews(hold);
            setPendingPlan(hold);
            setPendingPlanMeta({ summary, filePreviews });
            append('assistant', `변경 제안 ${summary.count}건이 도착했습니다. 아래 카드에서 적용하거나 추가 지시를 선택하세요.`);
          }
        } else if (!plan.message || plan.message.trim().length === 0) {
          append('assistant', '(변경 없음)');
          autoIterRef.current = 0; autoBudgetRef.current = 0; setAutoBudget(0);
        }
      } else {
        const say = (primaryRaw && primaryRaw.length > 0) ? primaryRaw : (text || '(응답 없음)');
        append('assistant', say);
        autoIterRef.current = 0; autoBudgetRef.current = 0; setAutoBudget(0);
      }
    } catch (e) {
      append('error', e?.message || String(e));
    } finally { setBusy(false); setPendingUiPreviews([]); }
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

  // (removed) URL 기반 이미지 추가는 지원하지 않습니다. AI 첨부 기반으로만 동작합니다.

  return (
  <div ref={rootRef} style={{ height:'100%', border:'1px solid #334155', background:'#0b1220', borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }}>
      <div onMouseDown={onDragHandleDown} onTouchStart={onDragHandleDown} onDoubleClick={onToggleFullscreen} onTouchEnd={onHeaderTouchEnd} style={{ padding:'8px 10px', color:'#e2e8f0', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(180deg, rgba(2,6,23,0.8) 0%, rgba(2,6,23,0.6) 100%)', position:'relative', cursor:'move' }}>
        <span>AI 코드 채팅{autoApply ? (autoBudget>0 ? ` · 자동 ${autoBudget}` : ' · 자동 진행') : ''}</span>
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
            <button onClick={()=>{ setShowImageUi(true); setActionsOpen(false); }} style={menuBtn}>UI 설정</button>
            <button onClick={()=>{ setShowAutoGraph(true); setActionsOpen(false); }} style={menuBtn}>프롬프트-노드 자동생성</button>
            <button onClick={()=>{ try {
              // run quick checks and append result
              const report = (()=>{
                try {
                  const out = [];
                  // graph checks
                  const g = JSON.parse(String(files['/graph/prompt-graph.json']?.content||'{}'));
                  const nodes = Array.isArray(g?.nodes) ? g.nodes : [];
                  const edges = Array.isArray(g?.edges) ? g.edges : [];
                  const ids = new Set(); let dup=false; nodes.forEach(n=>{ if(ids.has(n.id)) dup=true; ids.add(n.id); });
                  const edgeOk = edges.every(e => ids.has(e.source) && ids.has(e.target));
                  out.push(`graph: nodes=${nodes.length}, edges=${edges.length}, dupId=${dup?'yes':'no'}, edgesValid=${edgeOk?'yes':'no'}`);
                  // template checks
                  const t = JSON.parse(getTemplateText()||'{}');
                  const hasUi = !!t?.ui; const hasChars = Array.isArray(t?.characters);
                  out.push(`template: ui=${hasUi?'yes':'no'}, characters=${hasChars? t.characters.length : 0}`);
                  // files checks
                  const lf = listFiles(); const big = lf.filter(f=>!f.dir && f.size>200000).length;
                  out.push(`files: count=${lf.length}, big(>200KB)=${big}`);
                  return out.join('\n');
                } catch (e) { return 'checks failed: '+ String(e?.message||e); }
              })();
              append('assistant', '자체 테스트 결과:\n'+report);
            } catch {} setActionsOpen(false); }} style={menuBtn}>빠른 점검 실행</button>
            <div style={{ display:'grid', gap:6, padding:'6px 8px', border:'1px solid #334155', borderRadius:6 }}>
              <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', color:'#e2e8f0', fontSize:12 }}>
                <span>자동 진행(신뢰 모드)</span>
                <input type="checkbox" checked={autoApply} onChange={e=>setAutoApply(e.target.checked)} />
              </label>
              <label style={{ display:'grid', gap:4, fontSize:12, color:'#cbd5e1' }}>
                반복 횟수(최대 10)
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={autoLimit === 0 ? '' : String(autoLimit)}
                  onChange={e=>{
                    const raw = e.target.value;
                    if (raw === '' || raw === '0') { setAutoLimit(0); return; }
                    const v = parseInt(raw,10);
                    if (!Number.isNaN(v)) setAutoLimit(v);
                  }}
                  onBlur={()=>{
                    setAutoLimit(v => {
                      if (!v || v < 1) return 1;
                      if (v > 10) return 10;
                      return v;
                    });
                  }}
                  onKeyDown={(e)=>{
                    if (e.key === 'Enter') {
                      setAutoLimit(v => {
                        if (!v || v < 1) return 1;
                        if (v > 10) return 10;
                        return v;
                      });
                      e.currentTarget.blur();
                    }
                  }}
                  style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
              </label>
              <div style={{ fontSize:11, color:'#94a3b8' }}>안전 제한 초과 시 자동 적용 대신 미리보기로 전환됩니다.</div>
            </div>
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
              <div style={{ fontSize:12, color:'#e2e8f0' }}>사용자 키링 (기본)</div>
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
      {/* Pending AI plan diff/preview card */}
      {pendingPlan && pendingPlanMeta && (
        <div style={{ borderTop:'1px solid #25314a', background:'#0c1322', padding:'8px 10px', display:'grid', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ color:'#e2e8f0', fontWeight:700, fontSize:12 }}>변경 미리보기 ({pendingPlanMeta.summary.count}건)</div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={()=>{ const c = applyActions(pendingPlan); setPendingPlan(null); setPendingPlanMeta(null); append('assistant', `수정 ${c}건 적용 완료.`); }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #10b981', background:'#065f46', color:'#d1fae5' }}>적용</button>
              <button onClick={()=>{ setPendingPlan(null); setPendingPlanMeta(null); }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>취소</button>
              <button onClick={()=>{ setShowImageUi(true); /* user can add region comment to refine */ setTimeout(()=>{ try { append('assistant', '변경 제안에 대해 특정 영역 지시를 첨부해 주세요.'); } catch {} }, 0); }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>영역 지시</button>
            </div>
          </div>
          <div style={{ display:'grid', gap:8 }}>
            <div style={{ fontSize:12, color:'#cbd5e1', whiteSpace:'pre-wrap', textShadow: chatBg.image ? '0 1px 2px rgba(0,0,0,0.4)' : undefined }}>{pendingPlanMeta.summary.lines.join('\n')}</div>
            {pendingPlanMeta.filePreviews.map(fp => (
              <div key={fp.path} style={{ border:'1px solid #334155', borderRadius:8, overflow:'hidden' }}>
                <div style={{ padding:'6px 8px', background:'#0b1220', color:'#e2e8f0', fontSize:12, fontWeight:700 }}>{fp.path}</div>
                {fp.previews.map((pv, idx) => (
                  <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, padding:8, background:'#0c1322' }}>
                    <div>
                      <div style={{ fontSize:11, color:'#94a3b8', marginBottom:4 }}>이전</div>
                      <pre style={{ margin:0, padding:8, background:'#0b1220', color:'#e2e8f0', border:'1px solid #334155', borderRadius:6, maxHeight:160, overflow:'auto' }}>{pv.beforeHead || '(없음)'}</pre>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:'#94a3b8', marginBottom:4 }}>변경 후</div>
                      <pre style={{ margin:0, padding:8, background:'#0b1220', color:'#e2e8f0', border:'1px solid #334155', borderRadius:6, maxHeight:160, overflow:'auto' }}>{pv.afterHead || '(없음)'}</pre>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
  <div ref={logRef} onScroll={(e)=>{ try { const el=e.currentTarget; const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 32; atBottomRef.current = nearBottom; setScrolledUp(!nearBottom); } catch {} }}
           style={{ flex:1, overflow:'auto', padding:'8px 10px', position:'relative',
                    color: chatTextColor,
                    background: chatBg.image ? `url(${chatBg.image}) center/cover no-repeat` : (chatBg.color || undefined) }}>
        {(scrolledUp ? logs : logs.slice(-50)).map((l,i,arr)=> {
          const prev = i>0 ? arr[i-1] : null;
          const roleChanged = prev && prev.role !== l.role;
          const mt = roleChanged ? 12 : 6;
          const color = l.role==='error'?'#fecaca': (l.role==='user'?'#e2e8f0':'#a7f3d0');
          if (l && typeof l.msg === 'object' && l.msg?.type === 'uiPreview') {
            return (
              <div key={i} style={{ marginTop: mt, display:'flex', alignItems:'flex-start', gap:8 }}>
                <div style={{ width:84, height:84, border:'1px solid #334155', borderRadius:8, overflow:'hidden', background:'#0c1322' }}>
                  {l.msg.thumbDataUrl ? <img src={l.msg.thumbDataUrl} alt="UI 미리보기" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
                </div>
                <div style={{ fontSize:12, color }}>
                  <div style={{ color:'#94a3b8' }}>UI 미리보기</div>
                  <div>{l.msg.comment || '(설명 없음)'}</div>
                </div>
              </div>
            );
          }
          const id = l?.t || i;
          const raw = String(l.msg);
          const long = raw.length > 480 || (raw.split('\n').length > 12);
          const expanded = expandedMsgs.has(id);
          const shown = (long && !expanded) ? previewText(raw) : raw;
          // Minimal formatting: headers (#, ##) and bullets (-, *, •) for assistant readability
          const renderFormatted = (text) => {
            try {
              const lines = String(text||'').split('\n');
              const out = [];
              let bullets = [];
              const flushBullets = () => {
                if (bullets.length === 0) return;
                out.push(
                  <ul key={'ul_'+out.length} style={{ margin:'6px 0 6px 18px', padding:0 }}>
                    {bullets.map((t,idx)=>(<li key={idx} style={{ margin:'2px 0' }}>{t}</li>))}
                  </ul>
                );
                bullets = [];
              };
              lines.forEach((ln, idx) => {
                const ltrim = ln.trim();
                if (ltrim.startsWith('## ')) {
                  flushBullets();
                  out.push(<div key={'h2_'+idx} style={{ fontWeight:800, fontSize:13, marginTop:6 }}>{ltrim.slice(3)}</div>);
                } else if (ltrim.startsWith('# ')) {
                  flushBullets();
                  out.push(<div key={'h1_'+idx} style={{ fontWeight:900, fontSize:14, marginTop:8 }}>{ltrim.slice(2)}</div>);
                } else if (ltrim.startsWith('- ') || ltrim.startsWith('* ') || ltrim.startsWith('• ')) {
                  bullets.push(ltrim.replace(/^[-*•]\s+/, ''));
                } else if (ltrim === '') {
                  flushBullets();
                  out.push(<div key={'br_'+idx} style={{ height:6 }} />);
                } else {
                  flushBullets();
                  out.push(<div key={'p_'+idx} style={{ whiteSpace:'pre-wrap' }}>{ln}</div>);
                }
              });
              flushBullets();
              return out;
            } catch { return (<div style={{ whiteSpace:'pre-wrap' }}>{text}</div>); }
          };
          return (
            <div key={i} style={{ fontSize:12, color, marginTop: mt, lineHeight: 1.5, textShadow: chatBg.image ? '0 1px 2px rgba(0,0,0,0.6)' : undefined }}>
              <div>{l.role}: {l.role==='assistant' ? renderFormatted(shown) : (<span style={{ whiteSpace:'pre-wrap' }}>{shown}</span>)}</div>
              {long && (
                <button onClick={()=>toggleExpand(id)} style={{ marginTop:4, padding:'2px 6px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8', fontSize:11 }}>
                  {expanded ? '접기' : '더보기'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {/* Pending UI previews inline */}
      {pendingUiPreviews.length > 0 && (
        <div style={{ padding:'6px 10px', display:'flex', gap:8, flexWrap:'wrap', borderTop:'1px solid #25314a', background:'#0c1322' }}>
          {pendingUiPreviews.map(p => (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:6, border:'1px solid #334155', borderRadius:8, padding:6, background:'#0b1220' }}>
              <img src={p.thumbDataUrl} alt="prev" style={{ width:48, height:48, borderRadius:6, objectFit:'cover' }} />
              <div style={{ maxWidth:240 }}>
                <div style={{ fontSize:11, color:'#94a3b8' }}>영역: ({p.region.x.toFixed(2)}, {p.region.y.toFixed(2)}) {p.region.w.toFixed(2)}×{p.region.h.toFixed(2)}</div>
                <div style={{ fontSize:12, color:'#e2e8f0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.comment}</div>
              </div>
              <button onClick={()=> setPendingUiPreviews(prev => prev.filter(x => x.id !== p.id))} style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca' }}>제거</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display:'flex', gap:6, padding:10, borderTop:'1px solid #25314a', background:'#0c1322', alignItems:'center' }}>
        <div style={{ position:'relative' }}>
          <button onClick={()=>setAttachPickerOpen(v=>!v)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>파일 추가</button>
          {attachPickerOpen && (
            <div style={{ position:'absolute', left:0, bottom:'100%', marginBottom:6, zIndex:50, width:240, maxHeight:240, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, boxShadow:'0 12px 24px rgba(0,0,0,0.6)', display:'grid', gap:6 }}>
              <input ref={uploadInputRef} type="file" multiple accept="image/*,audio/*,.js,.jsx,.ts,.tsx,.json,.md,.txt,.css" onChange={async (e)=>{ try { await uploadFilesToVfs(e.target.files); if (uploadInputRef.current) uploadInputRef.current.value=''; } catch {} }} style={{ display:'none' }} />
              <button onClick={()=>{ try { uploadInputRef.current?.click(); } catch {} }} style={menuBtn}>파일 업로드…</button>
              <input value={attachFilter} onChange={e=>setAttachFilter(e.target.value)} placeholder="검색" style={{ padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', fontSize:12 }} />
              {uploading && (
                <div style={{ fontSize:11, color:'#94a3b8' }}>{uploadStatus || '업로드 처리 중…'}</div>
              )}
              <div style={{ height:1, background:'rgba(148,163,184,0.2)' }} />
              <div style={{ maxHeight:120, overflow:'auto', display:'grid', gap:2 }}>
                {Object.keys(files).sort().filter(p => !attachFilter || p.toLowerCase().includes(attachFilter.toLowerCase())).map(p => (
                  <label key={p} style={{ display:'flex', alignItems:'center', gap:6, padding:'2px 4px', color:'#e2e8f0', fontSize:12 }}>
                    <input type="checkbox" checked={extraAttach.includes(p)} onChange={e=>{
                      setExtraAttach(prev => e.target.checked ? (prev.includes(p)?prev:[...prev,p]) : prev.filter(x=>x!==p));
                    }} />
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p}</span>
                  </label>
                ))}
              </div>
              <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                <button onClick={()=> setAttachPickerOpen(false)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', fontSize:12 }}>닫기</button>
              </div>
            </div>
          )}
        </div>
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="명령을 입력하세요. 예: utils/date.js 생성하고 오늘 날짜 반환 함수 추가" style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
        <button onClick={send} disabled={busy} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #7c3aed', background:'#0b1220', color:'#c4b5fd' }}>{busy?'전송 중…':'전송'}</button>
      </div>
      {showImageUi && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', zIndex:60 }}>
          <div style={{ position:'absolute', right:12, top:12, width:380, background:'#0b1220', border:'1px solid #334155', borderRadius:10, boxShadow:'0 12px 32px rgba(0,0,0,0.6)', padding:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', color:'#e2e8f0' }}>
              <strong>UI 설정</strong>
              <button onClick={()=>setShowImageUi(false)} style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>닫기</button>
            </div>
            <div style={{ marginTop:8, display:'grid', gap:10 }}>
              <div style={{ display:'grid', gap:6 }}>
                <div style={{ fontSize:12, color:'#cbd5e1' }}>빠른 작업</div>
                <button onClick={()=>{ applyMainUiPreset(); }} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>메인 프리셋 적용</button>
              </div>
              <div style={{ display:'grid', gap:8 }}>
                <div style={{ fontSize:12, color:'#cbd5e1' }}>이미지 미리보기 & 코멘트</div>
                {!uiImage && (
                  <label style={{ display:'grid', gap:6, fontSize:12, color:'#cbd5e1' }}>
                    <input type="file" accept="image/*" onChange={async (e)=>{
                      try {
                        const f = e.target.files?.[0]; if (!f) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const img = new Image();
                          img.onload = () => {
                            setUiImage({ dataUrl: reader.result, w: img.width, h: img.height });
                            setUiSel({ x:0.1, y:0.1, w:0.8, h:0.8 });
                          };
                          img.src = reader.result;
                        };
                        reader.readAsDataURL(f);
                      } catch {}
                    }} />
                    <span style={{ fontSize:11, color:'#94a3b8' }}>업로드 없이 브라우저에서만 미리봅니다. 저장 시 서버에서 압축/변환됩니다.</span>
                  </label>
                )}
                {uiImage && (
                  <UiImageAnnotator uiImage={uiImage} uiSel={uiSel} setUiSel={setUiSel} onReset={()=>{ setUiImage(null); setUiSel(null); }} onAttach={(payload)=>{
                    // payload: { comment, regionPx, regionNorm, thumbDataUrl, palette, ascii }
                    const id = 'prev_'+Date.now();
                    const p = { id, comment: payload.comment, thumbDataUrl: payload.thumbDataUrl, imageW: uiImage.w, imageH: uiImage.h, region: payload.regionNorm, palette: payload.palette, ascii: payload.ascii };
                    setPendingUiPreviews(prev => [...prev, p]);
                    appendPreview(p);
                    setShowImageUi(false);
                    setUiImage(null); setUiSel(null);
                  }} />
                )}
              </div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>
                이미지 URL 입력은 제거되었습니다. 이미지 코멘트를 첨부하면 다음 전송 때 AI에게 요약(좌표/팔레트/ASCII)과 함께 전달됩니다.
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Recent previews (reuse) */}
      {recentUiPreviews.length > 0 && (
        <div style={{ padding:'6px 10px', background:'#0c1322', borderTop:'1px solid #25314a', display:'flex', gap:8, flexWrap:'wrap' }}>
          {recentUiPreviews.map(p => (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:6, border:'1px solid #334155', borderRadius:8, padding:6, background:'#0b1220' }}>
              <img src={p.thumbDataUrl} alt="prev" style={{ width:36, height:36, borderRadius:6, objectFit:'cover' }} />
              <div style={{ maxWidth:200 }}>
                <div style={{ fontSize:11, color:'#94a3b8' }}>{p.label || '영역'}</div>
                <div style={{ fontSize:12, color:'#e2e8f0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.comment}</div>
              </div>
              <button onClick={()=> setPendingUiPreviews(prev => [...prev, p])} style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #2563eb', background:'#0b1220', color:'#93c5fd' }}>다시 첨부</button>
            </div>
          ))}
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

// Inline component: image annotator with rectangle selection and comment
function UiImageAnnotator({ uiImage, uiSel, setUiSel, onReset, onAttach }){
  const canvasRef = useRef(null);
  const commentRef = useRef(null);
  const [label, setLabel] = useState('영역');
  const [dragging, setDragging] = useState(false);
  const [startPos, setStartPos] = useState(null);

  useEffect(() => {
    try {
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const img = new Image(); img.src = uiImage.dataUrl;
      img.onload = () => {
        // Fit image into canvas while keeping aspect ratio
        const maxW = 340, maxH = 220;
        let dw = img.width, dh = img.height;
        const scale = Math.min(maxW / dw, maxH / dh, 1);
        dw = Math.floor(dw * scale); dh = Math.floor(dh * scale);
        canvas.width = dw; canvas.height = dh;
        ctx.clearRect(0,0,dw,dh);
        ctx.drawImage(img, 0, 0, dw, dh);
        if (uiSel) {
          const rx = uiSel.x * dw, ry = uiSel.y * dh, rw = uiSel.w * dw, rh = uiSel.h * dh;
          ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2; ctx.strokeRect(rx, ry, rw, rh);
          ctx.fillStyle = 'rgba(147,197,253,0.15)'; ctx.fillRect(rx, ry, rw, rh);
        }
      };
    } catch {}
  }, [uiImage, uiSel]);

  const onDown = (e) => {
    try {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setDragging(true); setStartPos({ x, y }); setUiSel({ x, y, w: 0, h: 0 });
    } catch {}
  };
  const onMove = (e) => {
    if (!dragging || !startPos) return;
    try {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const nx = Math.max(0, Math.min(startPos.x, x));
      const ny = Math.max(0, Math.min(startPos.y, y));
      const nw = Math.min(1, Math.max(startPos.x, x)) - nx;
      const nh = Math.min(1, Math.max(startPos.y, y)) - ny;
      setUiSel({ x: nx, y: ny, w: nw, h: nh });
    } catch {}
  };
  const onUp = () => { setDragging(false); setStartPos(null); };

  const computePreviewPayload = () => {
    try {
      // Create a thumbnail of selected region and color palette
      const maxThumb = 128;
      // draw full image into offscreen to compute region
      const img = new Image(); img.src = uiImage.dataUrl;
      const regionNorm = uiSel || { x:0, y:0, w:1, h:1 };
      return new Promise((resolve) => {
        img.onload = () => {
          const sx = Math.floor(regionNorm.x * img.width);
          const sy = Math.floor(regionNorm.y * img.height);
          const sw = Math.max(1, Math.floor(regionNorm.w * img.width));
          const sh = Math.max(1, Math.floor(regionNorm.h * img.height));
          const scale = Math.min(maxThumb / sw, maxThumb / sh, 1);
          const dw = Math.max(1, Math.floor(sw * scale));
          const dh = Math.max(1, Math.floor(sh * scale));
          const c = document.createElement('canvas'); c.width = dw; c.height = dh;
          const cx = c.getContext('2d');
          cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
          cx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
          // palette (average color)
          const { data } = cx.getImageData(0,0,dw,dh);
          let r=0,g=0,b=0,count=0; for (let i=0;i<data.length;i+=4){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; count++; }
          r=Math.round(r/count); g=Math.round(g/count); b=Math.round(b/count);
          const toHex = (n)=> ('0'+n.toString(16)).slice(-2);
          const avg = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
          // ascii
          const ascii = canvasToAscii(c, 28, 16);
          const thumbDataUrl = c.toDataURL('image/webp', 0.6);
          resolve({ thumbDataUrl, palette:[avg], ascii, regionPx:{ x:sx, y:sy, w:sw, h:sh }, regionNorm });
        };
      });
    } catch {
      return Promise.resolve(null);
    }
  };

  const onClickAttach = async () => {
    const payload = await computePreviewPayload();
    const comment = String(commentRef.current?.value || '').trim();
    if (!payload) return;
    onAttach({ ...payload, comment, label });
  };

  return (
    <div style={{ border:'1px solid #334155', borderRadius:8, padding:8, display:'grid', gap:8 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {/* Comment presets */}
          {['헤더 고정','12열 그리드','CTA 오른쪽 정렬','폰트 굵게','카드 간격 축소'].map(txt => (
            <button key={txt} onClick={()=>{ try { commentRef.current.value = (commentRef.current.value? (commentRef.current.value+' ') : '') + txt; } catch {} }} style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', fontSize:11 }}>{txt}</button>
          ))}
        </div>
        <select value={label} onChange={e=>setLabel(e.target.value)} style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', fontSize:12 }}>
          {['영역','헤더','내비','사이드바','푸터','카드','버튼','폼'].map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:11, color:'#94a3b8' }}>이미지 위를 드래그하여 영역을 지정하세요.</div>
        <button onClick={onReset} style={{ padding:'4px 6px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>다시 선택</button>
      </div>
      <div style={{ border:'1px solid #334155', borderRadius:8, overflow:'hidden', maxWidth: 340 }}>
        <canvas ref={canvasRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} style={{ display:'block', width:'100%', height:'auto', cursor:'crosshair' }} />
      </div>
      <input ref={commentRef} placeholder="이 영역에 대한 설명/요청을 입력" style={{ padding:'6px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
      <button onClick={onClickAttach} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #10b981', background:'#065f46', color:'#d1fae5' }}>미리보기 첨부</button>
    </div>
  );
}

function canvasToAscii(canvas, cols=32, rows=16){
  try {
    const w = Math.max(2, cols), h = Math.max(2, rows);
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const ctx = c2.getContext('2d');
    ctx.drawImage(canvas, 0, 0, w, h);
    const { data } = ctx.getImageData(0,0,w,h);
    const chars = ' .:-=+*#%@';
    let out = '';
    for (let y=0; y<h; y++){
      for (let x=0; x<w; x++){
        const i = (y*w + x)*4;
        const r=data[i], g=data[i+1], b=data[i+2];
        const lum = (0.2126*r + 0.7152*g + 0.0722*b)/255;
        const idx = Math.min(chars.length-1, Math.max(0, Math.round(lum*(chars.length-1))));
        out += chars[idx];
      }
      out += '\n';
    }
    return out;
  } catch { return ''; }
}
