import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import PromptEditor from '../../../components/PromptEditor';
import AICodeChatPanel from '../../../components/workspace/AICodeChatPanel.jsx';
import { CodeWorkspaceProvider, useWorkspace } from '../../../components/workspace/CodeWorkspaceProvider.jsx';
import { fetchStarterPack } from '../../../lib/workspace/fetchStarterPack.js';
import Link from 'next/link';
import { applyMainUiPresetObject, getMainUiModules } from '../../../utils/uiPresets';
function ToolsDropdown({ onOpenUiSettings }) {
  return (
    <select
      onChange={(e) => { const v = e.target.value; e.target.selectedIndex = 0; if (v === 'ui-settings') onOpenUiSettings && onOpenUiSettings(); }}
      defaultValue=""
    >
      <option value="" disabled>도구…</option>
      <option value="ui-settings">UI 설정</option>
    </select>
  );
}

function UiSettingsPanel({ onClose }) {
  const { files, writeFile } = useWorkspace();
  const [aiImageAssist, setAiImageAssist] = useState(false);
  // Server override UI state
  const [overrideHost, setOverrideHost] = useState('');
  const [activeHost, setActiveHost] = useState(null);
  const [endpoints, setEndpoints] = useState(null);
  const [health, setHealth] = useState({ status: 'idle' });
  const justOpenedRef = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => { justOpenedRef.current = false; }, 80);
    return () => clearTimeout(t);
  }, []);
  const getTpl = () => {
    try { return JSON.parse(String(files?.['/template.json']?.content || '{}')); } catch { return {}; }
  };
  const saveTpl = (obj) => {
    try { writeFile('/template.json', JSON.stringify(obj, null, 2) + '\n'); } catch {}
  };
  useEffect(() => {
    try {
      const obj = getTpl();
      const flag = !!(obj?.ai?.imageToUi?.enabled);
      setAiImageAssist(flag);
    } catch {}
  }, [files]);
  useEffect(() => {
    // Load current override and endpoints
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('MOBILE_SERVER_OVERRIDE') : null;
      if (stored) setActiveHost(stored);
    } catch {}
    (async () => {
      try {
        const r = await fetch('/mobile-endpoints.json');
        if (r.ok) {
          const json = await r.json();
          setEndpoints(json);
        }
      } catch {}
    })();
  }, []);
  const onApplyPreset = () => {
    try {
      const next = applyMainUiPresetObject(getTpl());
      saveTpl(next);
      alert('메인 UI 프리셋을 적용했습니다.');
    } catch (e) {
      alert('적용 실패: ' + String(e?.message||e));
    }
  };
  const onToggleAiAssist = (checked) => {
    try {
      setAiImageAssist(!!checked);
      const obj = getTpl();
      const next = { ...obj, ai: { ...(obj.ai||{}), imageToUi: { ...(obj.ai?.imageToUi||{}), enabled: !!checked } } };
      // Ensure main UI preset exists when enabling, so AI has structure to work with
      const ensureMain = Array.isArray(next?.ui?.main?.modules) && next.ui.main.modules.length > 0
        ? next
        : (() => {
            const base = { ...next, ui: { ...(next.ui||{}), main: { ...(next.ui?.main||{}), modules: getMainUiModules() } } };
            return base;
          })();
      saveTpl(ensureMain);
    } catch {}
  };
  function applyOverrideHost() {
    if (!overrideHost) return;
    try {
      const url = new URL(overrideHost);
      localStorage.setItem('MOBILE_SERVER_OVERRIDE', url.toString());
      setActiveHost(url.toString());
      alert('서버 오버라이드가 적용되었습니다. 네트워크 클라이언트를 재초기화하세요.');
    } catch (e) {
      alert('유효하지 않은 URL: ' + String(e?.message || e));
    }
  }
  function clearOverrideHost() {
    try {
      localStorage.removeItem('MOBILE_SERVER_OVERRIDE');
      setActiveHost(null);
      alert('서버 오버라이드를 해제했습니다.');
    } catch {}
  }
  async function probeHealth() {
    const target = activeHost || endpoints?.primaryHost || '';
    if (!target) {
      setHealth({ status: 'error', error: '호스트가 설정되지 않았습니다.' });
      return;
    }
    try {
      setHealth({ status: 'loading' });
      const url = new URL('/api/health', target).toString();
      const r = await fetch(url, { method: 'GET' });
      const text = await r.text().catch(() => '');
      setHealth({ status: r.ok ? 'ok' : 'error', code: r.status, body: text?.slice(0, 400) });
    } catch (e) {
      setHealth({ status: 'error', error: String(e?.message || e) });
    }
  }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1600, background:'rgba(2,6,23,0.65)' }}>
      <div onClick={() => { if (justOpenedRef.current) return; onClose(); }} style={{ position:'absolute', inset:0 }} />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e)=>e.stopPropagation()}
        style={{
          position:'absolute',
          left:'env(safe-area-inset-left)',
          right:'env(safe-area-inset-right)',
          bottom:'env(safe-area-inset-bottom)',
          top: 'min(8%, 64px)',
          margin:'auto',
          maxWidth: 600,
          background:'#0b1220',
          border:'1px solid rgba(148,163,184,0.35)',
          borderRadius:12,
          boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
          display:'grid',
          gridTemplateRows:'auto 1fr auto',
        }}
      >
        <div style={{ padding:'10px 12px', borderBottom:'1px solid #25314a', color:'#e2e8f0', fontWeight:700 }}>UI 설정</div>
        <div style={{ padding:12, display:'grid', gap:12, overflow:'auto' }}>
          <div style={{ display:'grid', gap:8 }}>
            <div style={{ fontSize:13, color:'#cbd5e1' }}>빠른 작업</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              <button onClick={onApplyPreset} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff', fontWeight:600 }}>메인 프리셋 적용</button>
            </div>
          </div>
          <div style={{ height:1, background:'rgba(148,163,184,0.2)' }} />
          <div style={{ display:'grid', gap:8 }}>
            <div style={{ fontSize:13, color:'#cbd5e1' }}>서버 오버라이드</div>
            <div style={{ fontSize:12, color:'#94a3b8' }}>
              모바일/런타임 네트워크 초기화 시 사용할 호스트를 임시로 지정합니다. 저장 위치: <code>localStorage.MOBILE_SERVER_OVERRIDE</code>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <input
                type="text"
                placeholder="https://your-host.example"
                value={overrideHost}
                onChange={e=>setOverrideHost(e.target.value)}
                style={{ flex:'1 1 320px', padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}
              />
              <button onClick={applyOverrideHost} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff', fontWeight:600 }}>적용</button>
              <button onClick={clearOverrideHost} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>해제</button>
            </div>
            <div style={{ fontSize:12, color:'#94a3b8' }}>
              현재 활성 호스트: {activeHost ? <code>{activeHost}</code> : endpoints?.primaryHost ? <code>{endpoints.primaryHost}</code> : <em>없음</em>}
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={probeHealth} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>/api/health 점검</button>
              <span style={{ fontSize:12, color: health.status==='ok' ? '#86efac' : health.status==='loading' ? '#fbbf24' : health.status==='idle' ? '#94a3b8' : '#fca5a5' }}>
                {health.status === 'idle' ? '대기' : health.status === 'loading' ? '확인 중…' : health.status === 'ok' ? `정상 (${health.code||200})` : `오류 ${health.code||''}`}
              </span>
            </div>
            {health.body && (
              <pre style={{ margin:0, padding:8, background:'#0a0f1a', color:'#e2e8f0', border:'1px solid #1f2a44', borderRadius:8, maxHeight:160, overflow:'auto' }}>{health.body}</pre>
            )}
            {endpoints && (
              <details>
                <summary style={{ cursor:'pointer', fontSize:12, color:'#cbd5e1' }}>빌드 시점 엔드포인트 보기</summary>
                <pre style={{ marginTop:8, padding:8, background:'#0a0f1a', color:'#e2e8f0', border:'1px solid #1f2a44', borderRadius:8, maxHeight:200, overflow:'auto' }}>{JSON.stringify(endpoints, null, 2)}</pre>
              </details>
            )}
          </div>
          <div style={{ height:1, background:'rgba(148,163,184,0.2)' }} />
          <div style={{ display:'grid', gap:8 }}>
            <div style={{ fontSize:13, color:'#cbd5e1' }}>AI 이미지 기반 UI 만들기</div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#e2e8f0' }}>
              <input type="checkbox" checked={aiImageAssist} onChange={e=>onToggleAiAssist(e.target.checked)} />
              AI 코드 채팅에서 첨부한 이미지를 참고해 UI를 구성하도록 허용
            </label>
            <div style={{ fontSize:11, color:'#94a3b8' }}>
              이미지를 URL로 직접 입력할 필요가 없습니다. 코드 에디터의 AI 채팅 패널에서 이미지를 첨부하세요.
            </div>
          </div>
        </div>
        <div style={{ padding:12, borderTop:'1px solid #25314a', display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function PromptEditInner() {
  const router = useRouter();
  const { id } = router.query;
  const [prompt, setPrompt] = useState({ id: id || 'new', name: '', body: '' });
  const [aiResult, setAiResult] = useState(null);
  const [editorBody, setEditorBody] = useState(prompt.body || '');
  const [saving, setSaving] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [showUiSettings, setShowUiSettings] = useState(false);
  const starterInjectedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    // TODO: load from API
    if (id === 'example-1') {
      setPrompt({ id, name: 'Example Prompt 1', body: 'Hello {{player.name}}' });
    } else if (id === 'new') {
      setPrompt({ id, name: '', body: '' });
    } else {
      // try to load from API
      (async () => {
        try {
          const res = await fetch(`/api/prompts/${encodeURIComponent(id)}`);
          if (res.ok) {
            const json = await res.json();
            setPrompt({ id: json.id, name: json.name || '', body: json.body || '' });
            return;
          }
        } catch (err) {
          // ignore and fallback
        }
        setPrompt({ id, name: id, body: '' });
      })();
    }
  }, [id]);

  useEffect(() => {
    setEditorBody(prompt.body || '');
  }, [prompt.body]);

  // Fetch starter-pack once on mount and dispatch to workspace provider via event.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (starterInjectedRef.current) return;
    starterInjectedRef.current = true;
    (async () => {
      try {
        const files = await fetchStarterPack();
        if (files && files.length) {
          try { window.dispatchEvent(new CustomEvent('workspace:add-files', { detail: files })); } catch (e) { /* ignore */ }
        }
      } catch (err) {
        // ignore fetch failures
      }
    })();
  }, []);

  useEffect(() => {
    if (!id) return;
    try {
      const key = `ai-assist-result:${id}`;
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        setAiResult(parsed);
      }
    } catch (err) {
      // ignore
    }
  }, [id]);

  async function handleSave(body) {
    const payload = {
      id: prompt.id === 'new' ? undefined : prompt.id,
      name: prompt.name || '',
      body,
    };
    try {
      setSaving(true);
      if (!prompt.id || prompt.id === 'new') {
        const res = await fetch('/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'create failed');
        // navigate to the newly created prompt edit page
        router.replace(`/prompts/${encodeURIComponent(json.id)}/edit`);
        return;
      } else {
        const res = await fetch(`/api/prompts/${encodeURIComponent(prompt.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'update failed');
        setPrompt(p => ({ ...p, body: json.body || body, name: json.name || p.name }));
        alert('Saved');
      }
    } catch (err) {
      alert('Save failed: ' + String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleNameChange(e) {
    const val = e.target.value;
    setPrompt(p => ({ ...p, name: val }));
  }

  function applyAiResult() {
    if (!aiResult) return;
    const newBody = (prompt.body || '') + '\n\n' + aiResult.text;
    setPrompt(p => ({ ...p, body: newBody }));
    try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(`ai-assist-result:${id}`);
        }
      setAiResult(null);
    } catch (err) {}
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Edit Prompt — {prompt.id}</h1>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Link href="/prompts">
            <a>Back to list</a>
          </Link>
          {/* Prompt Editor Tools dropdown */}
          <ToolsDropdown onOpenUiSettings={() => setShowUiSettings(true)} />
          <button onClick={()=> setShowAgent(true)} data-test-id="open-ai-agent-from-prompt" style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>AI 에이전트</button>
        </div>
      </div>

      {aiResult ? (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            border: '1px solid #e0e0e0',
            background: '#f9f9ff',
          }}
        >
          <strong>AI Assist result ready</strong>
          <div style={{ marginTop: 8 }}>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{aiResult.text}</pre>
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={applyAiResult}>Apply to editor</button>
            <Link href={`/prompts/${encodeURIComponent(prompt.id)}/ai-assist`}>
              <a style={{ marginLeft: 12 }}>Open AI Assist</a>
            </Link>
          </div>
        </div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Prompt name</label>
        <input
          value={prompt.name || ''}
          onChange={handleNameChange}
          style={{ width: '100%', padding: 8 }}
        />
      </div>

      <PromptEditor initialBody={prompt.body} onChange={b => setEditorBody(b)} />

      <div style={{ marginTop: 12 }}>
        <button onClick={() => handleSave(editorBody)} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span style={{ marginLeft: 12 }}>{prompt.version ? `Version: ${prompt.version}` : ''}</span>
      </div>

      {showAgent && (
        <div style={{ position:'fixed', right:16, bottom:16, zIndex:1200, width:420, height:360 }}>
          <div style={{ position:'absolute', inset:0 }}>
            <AICodeChatPanel onClose={()=> setShowAgent(false)} />
          </div>
        </div>
      )}
      {showUiSettings && (
        <UiSettingsPanel onClose={() => setShowUiSettings(false)} />
      )}
    </div>
  );
}

export default function PromptEditPage(){
  // Provide VFS to enable ToolsDropdown to read/write /template.json
  return (
    <CodeWorkspaceProvider>
      <PromptEditInner />
    </CodeWorkspaceProvider>
  );
}

// Avoid static generation to prevent build-time execution pitfalls; render per-request.
export async function getServerSideProps() {
  return { props: {} };
}
