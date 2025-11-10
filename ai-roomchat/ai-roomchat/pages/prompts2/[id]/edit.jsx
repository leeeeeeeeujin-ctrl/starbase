import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import WorkspaceFrame from '../../../components/workspace/WorkspaceFrame.jsx';
import { useWorkspace } from '../../../components/workspace/CodeWorkspaceProvider.jsx';
import { saveSet } from '../../../lib/workspace/saveSet.js';

export function SimpleEditor({ id }) {
  const { api, files, activePath } = useWorkspace();
  const [status, setStatus] = useState('');
  const etagRef = useRef(null);

  const paths = useMemo(() => Object.keys(files || {}).sort(), [files]);

  const onSave = async () => {
    try {
      setStatus('saving...');
      const exported = api.exportFiles();
      const newEtag = await saveSet(id, exported, etagRef);
      setStatus(newEtag ? 'saved' : 'saved');
      setTimeout(() => setStatus(''), 1000);
    } catch (err) {
      console.error('[prompts2/edit] save error', err);
      setStatus('save failed');
    }
  };

  const openCode = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('overlay:open', { detail: { type: 'code' } }));
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: '100vh' }}>
      <div style={{ borderRight: '1px solid #222', overflow: 'auto', background:'#0b1220', color:'#cbd5e1' }}>
        <div style={{ padding: 12, fontWeight: 700 }}>Files</div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {paths.map(p => (
            <li key={p} style={{ padding: '4px 12px', cursor:'pointer', background: p===activePath? '#19202e':'transparent' }} onClick={() => api.setActivePath(p)}>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div style={{ display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', gap:8, padding:8, borderBottom:'1px solid #222', background:'#0b1220' }}>
          <button onClick={onSave} style={{ padding:'6px 10px' }}>Save</button>
          <button onClick={openCode} style={{ padding:'6px 10px' }}>Open Code Overlay</button>
          <div style={{ color:'#94a3b8', marginLeft:8 }}>{status}</div>
        </div>
        <div style={{ flex:1, position:'relative' }}>
          <textarea
            value={files[activePath] ?? ''}
            onChange={(e) => api.writeFile(activePath || '/untitled.txt', e.target.value)}
            style={{ width:'100%', height:'100%', border:'none', outline:'none', fontFamily:'monospace', fontSize:14, background:'#0b1220', color:'#e2e8f0', padding:12 }}
          />
        </div>
      </div>
    </div>
  );
}

export default function EditPage() {
  const router = useRouter();
  const { id } = router.query;
  if (!id) return null;
  return (
    <WorkspaceFrame id={String(id)}>
      <SimpleEditor id={String(id)} />
    </WorkspaceFrame>
  );
}
