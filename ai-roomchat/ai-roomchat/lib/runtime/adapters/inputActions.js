// Input Actions Adapter
// Maps keyboard (and later gamepad/touch) to logical actions/axes from /game/input/actions.json

export function createInputActions(){
  let cfg = { version:1, actions:{}, axes:{} };
  const actionHandlers = new Map(); // name -> Set(handler)
  const axisHandlers = new Map();   // name -> Set(handler)
  let running = false;
  const keysDown = new Set();
  const btnState = new Map(); // `${pad}:${btn}` -> boolean
  let raf = null;
  // touch axes (very simple virtual joystick)
  let touchId = null, touchStart = null;

  function emitAction(name, state){
    const set = actionHandlers.get(name); if (!set) return;
    set.forEach(fn => { try { fn(state); } catch {} });
  }
  function emitAxis(name, value){
    const set = axisHandlers.get(name); if (!set) return;
    set.forEach(fn => { try { fn(value); } catch {} });
  }

  function recomputeAxes(){
    Object.entries(cfg.axes||{}).forEach(([name, ax]) => {
      const neg = (ax.keysNegative||[]).some(k => keysDown.has(k)) ? -1 : 0;
      const pos = (ax.keysPositive||[]).some(k => keysDown.has(k)) ? 1 : 0;
      let v = (neg + pos); // -1,0,1
      try {
        const dz = typeof ax.deadzone === 'number' ? ax.deadzone : 0.15;
        if (typeof ax.gamepadAxis === 'number'){
          const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
          for (const p of pads){ if (!p) continue; const av = p.axes?.[ax.gamepadAxis] || 0; if (Math.abs(av) > dz) { v = Math.abs(v) > Math.abs(av) ? v : av; } }
        }
      } catch {}
      emitAxis(name, v);
    });
  }

  function onKey(e, down){
    const code = e.code || e.key || '';
    if (!code) return;
    if (down) keysDown.add(code); else keysDown.delete(code);
    // actions
    Object.entries(cfg.actions||{}).forEach(([name, a]) => {
      const codes = a.keys || [];
      if (codes.includes(code)) emitAction(name, { down, code });
    });
    // axes
    recomputeAxes();
  }

  return {
    loadConfigFromFiles(files){
      try {
        const json = files?.['/game/input/actions.json']?.content;
        if (json) cfg = JSON.parse(String(json));
      } catch { cfg = { version:1, actions:{}, axes:{} }; }
    },
    onAction(name, handler){
      const set = actionHandlers.get(name) || new Set(); set.add(handler); actionHandlers.set(name, set);
      return () => { try { set.delete(handler); } catch {} };
    },
    onAxis(name, handler){
      const set = axisHandlers.get(name) || new Set(); set.add(handler); axisHandlers.set(name, set);
      return () => { try { set.delete(handler); } catch {} };
    },
    start(){
      if (running) return; running = true;
      try {
        window.addEventListener('keydown', (this._down = (e)=>onKey(e,true)));
        window.addEventListener('keyup',   (this._up   = (e)=>onKey(e,false)));
        const loop = () => {
          try {
            const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
            // actions from buttons
            Object.entries(cfg.actions||{}).forEach(([name, a]) => {
              (a.gamepad||[]).forEach((btnIdx) => {
                for (let pi=0; pi<pads.length; pi++){
                  const p = pads[pi]; if (!p) continue; const pressed = !!(p.buttons?.[btnIdx]?.pressed);
                  const key = `${pi}:${btnIdx}`; const prev = btnState.get(key) || false;
                  if (pressed !== prev) { btnState.set(key, pressed); emitAction(name, { down: pressed, pad: pi, button: btnIdx }); }
                }
              });
            });
            // axes recompute with pad input
            recomputeAxes();
          } catch {}
          raf = window.requestAnimationFrame(loop);
        };
        raf = window.requestAnimationFrame(loop);
        // touch to axes (moveX/moveY)
        const onTS = (e) => { try { const t = e.changedTouches?.[0]; if (!t) return; if (touchId==null){ touchId = t.identifier; touchStart = { x:t.clientX, y:t.clientY }; } } catch {} };
        const onTM = (e) => { try { if (touchId==null) return; const t = Array.from(e.touches||[]).find(tt=>tt.identifier===touchId); if (!t) return; const dx = (t.clientX - touchStart.x); const dy = (t.clientY - touchStart.y); const norm = (v)=>Math.max(-1, Math.min(1, v/80)); const vx = norm(dx), vy = norm(dy);
          if ((cfg.axes||{}).moveX) emitAxis('moveX', vx); if ((cfg.axes||{}).moveY) emitAxis('moveY', vy);
        } catch {} };
        const onTE = () => { try { touchId=null; touchStart=null; if ((cfg.axes||{}).moveX) emitAxis('moveX', 0); if ((cfg.axes||{}).moveY) emitAxis('moveY', 0); } catch {} };
        window.addEventListener('touchstart', (this._ts=onTS), { passive:true });
        window.addEventListener('touchmove',  (this._tm=onTM), { passive:true });
        window.addEventListener('touchend',   (this._te=onTE), { passive:true });
      } catch {}
    },
    stop(){
      if (!running) return; running = false;
      try { window.removeEventListener('keydown', this._down); } catch {}
      try { window.removeEventListener('keyup', this._up); } catch {}
      keysDown.clear();
      try { if (raf) cancelAnimationFrame(raf); } catch {}
      try { window.removeEventListener('touchstart', this._ts); window.removeEventListener('touchmove', this._tm); window.removeEventListener('touchend', this._te); } catch {}
    },
  };
}
