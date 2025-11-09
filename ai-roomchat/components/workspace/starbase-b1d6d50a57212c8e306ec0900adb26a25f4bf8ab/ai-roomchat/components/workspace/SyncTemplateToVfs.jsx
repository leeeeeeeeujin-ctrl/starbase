"use client";

import React, { useEffect, useRef } from 'react';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';

function InnerSync({ text, setText }){
  const { files, writeFile } = useWorkspace();
  const current = files['/template.json']?.content ?? '';
  const guard = useRef({ toVfs:false, toText:false });
  useEffect(() => {
    try {
      if (typeof text === 'string' && text !== current && !guard.current.toText) {
        guard.current.toVfs = true;
        writeFile('/template.json', text);
        try {
          const obj = JSON.parse(text || '{}');
          const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
          const edges = Array.isArray(obj.edges) ? obj.edges : [];
          const g = {
            nodes: nodes.map(n => ({ id: n.id, type: n.type || 'prompt', label: n.data?.name || n.label || '' })),
            edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label || '' })),
          };
          writeFile('/graph/prompt-graph.json', JSON.stringify(g, null, 2)+'\n');
        } catch {}
        setTimeout(()=>{ guard.current.toVfs = false; },0);
      }
    } catch {}
  }, [text, current, writeFile]);
  useEffect(() => {
    try {
      if (typeof current === 'string' && typeof setText === 'function' && current !== text && !guard.current.toVfs) {
        guard.current.toText = true;
        setText(current);
        setTimeout(()=>{ guard.current.toText = false; },0);
      }
    } catch {}
  }, [current, text, setText]);
  return null;
}

class WorkspaceBoundary extends React.Component {
  constructor(props){ super(props); this.state={ hasError:false }; }
  static getDerivedStateFromError(){ return { hasError:true }; }
  componentDidCatch(err){ try{ console.warn('[SyncTemplateToVfs] workspace unavailable', err?.message||err); }catch{} }
  render(){ return this.state.hasError ? null : this.props.children; }
}

export default function SyncTemplateToVfs(props){
  return (
    <WorkspaceBoundary>
      <InnerSync {...props} />
    </WorkspaceBoundary>
  );
}
