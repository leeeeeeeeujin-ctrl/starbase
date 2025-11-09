"use client";

import React from 'react';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';

export default function WorkspaceDebugBadge(){
  try {
    const ctx = useWorkspace();
    const filesCount = Object.keys(ctx?.files || {}).length;
    // Prefer explicit inspector namespace, fallback to the scoped patch if present.
    const ns = (typeof window !== 'undefined' ? (window.__WORKSPACE_INSPECTOR__?.ns || (window.__VFS_SCOPED_PATCH__ && window.__VFS_SCOPED_PATCH__.scope)) : null) || null;
    return (
      <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 2000, background: 'rgba(2,6,23,0.9)', color: '#e6eef8', padding: '8px 10px', borderRadius: 8, fontSize: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.6)', border: '1px solid rgba(148,163,184,0.12)' }}>
        <div style={{ fontWeight:700, marginBottom:4 }}>Workspace</div>
        <div>ns: <code style={{ color:'#cbd5e1' }}>{ns || (window.__WORKSPACE_INSPECTOR__?.ns) || '-'}</code></div>
        <div>active: <code style={{ color:'#cbd5e1' }}>{ctx?.activePath || '-'}</code></div>
        <div>files: <code style={{ color:'#cbd5e1' }}>{filesCount}</code></div>
      </div>
    );
  } catch (e) {
    return null;
  }
}
