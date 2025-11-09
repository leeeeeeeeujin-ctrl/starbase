"use client";

import { useMemo } from 'react';
import { useWorkspace } from '../workspace/CodeWorkspaceProvider.jsx';

export default function PromptGraphEditor2() {
  const { files, writeFile } = useWorkspace();
  const path = '/graph/prompt-graph.json';
  const value = useMemo(() => String(files?.[path]?.content ?? '{\n  "nodes": [],\n  "edges": []\n}\n'), [files]);
  function onChange(e) { writeFile(path, e.target.value); }
  return (
    <div style={{ position:'absolute', inset:0, display:'grid', gridTemplateRows:'auto 1fr', background:'#0b1220' }}>
      <div style={{ padding:'6px 10px', borderBottom:'1px solid #25314a', color:'#cbd5e1' }}>Prompt Graph (/graph/prompt-graph.json)</div>
      <textarea value={value} onChange={onChange} spellCheck={false}
        style={{ width:'100%', height:'100%', padding:12, background:'#0b1220', color:'#e2e8f0', border:'none', outline:'none', fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize:13 }} />
    </div>
  );
}

