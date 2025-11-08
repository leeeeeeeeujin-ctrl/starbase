// Network Sync Starter (입력 → 서버 전송 → 상태 스냅샷 반영)
// 참고: src/game/network/socketioAdapter.sample.js, docs/NETWORK_ADAPTERS.md

export default function createNetSync({ network } = {}) {
  let el, canvas, ctx, running=false, raf=null;
  const state = { players: {}, me: null };
  function draw(){ const w=canvas.width,h=canvas.height; ctx.clearRect(0,0,w,h); ctx.fillStyle='#0c0c10'; ctx.fillRect(0,0,w,h); for (const id in state.players){ const p=state.players[id]; ctx.fillStyle = id===state.me ? '#ffd54f' : '#90caf9'; ctx.fillRect(p.x, p.y, 10, 10);} }
  function loop(){ if(!running) return; draw(); raf=requestAnimationFrame(loop); }
  return {
    init(container, ctxArg={}){
      el=container; canvas=document.createElement('canvas'); canvas.style.width='100%'; canvas.style.height='100%'; el.appendChild(canvas); ctx=canvas.getContext('2d'); canvas.width=el.clientWidth; canvas.height=el.clientHeight;
      state.me = ctxArg?.character?.characterId || ctxArg?.sessionId || 'me';
      if (network) {
        network.onState?.((snap)=>{ state.players = snap.players||{}; });
        network.onMessage?.((type,payload)=>{ if(type==='event'&&payload.type==='joined'){ state.players[payload.id]=payload.pos; }});
        network.connect?.();
      }
    },
    start(){ running=true; loop(); },
    stop(){ running=false; if(raf) cancelAnimationFrame(raf); raf=null; },
    dispose(){ this.stop(); if(canvas?.parentNode) canvas.parentNode.removeChild(canvas); },
    onInput(ev){ if(ev.type==='keydown'){ const dir = ev.key==='ArrowLeft'?-1:ev.key==='ArrowRight'?1:0; if (dir && network) network.send('input', { dir }); } },
  };
}

