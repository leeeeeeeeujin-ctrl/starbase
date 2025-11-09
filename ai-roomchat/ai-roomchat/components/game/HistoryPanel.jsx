"use client";

import { useGameRuntime } from "./GameRuntimeProvider.jsx";

export default function HistoryPanel({ currentUser = { id:'local', role:'players' } }){
  const { chatMessages, exportBattleLog } = useGameRuntime();
  const visible = chatMessages.filter(m => m.to==='all' || m.to===currentUser.role || m.from?.id===currentUser.id);
  return (
    <div style={{ display:'grid', gridTemplateRows:'auto 1fr auto', height:'100%', background:'#0b1120', border:'1px solid #25314a', borderRadius:12, overflow:'hidden' }}>
      <div style={{ padding:10, background:'rgba(2,6,23,0.6)', color:'#e2e8f0', fontWeight:700 }}>히스토리 (개인 표시용)</div>
      <div style={{ padding:10, overflow:'auto' }}>
        {visible.map(m => (
          <div key={m.id} style={{ marginBottom:8, fontSize:13, color:'#e2e8f0' }}>
            <span style={{ color:'#94a3b8' }}>{new Date(m.ts).toLocaleTimeString()}</span> <strong>{m.from?.id}</strong> → <em>{m.to}</em>: {m.text}
          </div>
        ))}
      </div>
      <div style={{ padding:10, borderTop:'1px solid #25314a' }}>
        <button onClick={exportBattleLog} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #93c5fd', background:'#0b1220', color:'#bfdbfe' }}>베틀로그 저장</button>
      </div>
    </div>
  );
}

