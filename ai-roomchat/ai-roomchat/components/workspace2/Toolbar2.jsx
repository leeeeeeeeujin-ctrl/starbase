"use client";

import { useState } from 'react';
import { useWorkspace } from '../workspace/CodeWorkspaceProvider.jsx';
import { saveSet } from '../../lib/workspace/saveSet.js';

export default function Toolbar2({ id, title = 'Maker' }) {
  const { files } = useWorkspace();
  const [saving, setSaving] = useState(false);
  async function onSave() {
    if (!id || saving) return;
    try {
      setSaving(true);
      await saveSet(String(id), files);
      try { alert('Saved'); } catch {}
    } catch (e) {
      try { alert('Save failed: ' + String(e?.message || e)); } catch {}
    } finally {
      setSaving(false);
    }
  }
  function openCode() {
    try { window.dispatchEvent(new CustomEvent('overlay:open', { detail: { type: 'code' } })); } catch {}
  }
  return (
    <div style={{ padding:'10px 12px', borderBottom:'1px solid #25314a', background:'#0b1220', color:'#e2e8f0', display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ fontWeight:700 }}>{title}</div>
      <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
        <button onClick={openCode} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>코드 에디터</button>
        <button disabled={!id || saving} onClick={onSave} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

