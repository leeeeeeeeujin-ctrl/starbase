// Minimal Canvas2D renderer adapter
export function createRendererCanvas2D(){
  let canvas = null, ctx = null;
  const sprites = new Map(); // id -> { kind:'rect'|'text', ... }
  const images = new Map(); // src -> HTMLImageElement
  let animRAF = null;
  const anims = new Map(); // id -> { src, frames:[{sx,sy,sw,sh,ms}], i, nextAt, loop, playing, x,y,w,h }
  function loadImage(src){
    return new Promise((resolve) => {
      if (images.has(src)) return resolve(images.get(src));
      const img = new Image();
      img.onload = () => { images.set(src, img); resolve(img); };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  function redraw(){
    if (!ctx || !canvas) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const [id, s] of sprites) {
      if (s.kind === 'rect') {
        ctx.fillStyle = s.color || '#60a5fa';
        ctx.fillRect(s.x|0, s.y|0, s.w|0, s.h|0);
      } else if (s.kind === 'text') {
        ctx.fillStyle = s.color || '#e2e8f0';
        ctx.font = s.font || '14px monospace';
        ctx.fillText(String(s.text||''), s.x|0, s.y|0);
      } else if (s.kind === 'image') {
        const img = images.get(s.src);
        if (img) ctx.drawImage(img, s.x|0, s.y|0, s.w|0, s.h|0);
      } else if (s.kind === 'sprite') {
        const img = images.get(s.src);
        if (img) ctx.drawImage(img, s.sx|0, s.sy|0, s.sw|0, s.sh|0, s.x|0, s.y|0, s.w|0, s.h|0);
      }
    }
  }
  function stepAnim(ts){
    let needs = false;
    anims.forEach((a, id) => {
      if (!a.playing || !a.frames || a.frames.length===0) return;
      if (a.nextAt == null) { a.nextAt = ts + (a.frames[0].ms||100); needs=true; return; }
      if (ts >= a.nextAt) {
        a.i = ((a.i||0)+1);
        if (a.i >= a.frames.length) { if (a.loop) a.i = 0; else { a.i = a.frames.length-1; a.playing=false; } }
        const f = a.frames[a.i] || a.frames[0];
        a.nextAt = ts + (f.ms||100);
        sprites.set(id, { kind:'sprite', src: a.src, x:a.x|0, y:a.y|0, w:a.w|0, h:a.h|0, sx:f.sx|0, sy:f.sy|0, sw:f.sw|0, sh:f.sh|0 });
        needs = true;
      }
    });
    if (needs) redraw();
    animRAF = window.requestAnimationFrame(stepAnim);
  }
  return {
    attach(c){ canvas = c||null; ctx = canvas ? canvas.getContext('2d') : null; redraw(); },
    addRect({ id, x=0, y=0, w=10, h=10, color }){ sprites.set(id||(`rect_${Math.random().toString(36).slice(2)}`), { kind:'rect', x,y,w,h,color }); redraw(); },
    setText({ id, x=0, y=0, text='', color, font }){ sprites.set(id||(`text_${Math.random().toString(36).slice(2)}`), { kind:'text', x,y,text,color,font }); redraw(); },
    async addImage({ id, src, x=0, y=0, w, h }){ const img = await loadImage(src); if (!img) return; const W = w||img.width, H = h||img.height; sprites.set(id||(`img_${Math.random().toString(36).slice(2)}`), { kind:'image', src, x, y, w:W, h:H }); redraw(); },
    async addSpriteFrame({ id, src, x=0, y=0, w, h, sx=0, sy=0, sw, sh }){ const img = await loadImage(src); if (!img) return; const SW = sw||img.width, SH = sh||img.height; const W = w||SW, H = h||SH; sprites.set(id||(`spr_${Math.random().toString(36).slice(2)}`), { kind:'sprite', src, x,y,w:W,h:H,sx,sy,sw:SW,sh:SH }); redraw(); },
    update(id, patch){ const s = sprites.get(id); if (!s) return; Object.assign(s, patch||{}); redraw(); },
    remove(id){ sprites.delete(id); redraw(); },
    clear(){ sprites.clear(); redraw(); },
    async addSpriteAnim({ id, src, x=0, y=0, w, h, frames=[], loop=true }){
      const img = await loadImage(src); if (!img) return; const f = frames[0] || { sx:0, sy:0, sw:img.width, sh:img.height, ms:100 };
      const W = w||f.sw, H = h||f.sh; const key = id||(`anim_${Math.random().toString(36).slice(2)}`);
      anims.set(key, { src, x,y,w:W,h:H, frames, loop, i:0, nextAt:null, playing:true });
      sprites.set(key, { kind:'sprite', src, x,y,w:W,h:H, sx:f.sx|0, sy:f.sy|0, sw:f.sw|0, sh:f.sh|0 });
      if (!animRAF && typeof window!=='undefined') animRAF = window.requestAnimationFrame(stepAnim);
      redraw();
      return key;
    },
    play(id){ const a = anims.get(id); if (a){ a.playing = true; a.nextAt=null; } },
    pause(id){ const a = anims.get(id); if (a){ a.playing = false; } },
    destroy(){ try { if (animRAF) cancelAnimationFrame(animRAF); } catch {} animRAF = null; anims.clear(); sprites.clear(); images.clear(); },
    unload(src){ images.delete(src); },
    clearCache(){ images.clear(); },
  };
}
