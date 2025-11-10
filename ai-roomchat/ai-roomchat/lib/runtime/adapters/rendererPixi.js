export function createRendererPixi(PIXI){
  if (!PIXI) return null;
  let app = null;
  const nodes = new Map(); // id -> displayObject
  return {
    attach(canvas){
      if (!canvas) return;
      const w = canvas.width || 800, h = canvas.height || 600;
      app = new PIXI.Application({ view: canvas, width: w, height: h, backgroundAlpha: 0, antialias: true });
    },
    addSprite({ id, texture, x=0, y=0, anchor=0.5 }){
      if (!app) return;
      const tex = texture ? PIXI.Texture.from(texture) : PIXI.Texture.WHITE;
      const spr = new PIXI.Sprite(tex);
      spr.x = x; spr.y = y; spr.anchor.set(anchor);
      app.stage.addChild(spr); nodes.set(id||(`spr_${Math.random().toString(36).slice(2)}`), spr);
    },
    setText({ id, text='', x=0, y=0, style={} }){
      if (!app) return;
      const t = new PIXI.Text({ text: String(text), style: new PIXI.TextStyle(style) });
      t.x = x; t.y = y; app.stage.addChild(t); nodes.set(id||(`txt_${Math.random().toString(36).slice(2)}`), t);
    },
    update(id, patch){ const n = nodes.get(id); if (!n) return; Object.assign(n, patch||{}); },
    remove(id){ const n = nodes.get(id); if (!n||!app) return; try{ app.stage.removeChild(n); }catch{} nodes.delete(id); },
    clear(){ if (!app) return; app.stage.removeChildren(); nodes.clear(); },
    get app(){ return app; }
  };
}

