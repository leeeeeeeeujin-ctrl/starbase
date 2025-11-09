"use client";

import { useState } from 'react';
import Toolbar2 from './Toolbar2.jsx';
import FileTree from '../workspace/FileTree.jsx';
import PromptGraphEditor2 from './PromptGraphEditor2.jsx';

export default function StudioShell2({ id, title }){
  const [showTree, setShowTree] = useState(true);
  const treeWidth = 260;
  return (
    <div style={{ position:'absolute', inset:0, background:'#0b1220', display:'grid', gridTemplateRows:'auto 1fr' }}>
      <Toolbar2 id={id} title={title} />
      <div style={{ position:'relative' }}>
        {!showTree ? null : (
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:treeWidth, borderRight:'1px solid #25314a' }}>
            <FileTree />
          </div>
        )}
        <div style={{ position:'absolute', left: showTree ? treeWidth : 0, right:0, top:0, bottom:0 }}>
          <PromptGraphEditor2 />
        </div>
        <button onClick={()=> setShowTree(v=>!v)} title="파일트리" style={{ position:'absolute', top:8, left: showTree ? (treeWidth+8) : 8, zIndex:10, padding:'4px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>☰</button>
      </div>
    </div>
  );
}

