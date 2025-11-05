import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import PromptEditor from '../../../components/PromptEditor';
import AICodeChatPanel from '../../../components/workspace/AICodeChatPanel.jsx';
import { CodeWorkspaceProvider } from '../../../components/workspace/CodeWorkspaceProvider.jsx';
import Link from 'next/link';

export default function PromptEditPage() {
  const router = useRouter();
  const { id } = router.query;
  const [prompt, setPrompt] = useState({ id: id || 'new', name: '', body: '' });
  const [aiResult, setAiResult] = useState(null);
  const [editorBody, setEditorBody] = useState(prompt.body || '');
  const [saving, setSaving] = useState(false);
  const [showAgent, setShowAgent] = useState(false);

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
          <CodeWorkspaceProvider>
            <div style={{ position:'absolute', inset:0 }}>
              <AICodeChatPanel onClose={()=> setShowAgent(false)} />
            </div>
          </CodeWorkspaceProvider>
        </div>
      )}
    </div>
  );
}

// Avoid static generation to prevent build-time execution pitfalls; render per-request.
export async function getServerSideProps() {
  return { props: {} };
}
