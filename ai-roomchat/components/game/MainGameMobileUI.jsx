"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useIsMobile from '@/utils/useIsMobile';
import { useWorkspace } from '../workspace/CodeWorkspaceProvider.jsx';
import DynamicSlot from './slots/DynamicSlot.jsx';
import { attachCanvas2D } from '../../lib/runtime/adapters/rendererCanvas2D.js';
import {
  buildInitialGridState,
  movePlayerOnGrid,
} from '../../lib/runtime/adapters/worldGridEngine.js';

// Shared style tokens
const btn = { padding:'6px 10px', border:'1px solid #334155', background:'#1e293b', color:'#e2e8f0', borderRadius:8 };
const btnGhost = { padding:'6px 10px', border:'1px solid rgba(148,163,184,0.35)', background:'transparent', color:'#e2e8f0', borderRadius:8 };
const btnPrimary = { padding:'8px 14px', border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff', borderRadius:10, fontWeight:700 };
const input = { flex:1, minWidth:0, padding:'8px 10px', background:'#0f172a', color:'#e2e8f0', border:'1px solid #334155', borderRadius:8, outline:'none' };
const ctl = { padding:'4px 8px', border:'1px solid #334155', background:'#0f172a', color:'#cbd5e1', borderRadius:6 };

export default function MainGameMobileUI({
  template,
  user = null,
  onNext = () => {},
  runtimeFeed = null,
  runtimeSecondsLeft = null,
  onForceNext = null,
  onPlayerChat = null,
  runtimeBus = null,
  runtimeFeatures = [],
}) {
  const isMobile = useIsMobile(820); // currently unused but reserved for responsive adjustments
  const [layout, setLayout] = useState(() => loadLayout());
  const [edit, setEdit] = useState(false);
  const [gameChat, setGameChat] = useState(() => [{ role: 'system', text: '게임이 시작되었습니다.' }]);
  const [chat, setChat] = useState([]);
  const [chatText, setChatText] = useState('');
  const { files } = useWorkspace();
  const uiConfig = useMemo(() => readUiConfig(template), [template]);
  const nextPolicy = uiConfig?.nextBar?.policy || { timeoutSec: null, roleThreshold: null };
  const [secondsLeft, setSecondsLeft] = useState(() => (typeof nextPolicy.timeoutSec === 'number' ? nextPolicy.timeoutSec : null));
  const [charViewIdx, setCharViewIdx] = useState(0);

  const character = useMemo(() => pickCharacter(template), [template]);
  const imageUrl = character?.image || pickFirstImage(template);
  const userLabel = useMemo(() => user?.name || user?.id || 'User #1234', [user]);

  // Persist manual layout edits
  useEffect(() => { saveLayout(layout); }, [layout]);
  // Optional runtime bus listeners (no-op when not provided)
  useEffect(() => {
    if (!runtimeBus || typeof runtimeBus.on !== 'function') return;
    const offLayout = runtimeBus.on('ui:setLayout', (order) => {
      try { if (Array.isArray(order)) setLayout(cur => ({ ...cur, order })); } catch {}
    });
    const offSystem = runtimeBus.on('system:message', (msg) => {
      try { if (msg != null) setGameChat(prev => [...prev, { role: 'system', text: String(msg) }]); } catch {}
    });
    return () => { try { offLayout?.(); offSystem?.(); } catch {} };
  }, [runtimeBus]);

  // Template-driven layout override (only when not manually editing)
  useEffect(() => {
    try {
      if (edit) return; // respect manual edit mode
      const tplLayout = template?.ui?.play?.layout?.order;
      if (Array.isArray(tplLayout) && tplLayout.every(x => typeof x === 'string')) {
        const allowed = ['header','gameChat','nextBar','playerChat','character','widgets'];
        const filtered = tplLayout.filter(id => allowed.includes(id));
        if (filtered.length) setLayout(cur => ({ ...cur, order: filtered }));
      }
    } catch {}
  }, [template, edit]);

  const sendChat = useCallback(() => {
    const t = (chatText || '').trim(); if (!t) return;
    if (typeof onPlayerChat === 'function') {
      try { onPlayerChat({ text: t }); } catch {}
    } else {
      setChat(prev => [...prev, { role: 'me', text: t, at: Date.now() }]);
    }
    try { runtimeBus?.emit?.('player:chat', { text: t }); } catch {}
    setChatText('');
  }, [chatText, onPlayerChat, runtimeBus]);

  const triggerNext = useCallback(() => {
    if (typeof onForceNext === 'function') {
      try { onForceNext(); } catch {}
    } else {
      setGameChat(prev => [...prev, { role: 'system', text: '다음 단계로 진행합니다.' }]);
    }
    try { runtimeBus?.emit?.('turn:next'); } catch {}
    try { onNext?.(); } catch {}
    if (onForceNext == null && typeof nextPolicy.timeoutSec === 'number') setSecondsLeft(nextPolicy.timeoutSec);
  }, [onNext, onForceNext, nextPolicy?.timeoutSec, runtimeBus]);

  // Local countdown timer (skipped if external runtime controls)
  useEffect(() => {
    if (!(typeof nextPolicy.timeoutSec === 'number') || nextPolicy.timeoutSec <= 0) return;
    if (onForceNext != null) return;
    if (!(typeof secondsLeft === 'number')) return;
    if (secondsLeft <= 0) { triggerNext(); return; }
    const t = setTimeout(() => setSecondsLeft(s => (typeof s === 'number' ? s - 1 : s)), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, nextPolicy?.timeoutSec, triggerNext, onForceNext]);

  const move = useCallback((id, dir) => {
    const order = [...layout.order];
    const idx = order.indexOf(id); if (idx < 0) return;
    const j = dir === 'up' ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
    if (j === idx) return;
    [order[idx], order[j]] = [order[j], order[idx]];
    setLayout({ ...layout, order });
  }, [layout]);

  const hasWorldGridFeature = useMemo(
    () => Array.isArray(runtimeFeatures) && runtimeFeatures.some((f) => f && f.id === 'world.grid-basic'),
    [runtimeFeatures],
  );

  const gridInitial = useMemo(
    () => (hasWorldGridFeature ? buildInitialGridState(files) : null),
    [files, hasWorldGridFeature],
  );
  const [gridState, setGridState] = useState(() => gridInitial);

  useEffect(() => {
    setGridState(gridInitial);
  }, [gridInitial]);

  // Subscribe to world:grid:state events from the grid engine.
  useEffect(() => {
    if (!runtimeBus) return undefined;
    const handler = (payload) => {
      try {
        if (payload && payload.grid) {
          setGridState(payload.grid);
        }
      } catch {
        // ignore malformed payloads
      }
    };
    const off = runtimeBus.on?.('world:grid:state', handler);
    return () => {
      try {
        off && off();
      } catch {
        // ignore
      }
    };
  }, [runtimeBus]);

  const modules = useMemo(() => {
    const widgetFlags = readWidgetFlags(template);
    const playWidgets = buildDefaultWidgets(template, widgetFlags, gridState);
    const defs = {
      header: <DynamicSlot key="header" slotId="play.header" files={files} resolveAsset={(x)=>x} defaultRender={() => <Header userLabel={userLabel} edit={edit} setEdit={setEdit} />} />,
      gameChat: <DynamicSlot key="gameChat" slotId="play.gameChat" files={files} resolveAsset={(x)=>x} defaultRender={() => <GameChat items={Array.isArray(runtimeFeed) ? runtimeFeed.map(m => ({ role: (m.roleScope==='system'?'system':'ai'), text: m.text })) : gameChat} />} />,
      nextBar: <DynamicSlot key="nextBar" slotId="play.nextBar" files={files} resolveAsset={(x)=>x} defaultRender={() => <NextBar onNext={triggerNext} secondsLeft={(onForceNext != null && typeof runtimeSecondsLeft === 'number') ? runtimeSecondsLeft : secondsLeft} />} />,
      playerChat: <DynamicSlot key="playerChat" slotId="play.playerChat" files={files} resolveAsset={(x)=>x} defaultRender={() => <PlayerChat items={chat} text={chatText} setText={setChatText} onSend={sendChat} />} />,
      ...(playWidgets.length > 0 ? { widgets: <DynamicSlot key="widgets" slotId="play.widgets" files={files} resolveAsset={(x)=>x} defaultRender={() => <WidgetRow widgets={playWidgets} />} /> } : {}),
      character: <DynamicSlot key="character" slotId="play.character" files={files} resolveAsset={(x)=>x} defaultRender={() => <CharacterCard name={character?.name||'캐릭터'} image={imageUrl} desc={character?.desc||'설명'} stats={character?.stats||[10,10,10,10]} cycle={uiConfig?.character?.behavior?.tapCycle || ['desc','abilities','score','image']} viewIdx={charViewIdx} setViewIdx={setCharViewIdx} />} />,
    };
    return layout.order.map(id => defs[id]).filter(Boolean);
  }, [layout.order, userLabel, edit, gameChat, runtimeFeed, triggerNext, chat, chatText, template, character, imageUrl, sendChat, onForceNext, runtimeSecondsLeft, uiConfig, charViewIdx, files, secondsLeft, gridState]);

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

function NextBar({ onNext, secondsLeft }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {typeof secondsLeft === 'number' && secondsLeft >= 0 && (
          <span style={{ fontSize:12, color:'#93c5fd' }}>자동 진행: {secondsLeft}s</span>
        )}
        <button onClick={onNext} style={btnPrimary}>다음 ▶</button>
      </div>
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

function WidgetRow({ widgets = [] }) {
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

function CharacterCard({ name, image, desc, stats = [], cycle = ['desc','abilities','score','image'], viewIdx = 0, setViewIdx = () => {} }) {
  const onTap = useCallback(() => {
    try { setViewIdx((i) => (i + 1) % Math.max(1, cycle.length)); } catch {}
  }, [setViewIdx, cycle]);
  const mode = cycle?.[viewIdx] || 'desc';
  return (
    <div onClick={onTap} title="탭하여 전환" style={{ display:'grid', gridTemplateColumns:'72px 1fr', gap:10, alignItems:'center', background:'#0a1220', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12, padding:10 }}>
      <div style={{ width:72, height:72, borderRadius:8, background:'#111827', overflow:'hidden' }}>
        {image && mode==='image' ? <img src={image} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>{name}</div>
        {mode==='desc' && (
          <div style={{ fontSize:12, color:'#cbd5e1', marginTop:4, lineHeight:1.5, maxHeight:48, overflow:'hidden' }}>{desc}</div>
        )}
        {mode==='abilities' && (
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            {stats.slice(0,4).map((s,i) => (
              <div key={i} style={{ fontSize:12, color:'#93c5fd' }}>능력{i+1}: <span style={{ color:'#e2e8f0' }}>{s}</span></div>
            ))}
          </div>
        )}
        {mode==='score' && (
          <div style={{ fontSize:12, color:'#93c5fd', marginTop:8 }}>점수: <span style={{ color:'#e2e8f0' }}>{(stats[0]||0) + (stats[1]||0)}</span></div>
        )}
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

function readUiConfig(template){
  try{
    const ui = template?.ui?.main?.modules || [];
    const nextBar = ui.find(m => m?.type === 'NextBar') || null;
    const character = ui.find(m => m?.type === 'CharacterCards') || null;
    return {
      nextBar,
      character,
    };
  }catch{}
  return {};
}

function buildDefaultWidgets(template, flags, gridState){
  const list = [];
  // Resource preview (only if explicitly enabled)
  if (flags?.resourcePreviewEnabled) {
    const image = pickFirstImage(template);
    list.push({ title: '리소스 미리보기', body: image ? <img src={image} alt="res" style={{ width:'100%', height:120, objectFit:'cover', borderRadius:8 }} /> : <div style={{ fontSize:12, color:'#94a3b8' }}>이미지가 없습니다.</div> });
  }
  // Code runner placeholder (only if explicitly enabled)
  if (flags?.codeRunnerEnabled) {
    list.push({ title: '사용자 지정 코드', body: <div style={{ fontSize:12, color:'#94a3b8' }}>코드 실행 위젯 (연결 예정)</div> });
  }
  if (gridState) {
    list.push({ title: '그리드 월드', body: <GridCanvas grid={gridState} /> });
  }
  return list;
}

function readWidgetFlags(template){
  const safe = (v) => v === true || v === 'true' || v === 1;
  try{
    const ui = template?.ui || {};
    // Check a few possible locations to consider the widget as "included"
    const main = ui?.main || {};
    const mainWidgets = main?.widgets || {};
    const generic = ui?.widgets || {};
    const play = ui?.play || {};
    const playWidgets = play?.widgets || {};
    const resourcePreviewEnabled = safe(mainWidgets?.resourcePreview?.enabled) || safe(generic?.resourcePreview?.enabled) || safe(playWidgets?.resourcePreview?.enabled) || safe(mainWidgets?.resourcePreview) || safe(generic?.resourcePreview) || safe(playWidgets?.resourcePreview);
    const codeRunnerEnabled = safe(mainWidgets?.codeRunner?.enabled) || safe(generic?.codeRunner?.enabled) || safe(playWidgets?.codeRunner?.enabled) || safe(mainWidgets?.codeRunner) || safe(generic?.codeRunner) || safe(playWidgets?.codeRunner);
    return { resourcePreviewEnabled, codeRunnerEnabled };
  }catch{}
  return { resourcePreviewEnabled: false, codeRunnerEnabled: false };
}

function loadLayout(){
  try {
    const raw = localStorage.getItem('mainGame:layout');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { order: ['header','gameChat','nextBar','playerChat','character'] }; // default layout
}
function saveLayout(layout){
  try { localStorage.setItem('mainGame:layout', JSON.stringify(layout)); } catch {}
}

function GridCanvas({ grid }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    rendererRef.current = attachCanvas2D(canvasRef.current, {});
    return () => {
      try {
        rendererRef.current?.dispose?.();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (!rendererRef.current) return;
    try {
      rendererRef.current.draw({ grid });
    } catch {
      // ignore draw errors
    }
  }, [grid]);

  return (
    <div style={{ width:'100%', height:180, border:'1px solid #1f2937', borderRadius:8, background:'#020617', overflow:'hidden' }}>
      <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />
    </div>
  );
}
