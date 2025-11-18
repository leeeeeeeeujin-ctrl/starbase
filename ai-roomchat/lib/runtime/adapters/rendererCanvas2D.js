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
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0,0,w,h);

    // Optional grid/tilemap rendering when state.grid is provided.
    const grid = state && state.grid;
    if (grid && grid.width && grid.height && Array.isArray(grid.layers)) {
      const tileSize = Number(grid.tileSize || 24);
      const offsetX = 10;
      const offsetY = 10;
      const maxCols = Math.min(grid.width, Math.floor((w - offsetX * 2) / tileSize));
      const maxRows = Math.min(grid.height, Math.floor((h - offsetY * 2) / tileSize));
      const layer = grid.layers[0] && Array.isArray(grid.layers[0].data) ? grid.layers[0].data : [];
      for (let y = 0; y < maxRows; y += 1) {
        const row = layer[y] || [];
        for (let x = 0; x < maxCols; x += 1) {
          const t = row[x] ?? 0;
          const walkable = !grid.tileset || !grid.tileset[t] || grid.tileset[t].walkable !== false;
          ctx.fillStyle = walkable ? '#0f172a' : '#1f2937';
          ctx.fillRect(offsetX + x * tileSize, offsetY + y * tileSize, tileSize - 1, tileSize - 1);
        }
      }
      const entities = Array.isArray(grid.entities) ? grid.entities : [];
      entities.forEach((e) => {
        const ex = Number(e.x);
        const ey = Number(e.y);
        if (Number.isNaN(ex) || Number.isNaN(ey)) return;
        ctx.fillStyle = e.kind === 'player' ? '#facc15' : '#f97316';
        const cx = offsetX + ex * tileSize + tileSize / 2;
        const cy = offsetY + ey * tileSize + tileSize / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(4, tileSize * 0.25), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#93c5fd';
      ctx.font = '12px monospace';
      ctx.fillText('Grid world preview', offsetX, offsetY + maxRows * tileSize + 16);
      return;
    }

    // Default text-only rendering.
    ctx.fillStyle = '#93c5fd';
    ctx.font = '13px monospace';
    ctx.fillText('Canvas2D ready', 10, 20);
    if (state && state.text) ctx.fillText(String(state.text), 10, 40);
  }
  function dispose(){ /* no-op */ }
  return { draw, resize, dispose };
}
