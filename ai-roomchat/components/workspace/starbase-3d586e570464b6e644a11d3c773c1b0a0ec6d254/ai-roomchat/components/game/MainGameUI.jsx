"use client";

import { useEffect, useState } from "react";
import { useGameRuntime } from "./GameRuntimeProvider.jsx";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../workspace/CodeWorkspaceProvider.jsx";
import DynamicSlot from "./slots/DynamicSlot.jsx";

export default function MainGameUI({ currentUser = { id: 'local', role: 'players' }, resolveAsset }){
  const { aiMessages, sendAI } = useGameRuntime();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const { files } = useWorkspace();

  const send = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || null;
      const sys = '역할에 맞춰 응답하는 실시간 메인게임 UI 보조자입니다. 응답은 간결하게.';
      const res = await fetch('/api/ai/gemini', { method:'POST', headers: { 'content-type':'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ model:'gemini-2.5-flash', contents: `${sys}\n\nUSER: ${prompt}`, prefer:'keyring' }) });
      const body = await res.json();
      const text = body?.result?.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
      sendAI({ id: `m_${Date.now()}`, roleScope: currentUser.role, text, ts: Date.now() }, `${sys}\n${prompt}`, text);
    } catch (e) {
      sendAI({ id: `m_${Date.now()}`, roleScope: currentUser.role, text: `(error) ${e?.message||e}`, ts: Date.now() });
    } finally { setBusy(false); setPrompt(''); }
  };

  // Allow overriding the entire panel via template.json ui.overrides.mainGame
  const defaultHeader = (
    <div style={{ padding:10, background:'rgba(2,6,23,0.6)', color:'#e2e8f0', fontWeight:700 }}>AI 메인게임 UI</div>
  );
  return (
    <div style={{ display:'grid', gridTemplateRows:'auto 1fr auto', height:'100%', background:'#0b1120', border:'1px solid #25314a', borderRadius:12, overflow:'hidden' }}>
      <DynamicSlot slotId="mainGame" files={files} resolveAsset={resolveAsset} defaultRender={() => defaultHeader} />
      <div style={{ padding:10, overflow:'auto' }}>
        {aiMessages.length===0 ? <div style={{ color:'#94a3b8', fontSize:12 }}>메시지가 없습니다.</div> : aiMessages.map(m => (
          <div key={m.id} style={{ marginBottom:10, padding:10, background:'rgba(14,165,233,0.08)', border:'1px solid rgba(148,163,184,0.25)', borderRadius:8, color:'#e2e8f0' }}>
            <div style={{ fontSize:11, color:'#94a3b8' }}>{new Date(m.ts).toLocaleTimeString()} • scope: {m.roleScope}</div>
            <div style={{ whiteSpace:'pre-wrap' }}>{m.text}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, padding:10, borderTop:'1px solid #25314a' }}>
        <input value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="메시지 또는 프롬프트" style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
        <button onClick={send} disabled={busy} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #22c55e', background:'#0b1220', color:'#86efac' }}>{busy?'보내는 중…':'보내기'}</button>
      </div>
    </div>
  );
}

