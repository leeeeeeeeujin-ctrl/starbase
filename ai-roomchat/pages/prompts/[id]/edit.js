import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import PromptEditor from '../../../components/PromptEditor';
import AICodeChatPanel from '../../../components/workspace/AICodeChatPanel.jsx';
import { CodeWorkspaceProvider, useWorkspace } from '../../../components/workspace/CodeWorkspaceProvider.jsx';
import Link from 'next/link';
import { applyMainUiPresetObject, getMainUiModules } from '../../../utils/uiPresets';
import { applyMainUiPresetObject } from '../../../utils/uiPresets';
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
}
function UiSettingsPanel({ onClose }) {
  const { files, writeFile } = useWorkspace();
  const [imageName, setImageName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const getTpl = () => {
    try { return JSON.parse(String(files?.['/template.json']?.content || '{}')); } catch { return {}; }
  };
  const saveTpl = (obj) => {
    try { writeFile('/template.json', JSON.stringify(obj, null, 2) + '\n'); } catch {}
  };
  const onApplyPreset = () => {
    try {
      const next = applyMainUiPresetObject(getTpl());
      saveTpl(next);
      alert('메인 UI 프리셋을 적용했습니다.');
    } catch (e) {
      alert('적용 실패: ' + String(e?.message||e));
    }
  };
  const onAddBackground = async () => {
    if (!imageUrl.trim()) { alert('이미지 URL을 입력하세요.'); return; }
    setBusy(true);
    try {
      const obj = getTpl();
      const bg = Array.isArray(obj?.resources?.backgrounds) ? obj.resources.backgrounds : [];
      const id = `bg_${Math.random().toString(36).slice(2,8)}`;
      const next = {
        ...obj,
        ui: {
          ...(obj.ui||{}),
          main: {
            modules: Array.isArray(obj?.ui?.main?.modules) && obj.ui.main.modules.length > 0
              ? obj.ui.main.modules
              : getMainUiModules(),
          }
        },
        resources: { ...(obj.resources||{}), backgrounds: [...bg, { id, name: imageName || '배경', image: imageUrl }] }
      };
      saveTpl(next);
      setImageName(''); setImageUrl('');
      alert('배경 이미지를 추가했습니다.');
    } catch (e) {
      alert('추가 실패: ' + String(e?.message||e));
    } finally { setBusy(false); }
  };
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1600, background:'rgba(2,6,23,0.65)' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0 }} />
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
            <div style={{ fontSize:13, color:'#cbd5e1' }}>배경 이미지 추가</div>
            <label style={{ fontSize:12, color:'#94a3b8' }}>이름</label>
            <input value={imageName} onChange={e=>setImageName(e.target.value)} placeholder="예: 숲-아침"
              style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
            <label style={{ fontSize:12, color:'#94a3b8' }}>이미지 URL</label>
            <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://..."
              style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
            <div>
              <button onClick={onAddBackground} disabled={busy} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #10b981', background:'#065f46', color:'#d1fae5', fontWeight:700 }}>{busy?'추가 중…':'배경 추가'}</button>
            </div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>팁: 이미지 추가 시 메인 UI 모듈이 비어 있다면 기본 프리셋을 자동 적용합니다.</div>
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
