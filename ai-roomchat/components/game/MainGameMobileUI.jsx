"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import useIsMobile from '@/utils/useIsMobile';

export default function MainGameMobileUI({ template, user = null, onNext = () => {} }) {
  const isMobile = useIsMobile(820);
  const [layout, setLayout] = useState(() => loadLayout());
  const [edit, setEdit] = useState(false);
  const [gameChat, setGameChat] = useState(() => [{ role: 'system', text: '게임이 시작되었습니다.' }]);
  const [chat, setChat] = useState([]);
  const [chatText, setChatText] = useState('');

  const character = useMemo(() => pickCharacter(template), [template]);
  const imageUrl = character?.image || pickFirstImage(template);

  const userLabel = useMemo(() => user?.name || user?.id || 'User #1234', [user]);

  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  const sendChat = useCallback(() => {
    const t = (chatText || '').trim(); if (!t) return;
    setChat(prev => [...prev, { role: 'me', text: t, at: Date.now() }]);
    setChatText('');
  }, [chatText]);

  const triggerNext = useCallback(() => {
    setGameChat(prev => [...prev, { role: 'system', text: '다음 단계로 진행합니다.' }]);
    try { onNext?.(); } catch {}
  }, [onNext]);

  // Simple reorder helpers for layout editing
  const move = useCallback((id, dir) => {
    const order = [...layout.order];
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const j = dir === 'up' ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
    if (j === idx) return;
    const tmp = order[idx]; order[idx] = order[j]; order[j] = tmp;
    setLayout({ ...layout, order });
  }, [layout]);

  const modules = useMemo(() => {
    const defs = {
      header: (
        <Header key="header" userLabel={userLabel} edit={edit} setEdit={setEdit} />
      ),
      gameChat: (
        <GameChat key="gameChat" items={gameChat} />
      ),
      nextBar: (
        <NextBar key="nextBar" onNext={triggerNext} />
      ),
      playerChat: (
        <PlayerChat key="playerChat" items={chat} text={chatText} setText={setChatText} onSend={sendChat} />
      ),
      widgets: (
        <WidgetRow key="widgets" template={template} />
      ),
      character: (
        <CharacterCard key="character" name={character?.name||'캐릭터'} image={imageUrl} desc={character?.desc||'설명'} stats={character?.stats||[10,10,10,10]} />
      ),
    };
    return layout.order.map(id => defs[id]).filter(Boolean);
  }, [layout.order, userLabel, edit, gameChat, triggerNext, chat, chatText, template, character, imageUrl, sendChat]);

  return (
    <div style={{ position:'fixed', inset:0, background:'#0b1220', color:'#e2e8f0', display:'flex', flexDirection:'column' }}>
      <div style={{ display:'grid', gridTemplateRows:'auto 1fr auto auto auto', gap:8, padding: 'env(safe-area-inset-top) 8px calc(env(safe-area-inset-bottom) + 8px) 8px', minHeight:'100svh' }}>
        {modules.map((m, i) => (
          <div key={i} style={{ position:'relative' }}>
            {edit && (
              <div style={{ position:'absolute', right:8, top:8, display:'flex', gap:6, zIndex:2 }}>
                <button onClick={() => move(layout.order[i], 'up')} style={ctl}>▲</button>
                <button onClick={() => move(layout.order[i], 'down')} style={ctl}>▼</button>
              </div>
            )}
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ userLabel, edit, setEdit }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', background:'#0f172a', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:28, height:28, borderRadius:14, background:'#111827' }} />
        <strong style={{ fontSize:14 }}>{userLabel}</strong>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={() => setEdit(v => !v)} style={btnGhost}>{edit ? '편집 종료' : '편집'}</button>
      </div>
    </div>
  );
}

function GameChat({ items }) {
  return (
    <div style={{ background:'#0a1220', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12, minHeight:200, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'8px 10px', borderBottom:'1px solid rgba(148,163,184,0.2)', fontSize:12, color:'#93c5fd' }}>AI 게임 채팅</div>
      <div style={{ flex:1, minHeight:0, overflow:'auto', padding:10, display:'grid', gap:8 }}>
        {items.map((m, i) => (
          <div key={i} style={{ fontSize:13, lineHeight:1.5, color: m.role==='system' ? '#e2e8f0' : '#cbd5e1' }}>{m.text}</div>
        ))}
      </div>
    </div>
  );
}

function NextBar({ onNext }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end' }}>
      <button onClick={onNext} style={btnPrimary}>다음 ▶</button>
    </div>
  );
}

function PlayerChat({ items, text, setText, onSend }) {
  return (
    <div style={{ background:'#0a1220', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12 }}>
      <div style={{ maxHeight:120, overflow:'auto', padding:10, display:'grid', gap:6 }}>
        {items.map((m,i) => (
          <div key={i} style={{ fontSize:12, color: m.role==='me' ? '#a7f3d0' : '#cbd5e1' }}>{m.text}</div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, padding:8, borderTop:'1px solid rgba(148,163,184,0.2)' }}>
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="메시지 입력" style={input} />
        <button onClick={onSend} style={btn}>전송</button>
      </div>
    </div>
  );
}

function WidgetRow({ template }) {
  const widgets = useMemo(() => buildDefaultWidgets(template), [template]);
  return (
    <div style={{ display:'flex', gap:8, overflowX:'auto' }}>
      {widgets.map((w, i) => (
        <div key={i} style={{ minWidth: 180, background:'#0a1220', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12, padding:8 }}>
          <div style={{ fontSize:12, color:'#93c5fd', marginBottom:6 }}>{w.title}</div>
          {w.body}
        </div>
      ))}
    </div>
  );
}

function CharacterCard({ name, image, desc, stats = [] }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'72px 1fr', gap:10, alignItems:'center', background:'#0a1220', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12, padding:10 }}>
      <div style={{ width:72, height:72, borderRadius:8, background:'#111827', overflow:'hidden' }}>
        {image ? <img src={image} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>{name}</div>
        <div style={{ fontSize:12, color:'#cbd5e1', marginTop:4, lineHeight:1.5, maxHeight:48, overflow:'hidden' }}>{desc}</div>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          {stats.slice(0,4).map((s,i) => (
            <div key={i} style={{ fontSize:12, color:'#93c5fd' }}>능력{i+1}: <span style={{ color:'#e2e8f0' }}>{s}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function pickCharacter(template){
  try{
    const obj = template||{}; const ch = obj?.resources?.characters; if (Array.isArray(ch) && ch.length) {
      const c = ch[0];
      return {
        name: c.name || '캐릭터',
        image: c.image || null,
        desc: c.desc || c.description || '',
        stats: Array.isArray(c.stats) ? c.stats : [c.hp||10, c.attack||10, c.defense||10, c.magic||10],
      };
    }
  }catch{}
  return null;
}

function pickFirstImage(template){
  try{
    const files = template?.resources?.files || [];
    const img = files.find(f => String(f?.mime||'').startsWith('image/'));
    return img?.url || null;
  }catch{}
  return null;
}

function buildDefaultWidgets(template){
  const list = [];
  // Resource preview
  const image = pickFirstImage(template);
  list.push({ title: '리소스 미리보기', body: image ? <img src={image} alt="res" style={{ width:'100%', height:120, objectFit:'cover', borderRadius:8 }} /> : <div style={{ fontSize:12, color:'#94a3b8' }}>이미지가 없습니다.</div> });
  // Code runner placeholder (future: plug real runner)
  list.push({ title: '사용자 지정 코드', body: <div style={{ fontSize:12, color:'#94a3b8' }}>코드 실행 위젯 (연결 예정)</div> });
  return list;
}

function loadLayout(){
  try{
    const raw = localStorage.getItem('mainGame:layout');
    if (raw) return JSON.parse(raw);
  }catch{}
  return { order: ['header','gameChat','nextBar','playerChat','widgets','character'] };
}
function saveLayout(layout){
  try{ localStorage.setItem('mainGame:layout', JSON.stringify(layout)); }catch{}
}

const btn = { padding:'6px 10px', border:'1px solid #334155', background:'#1e293b', color:'#e2e8f0', borderRadius:8 };
const btnGhost = { padding:'6px 10px', border:'1px solid rgba(148,163,184,0.35)', background:'transparent', color:'#e2e8f0', borderRadius:8 };
const btnPrimary = { padding:'8px 14px', border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff', borderRadius:10, fontWeight:700 };
const input = { flex:1, minWidth:0, padding:'8px 10px', background:'#0f172a', color:'#e2e8f0', border:'1px solid #334155', borderRadius:8, outline:'none' };
const ctl = { padding:'4px 8px', border:'1px solid #334155', background:'#0f172a', color:'#cbd5e1', borderRadius:6 };
