// Renderer Canvas2D Adapter (contract skeleton)

/**
 * @typedef {{
 *  draw: (state: any) => void,
 *  resize?: (w:number,h:number)=>void,
 *  dispose?: ()=>void,
 * }} Canvas2DRenderer
 */

/**
 * Attach a Canvas2D renderer to the given canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{ dpr?: number }} [options]
 * @returns {Canvas2DRenderer}
 */
export function attachCanvas2D(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Number(options.dpr || (typeof window!=='undefined'?window.devicePixelRatio:1)) || 1;
  function resize(w, h){
    canvas.width = Math.floor(w*dpr);
    canvas.height = Math.floor(h*dpr);
    canvas.style.width = w+'px';
    canvas.style.height = h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function draw(state){
    const w = canvas.clientWidth || 400;
    const h = canvas.clientHeight || 300;
    resize(w,h);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#93c5fd'; ctx.font = '13px monospace';
    ctx.fillText('Canvas2D ready', 10, 20);
    if (state && state.text) ctx.fillText(String(state.text), 10, 40);
  }
  function dispose(){ /* no-op */ }
  return { draw, resize, dispose };
}

