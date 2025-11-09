"use client";

import { useState } from "react";
import { useGameRuntime } from "./GameRuntimeProvider.jsx";

export default function GameChatPanel({ currentUser = { id:'local', role:'players' }, roleTargets = ['all','players','observers'] }){
  const { chatMessages, sendChat } = useGameRuntime();
  const [to, setTo] = useState('all');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      sendChat({ id:`c_${Date.now()}`, from: currentUser, to, text, ts: Date.now() });
    } finally { setBusy(false); setText(''); }
  };
  const canSee = (m) => m.to === 'all' || m.to === currentUser.role || m.from?.id === currentUser.id;
  return (
    <div style={{ display:'grid', gridTemplateRows:'auto 1fr auto', height:'100%', background:'#0b1120', border:'1px solid #25314a', borderRadius:12, overflow:'hidden' }}>
      <div style={{ padding:10, background:'rgba(2,6,23,0.6)', color:'#e2e8f0', fontWeight:700 }}>게임 채팅</div>
      <div style={{ padding:10, overflow:'auto' }}>
        {chatMessages.filter(canSee).map(m => (
          <div key={m.id} style={{ marginBottom:8, fontSize:13, color:'#e2e8f0' }}>
            <span style={{ color:'#94a3b8' }}>{new Date(m.ts).toLocaleTimeString()}</span> <strong>{m.from?.id}</strong> → <em>{m.to}</em>: {m.text}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:6, padding:10, borderTop:'1px solid #25314a' }}>
        <select value={to} onChange={e=>setTo(e.target.value)} style={{ padding:'6px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>
          {roleTargets.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="메시지" style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
        <button onClick={send} disabled={busy} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #38bdf8', background:'#0b1220', color:'#bae6fd' }}>{busy?'전송…':'전송'}</button>
      </div>
    </div>
  );
}

