import { useEffect, useMemo, useState } from 'react';
import { useStudioTemplate as useTemplate } from '../../contexts/StudioStore';
import { subscribe } from '../../contexts/StudioBus';
import { supabase } from '../../lib/supabase';
import useIsMobile from '../../utils/useIsMobile';

function safeParse(text){ try{ return JSON.parse(text||'{}'); }catch{ return null; } }
function pretty(obj){ try{ return JSON.stringify(obj, null, 2);}catch{ return ''; } }

export default function AIPanel(){
  const { templateText, setTemplateText } = useTemplate();
  const tpl = useMemo(()=> safeParse(templateText) ?? {}, [templateText]);
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile(820);
  const [mode, setMode] = useState('mock'); // mock | manual | gemini
  const [bridgeUrl, setBridgeUrl] = useState('http://127.0.0.1:4311/run-template');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [diffs, setDiffs] = useState([]);
  // Gemini mode
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [geminiPrefer, setGeminiPrefer] = useState('keyring'); // keyring | server
  const [keyringStatus, setKeyringStatus] = useState('unknown'); // unknown | ready | missing | error
  const [keyringDetail, setKeyringDetail] = useState('');
  const [geminiInstruction, setGeminiInstruction] = useState('다음 JSON 템플릿을 개선하세요. 가능한 한 구조를 유지하고, 누락된 필드를 보강하고, 유효한 JSON만 출력하세요. 출력은 오직 JSON 본문만 포함하십시오.');

  // Allow external toggle via StudioBus + persist open state
  useEffect(() => {
    try {
      const saved = localStorage.getItem('studio.aiPanel.open');
      if (saved === '1') setOpen(true);
    } catch {}
    const off = subscribe('studio:ai:toggle', () => setOpen(v => !v));
    return () => off?.();
  }, []);
  useEffect(() => {
    try { localStorage.setItem('studio.aiPanel.open', open ? '1' : '0'); } catch {}
  }, [open]);

  function computeDiff(a, b, path = '') {
    const out = [];
    if (a === b) return out;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      out.push({ type: 'change', path, from: a, to: b });
      return out;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in a)) { out.push({ type:'add', path: p, to: b[k] }); continue; }
      if (!(k in b)) { out.push({ type:'remove', path: p, from: a[k] }); continue; }
      out.push(...computeDiff(a[k], b[k], p));
    }
    return out;
  }

  const apply = (next) => setTemplateText(pretty(next));

  const runMock = async (type) => {
    setError(''); setBusy(true);
    try {
      const next = { ...tpl };
      if (type === 'summarize') {
        next.summary = `노드 ${Array.isArray(tpl.nodes)?tpl.nodes.length:0}개, 엣지 ${Array.isArray(tpl.edges)?tpl.edges.length:0}개, 리소스 그룹 ${tpl.resources?Object.keys(tpl.resources).length:0}개`;
      } else if (type === 'scaffoldNodes') {
        next.nodes = [
          { id: 'start', label: 'Start', position: { x: 60, y: 60 }, data: {} },
          { id: 'fight', label: 'Fight', position: { x: 280, y: 80 }, data: {} },
          { id: 'reward', label: 'Reward', position: { x: 500, y: 100 }, data: {} },
        ];
        next.edges = [
          { id: 'e1', source: 'start', target: 'fight', label: 'begin' },
          { id: 'e2', source: 'fight', target: 'reward', label: 'win' },
        ];
      } else if (type === 'scaffoldResources') {
        next.resources = {
          characters: [{ id:'hero', name:'Hero' }],
          skills: [{ id:'slash', name:'Slash' }],
          items: [{ id:'potion', name:'Potion' }],
          music: [], backgrounds: [], custom: []
        };
      }
      apply(next);
    } catch(e){ setError(String(e.message||e)); }
    finally { setBusy(false); }
  };

  // removed legacy bridge; use unified /api/ai/gemini

  const extractGeminiText = (result) => {
    try {
      const cand = result?.candidates?.[0];
      const parts = cand?.content?.parts || [];
      const textPart = parts.find(p => typeof p?.text === 'string')?.text || '';
      return String(textPart || '');
    } catch { return ''; }
  };

  const tryParseJsonFromText = (text) => {
    let body = text.trim();
    // strip markdown fences if any
    body = body.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try { return JSON.parse(body); } catch { return null; }
  };

  const runGemini = async () => {
    setError(''); setBusy(true); setPreview(''); setDiffs([]);
    try {
      const prompt = [
        geminiInstruction,
        '\n\n--- 현재 템플릿(JSON) ---\n',
        pretty(tpl),
        '\n\n--- 규칙 ---\n',
        '결과는 유효한 JSON만을 출력하세요. 설명/마크다운/코드펜스 없음.',
      ].join('');

      // unified: call /api/ai/gemini using user keyring by default
      // 우선 로컬 /secrets/ai.json에서 키를 찾고, 없으면 로그인 토큰 사용
      let token = null; let apiKeyHeader = null;
      try {
        // try read via global workspace provider if available
        const raw = (typeof window!=='undefined' && window.__VFS_FILES__ && window.__VFS_FILES__['/secrets/ai.json'] && window.__VFS_FILES__['/secrets/ai.json'].content) || null;
        if (raw) { const obj = JSON.parse(raw||'{}'); if (obj && typeof obj.apiKey==='string' && obj.apiKey.trim()) apiKeyHeader = obj.apiKey.trim(); }
      } catch {}
      if (!apiKeyHeader) {
        try { if (supabase && supabase.auth && typeof supabase.auth.getSession === 'function') { const r = await supabase.auth.getSession(); token = r?.data?.session?.access_token || null; } } catch {}
        if (!token) throw new Error('로컬 키(/secrets/ai.json) 또는 로그인이 필요합니다.');
      }
      const res = await fetch('/api/ai/gemini', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKeyHeader? { 'x-ai-api-key': apiKeyHeader } : (token? { Authorization:`Bearer ${token}` } : {})) },
        body: JSON.stringify({ model: geminiModel, contents: prompt, prefer: apiKeyHeader ? 'keyring' : geminiPrefer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `gemini ${res.status}`);
      const text = extractGeminiText(data?.result) || (typeof data?.result === 'string' ? data.result : '');
      if (!text) throw new Error('응답을 파싱할 수 없습니다.');
      const obj = tryParseJsonFromText(text);
      if (!obj || typeof obj !== 'object') throw new Error('JSON 응답이 아닙니다.');
      setPreview(pretty(obj));
      try { setDiffs(computeDiff(tpl, obj)); } catch { setDiffs([]); }
    } catch(e){ setError(String(e.message||e)); }
    finally { setBusy(false); }
  };

  // 사용자 키링 상태 확인(클라이언트에서 쿠키 인증으로 접근)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/rank/user-api-key', { method: 'GET', credentials: 'include' });
        if (!alive) return;
        if (!res.ok) { setKeyringStatus('missing'); setKeyringDetail('로그인이 필요하거나 키가 없습니다.'); return; }
        const data = await res.json();
        // 성공 시 active 키 메타가 온다고 가정
        setKeyringStatus('ready');
        setKeyringDetail(data?.sample || data?.modelLabel || '키링 활성화됨');
      } catch (e) {
        if (!alive) return;
        setKeyringStatus('error');
        setKeyringDetail(String(e?.message||e));
      }
    })();
    return () => { alive = false; };
  }, []);

  const applyManual = () => {
    setError('');
    const patch = safeParse(manual);
    if (!patch || typeof patch !== 'object') { setError('유효한 JSON이 아닙니다.'); return; }
    const next = { ...tpl, ...patch };
    apply(next);
  };

  return (
    <>
      {/* Collapsed handle when closed */}
      {!open && (
        <button
          onClick={()=> setOpen(true)}
          title="AI 패널 열기"
          style={{ position:'fixed', right: isMobile ? 12 : 0, bottom: isMobile ? 'calc(env(safe-area-inset-bottom) + 12px)' : 'auto', top: isMobile ? 'auto' : '40%', transform: isMobile ? 'none' : 'translateY(-50%)', width: isMobile ? 44 : 28, height: isMobile ? 44 : 120, borderRadius: isMobile ? 22 : 0, borderTopLeftRadius: isMobile ? 22 : 8, borderBottomLeftRadius: isMobile ? 22 : 8, border:'1px solid #ddd', background:'#ffffff', boxShadow:'0 8px 24px rgba(0,0,0,0.15)', zIndex:30 }}
        >
          ▶
        </button>
      )}
      {open && (
        <div style={{ position:'fixed', right: isMobile ? 0 : 16, left: isMobile ? 0 : 'auto', bottom: isMobile ? 0 : 16, width: isMobile ? '100vw' : 420, height: isMobile ? '60svh' : 520, background:'#fff', border:'1px solid #ddd', borderRadius: isMobile ? '16px 16px 0 0' : 10, boxShadow:'0 8px 28px rgba(0,0,0,0.15)', overflow:'hidden', display:'flex', flexDirection:'column', zIndex:30 }}>
          <div style={{ padding:'8px 12px', borderBottom:'1px solid #eee', display:'flex', gap:8, alignItems:'center' }}>
            <strong>AI 도우미</strong>
            <span style={{ flex:1 }} />
            <select value={mode} onChange={e=> setMode(e.target.value)}>
              <option value="mock">모의</option>
              <option value="manual">수동 JSON 머지</option>
              <option value="gemini">Gemini</option>
            </select>
            <button onClick={()=> setOpen(false)} title="접기" style={{ marginLeft:8 }}>접기 ▶</button>
          </div>
          <div style={{ padding:12, flex:1, overflow:'auto' }}>
            {mode === 'mock' && (
              <div style={{ display:'grid', gap:8 }}>
                <button disabled={busy} onClick={()=> runMock('summarize')}>요약 추가</button>
                <button disabled={busy} onClick={()=> runMock('scaffoldNodes')}>노드 스캐폴드</button>
                <button disabled={busy} onClick={()=> runMock('scaffoldResources')}>리소스 스캐폴드</button>
              </div>
            )}
            {false && mode === 'bridge' && <div />} {/* legacy removed */}
            {mode === 'gemini' && (
              <div style={{ display:'grid', gap:8 }}>
                <div style={{ fontSize:12, color: keyringStatus==='ready' ? '#10b981' : (keyringStatus==='error' ? '#ef4444' : '#f59e0b') }}>
                  키링 상태: {keyringStatus} {keyringDetail ? `- ${keyringDetail}` : ''}
                </div>
                {keyringStatus !== 'ready' && (
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <a href="/rank" style={{ fontSize:12, color:'#60a5fa', textDecoration:'underline' }}>키 관리로 이동</a>
                    <span style={{ fontSize:12, color:'#94a3b8' }}>(설정 후 다시 시도)</span>
                  </div>
                )}
                <label>모델</label>
                <select value={geminiModel} onChange={e=> setGeminiModel(e.target.value)}>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                </select>
                <label>전송 방식</label>
                <select value={geminiPrefer} onChange={e=> setGeminiPrefer(e.target.value)}>
                  <option value="keyring">사용자 키링</option>
                  <option value="server">서버 키(허용 시)</option>
                </select>
                <label>지시문</label>
                <textarea rows={6} value={geminiInstruction} onChange={e=> setGeminiInstruction(e.target.value)} style={{ width:'100%', fontFamily:'monospace' }} />
                <button disabled={busy} onClick={runGemini}>실행</button>
                {preview && (
                  <>
                    <label>결과 미리보기</label>
                    <textarea rows={10} value={preview} onChange={e=> setPreview(e.target.value)} style={{ width:'100%', fontFamily:'monospace' }} />
                    {diffs?.length > 0 && (
                      <div style={{ fontSize:12, background:'#f8fafc', border:'1px solid #e5e7eb', padding:8, borderRadius:6 }}>
                        <div style={{ fontWeight:600, marginBottom:6 }}>변경 요약 ({diffs.length})</div>
                        <ul style={{ margin:0, paddingLeft:18, maxHeight:120, overflow:'auto' }}>
                          {diffs.slice(0,50).map((d,i) => (
                            <li key={i}>{d.type} {d.path}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { try { const obj = JSON.parse(preview); apply(obj); setPreview(''); setDiffs([]); } catch { setError('미리보기 JSON이 유효하지 않습니다.'); } }}>적용</button>
                      <button onClick={() => setPreview('')}>취소</button>
                    </div>
                  </>
                )}
                <div style={{ fontSize:12, color:'#666' }}>통합 엔드포인트 /api/ai/gemini 사용. 기본은 사용자 키링, 필요 시 서버 키(환경변수 허용)로 폴백.</div>
              </div>
            )}
            {mode === 'manual' && (
              <div style={{ display:'grid', gap:8 }}>
                <label>머지할 JSON</label>
                <textarea rows={12} value={manual} onChange={e=> setManual(e.target.value)} style={{ width:'100%', fontFamily:'monospace' }} />
                <button onClick={applyManual}>머지 적용</button>
              </div>
            )}
            {!!error && <div style={{ color:'#d33' }}>{error}</div>}
          </div>
          <div style={{ padding:8, borderTop:'1px solid #eee', fontSize:12, color:'#666' }}>
            {busy ? '작업 중…' : '준비 완료'}
          </div>
        </div>
      )}
    </>
  );
}
