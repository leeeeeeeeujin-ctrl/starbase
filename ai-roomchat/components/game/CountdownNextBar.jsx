"use client";

import { useState } from "react";
import { useGameRuntime } from "./GameRuntimeProvider.jsx";

export default function CountdownNextBar({ currentUser = { id: 'local', role:'players' } }){
  const { durations, secondsLeft, startTimer, voteNext, roles } = useGameRuntime();
  const [sel, setSel] = useState(60);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'rgba(2,6,23,0.6)', color:'#e2e8f0', border:'1px solid #25314a', borderRadius:12 }}>
      <span>⏱️ 남은시간: <strong>{secondsLeft}s</strong></span>
      <select value={sel} onChange={e=>setSel(parseInt(e.target.value,10))} style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>
        {durations.map(s => <option key={s} value={s}>{s}s</option>)}
      </select>
      <button onClick={()=>startTimer(sel)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #10b981', background:'#0b1220', color:'#a7f3d0' }}>타이머 시작</button>
      <button onClick={()=>voteNext(currentUser.id, currentUser.role)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #f59e0b', background:'#0b1220', color:'#fde68a' }}>다음</button>
      <span style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8' }}>역할군: {Object.keys(roles).join(', ')}</span>
    </div>
  );
}

