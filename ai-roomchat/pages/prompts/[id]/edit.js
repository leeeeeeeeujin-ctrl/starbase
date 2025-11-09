import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import PromptEditor from '../../../components/PromptEditor';
import AICodeChatPanel from '../../../components/workspace/AICodeChatPanel.jsx';
import { CodeWorkspaceProvider, useWorkspace } from '../../../components/workspace/CodeWorkspaceProvider.jsx';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';
import createPrompt from '../../../lib/prompts/createPrompt.js';

function ToolsDropdown({ onOpenUiSettings }) {
  return (
    <select onChange={(e) => { const v = e.target.value; e.target.selectedIndex = 0; if (v === 'ui-settings') onOpenUiSettings && onOpenUiSettings(); }} defaultValue="">
      <option value="" disabled>도구…</option>
      <option value="ui-settings">UI 설정</option>
    </select>
  );
}

function UiSettingsPanel({ onClose }) {
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, width: 360, background: '#061023', color: '#e2e8f0', padding: 12, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>UI Settings</strong>
        <button onClick={onClose}>Close</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 13 }}>Small UI settings placeholder.</div>
    </div>
  );
}

function PromptEditInner({ etag, setEtag, frameId }) {
  const router = useRouter();
  const { id } = router.query;
  const [prompt, setPrompt] = useState({ id: id || 'new', name: '', body: '' });
  const [aiResult, setAiResult] = useState(null);
  const [editorBody, setEditorBody] = useState(prompt.body || '');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [showAgent, setShowAgent] = useState(false);
  const [showUiSettings, setShowUiSettings] = useState(false);

  const { files } = useWorkspace();
  const etagRef = useRef(etag || null);
  useEffect(() => { etagRef.current = etag || null; }, [etag]);

  useEffect(() => {
    if (!id) return;
    if (id === 'example-1') {
      setPrompt({ id, name: 'Example Prompt 1', body: 'Hello {{player.name}}' });
    } else if (id === 'new') {
      setPrompt({ id, name: '', body: '' });
    } else {
      (async () => {
        try {
          const res = await fetch(`/api/prompts/${encodeURIComponent(id)}`);
          if (res.ok) {
            const json = await res.json();
            setPrompt({ id: json.id, name: json.name || '', body: json.body || '' });
            return;
          }
        } catch (err) {}
        setPrompt({ id, name: id, body: '' });
      })();
    }
  }, [id]);

  useEffect(() => { setEditorBody(prompt.body || ''); }, [prompt.body]);

  useEffect(() => {
    if (!id) return;
    try {
      const key = `ai-assist-result:${id}`;
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (raw) setAiResult(JSON.parse(raw));
    } catch (err) {}
  }, [id]);

  async function handleSave(body) {
    if (savingRef.current) return;
    const payload = { id: prompt.id === 'new' ? undefined : prompt.id, name: prompt.name || '', body };
    try {
      setSaving(true);
      savingRef.current = true;
      if (!prompt.id || prompt.id === 'new') {
        const gen = (p) => { try { return p + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)); } catch { return p + Math.random().toString(36).slice(2); } };
        const newId = gen('pr_');
        const createRes = await createPrompt({ ...payload, id: newId });
        const created = createRes && createRes.id ? createRes : (createRes || {});
        router.replace(`/prompts/${encodeURIComponent(created.id || newId)}/edit`);
        return;
      } else {
        const res = await fetch(`/api/prompts/${encodeURIComponent(prompt.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'update failed');
        setPrompt(p => ({ ...p, body: json.body || body, name: json.name || p.name }));

        try {
          const list = Object.entries(files || {}).map(([path, meta]) => ({ path, content: String(meta?.content ?? ''), readonly: !!meta?.readonly, dir: !!meta?.dir }));
          let put = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(etagRef.current ? { 'If-Match': etagRef.current } : {}) }, body: JSON.stringify({ files: list, meta: {} }) });
          if (put.status === 428 || put.status === 404) {
            const reqId = `req_${Math.random().toString(36).slice(2)}`;
            await fetch('/api/workspace/sets', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-Id': reqId }, body: JSON.stringify({ id }) }).catch(()=>{});
            put = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(etagRef.current ? { 'If-Match': etagRef.current } : {}) }, body: JSON.stringify({ files: list, meta: {} }) });
          }
          const pj = await put.json().catch(()=>({}));
          if (put.status === 200 && pj?.etag) setEtag && setEtag(pj.etag);
        } catch (err) {}

        alert('Saved');
      }
    } catch (err) {
      alert('Save failed: ' + String(err));
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  function handleNameChange(e) { const val = e.target.value; setPrompt(p => ({ ...p, name: val })); }
  function applyAiResult() { if (!aiResult) return; const newBody = (prompt.body || '') + '\n\n' + aiResult.text; setPrompt(p => ({ ...p, body: newBody })); try { if (typeof window !== 'undefined') window.localStorage.removeItem(`ai-assist-result:${id}`); setAiResult(null); } catch (err) {} }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Edit Prompt — {prompt.id}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/prompts"><a>Back to list</a></Link>
          <ToolsDropdown onOpenUiSettings={() => setShowUiSettings(true)} />
          <button onClick={() => setShowAgent(true)} style={{ padding: '6px 10px', borderRadius: 8 }}>AI 에이전트</button>
        </div>
      </div>

      {aiResult ? (
        <div style={{ marginBottom: 12, padding: 12, border: '1px solid #e0e0e0', background: '#f9f9ff' }}>
          <strong>AI Assist result ready</strong>
          <div style={{ marginTop: 8 }}><pre style={{ whiteSpace: 'pre-wrap' }}>{aiResult.text}</pre></div>
          <div style={{ marginTop: 8 }}>
            <button onClick={applyAiResult}>Apply to editor</button>
            <Link href={`/prompts/${encodeURIComponent(prompt.id)}/ai-assist`}><a style={{ marginLeft: 12 }}>Open AI Assist</a></Link>
          </div>
        </div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Prompt name</label>
        <input value={prompt.name || ''} onChange={handleNameChange} style={{ width: '100%', padding: 8 }} />
      </div>

      <PromptEditor initialBody={prompt.body} onChange={b => setEditorBody(b)} />

      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={() => handleSave(editorBody)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <span style={{ marginLeft: 12 }}>{prompt.version ? `Version: ${prompt.version}` : ''}</span>
      </div>

      {showAgent && (
        <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1200, width: 420, height: 360 }}>
          <div style={{ position: 'absolute', inset: 0 }}><AICodeChatPanel onClose={() => setShowAgent(false)} /></div>
        </div>
      )}

      {showUiSettings && <UiSettingsPanel onClose={() => setShowUiSettings(false)} />}
    </div>
  );
}

export default function PromptEditPage() {
  const router = useRouter();
  const { id } = router.query || {};
  if (!id || typeof id !== 'string') return <div style={{ padding: 20 }}>세트 ID 확인 중…</div>;
  return (
    <WorkspaceFrame id={id}>
      {({ etag, setEtag, id: frameId }) => (
        <PromptEditInner etag={etag} setEtag={setEtag} frameId={frameId} />
      )}
    </WorkspaceFrame>
  );
}

export async function getServerSideProps() { return { props: {} }; }


