"use client";

import { useEffect, useRef } from 'react';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';

export default function SyncTemplateToVfs({ text, setText }){
  // 양방향 동기화 에코 방지
  const { files, writeFile } = useWorkspace();
  const current = files['/template.json']?.content ?? '';
  const guard = useRef({ toVfs:false, toText:false });
  useEffect(() => {
    try {
      if (typeof text === 'string' && text !== current && !guard.current.toText) {
        guard.current.toVfs = true;
        writeFile('/template.json', text);
        // also derive graph
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  useEffect(() => {
    try {
      if (typeof current === 'string' && typeof setText === 'function' && current !== text && !guard.current.toVfs) {
        guard.current.toText = true;
        setText(current);
        setTimeout(()=>{ guard.current.toText = false; },0);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  return null;
}
