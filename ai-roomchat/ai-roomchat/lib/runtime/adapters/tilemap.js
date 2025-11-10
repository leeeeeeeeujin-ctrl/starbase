// Minimal tilemap loader for grid-based maps
export function createTilemap(){
  let map = null; // { type:'grid', width,height, tiles:[[...]] } or Tiled JSON
  let collisionGrid = null;
  function isTiled(m){ return !!(m && Array.isArray(m.layers) && typeof m.width === 'number' && typeof m.height === 'number'); }
  function buildCollisionFromTiled(m){
    try {
      const w = m.width|0, h = m.height|0; const grid = Array.from({length:h},()=>Array.from({length:w},()=>0));
      const layers = (m.layers||[]).filter(l => l?.type === 'tilelayer' && (l?.properties||[]).some(p => p.name==='collision' && p.value===true));
      if (!layers.length) return null;
      for (const layer of layers){
        const data = layer.data||[];
        for (let y=0;y<h;y++){
          for (let x=0;x<w;x++){
            const gid = data[y*w + x]||0; if (gid) grid[y][x] = 1;
          }
        }
      }
      return grid;
    } catch { return null; }
  }
  function buildCostGridFromTiled(m){
    try {
      const w = m.width|0, h = m.height|0; const grid = Array.from({length:h},()=>Array.from({length:w},()=>0));
      // collision layers mark as blocked (255)
      const blockLayers = (m.layers||[]).filter(l => l?.type==='tilelayer' && (l?.properties||[]).some(p=>p.name==='collision'&&p.value===true));
      for (const layer of blockLayers){ const data=layer.data||[]; for (let y=0;y<h;y++){ for (let x=0;x<w;x++){ const gid=data[y*w+x]||0; if (gid) grid[y][x]=255; } } }
      // cost layers: property cost=number; add onto cells if not blocked
      const costLayers = (m.layers||[]).filter(l => l?.type==='tilelayer' && (l?.properties||[]).some(p=>p.name==='cost'));
      for (const layer of costLayers){
        const costProp = (layer.properties||[]).find(p=>p.name==='cost');
        const add = Number(costProp?.value)||1;
        const data=layer.data||[]; for (let y=0;y<h;y++){ for (let x=0;x<w;x++){ const gid=data[y*w+x]||0; if (gid && grid[y][x]!==255){ const prev=grid[y][x]||0; grid[y][x] = prev + add; } } }
      }
      // normalize: 0 -> 0 (base cost), >0 -> that number (cost), 255 blocked stays 255
      return grid;
    } catch { return null; }
  }
  return {
    load(json){
      map = json && typeof json === 'object' ? json : null; 
      if (!map) return false;
      if (isTiled(map)) {
        collisionGrid = buildCollisionFromTiled(map);
        this._costGrid = buildCostGridFromTiled(map);
      } else {
        collisionGrid = Array.isArray(map.tiles) ? map.tiles : null;
        this._costGrid = null;
      }
      return true;
    },
    // Extract rectangle object colliders from Tiled object layers
    extractObjectColliders(){
      try {
        if (!isTiled(map)) return [];
        const out = [];
        for (const layer of (map.layers||[])){
          if (layer.type !== 'objectgroup') continue;
          const layerIsCollision = (layer.properties||[]).some(p => p.name==='collision' && p.value===true);
          for (const obj of (layer.objects||[])){
            const objIsCollision = (obj.properties||[]).some(p => p.name==='collision' && p.value===true);
            if (!(layerIsCollision || objIsCollision)) continue;
            if (obj.ellipse || obj.polygon || obj.polyline) continue; // not supported in minimal adapter
            const x = (obj.x||0)/ (map.tilewidth||1);
            const y = (obj.y||0)/ (map.tileheight||1);
            const w = (obj.width||0)/ (map.tilewidth||1);
            const h = (obj.height||0)/ (map.tileheight||1);
            if (w > 0 && h > 0) out.push({ x, y, w, h });
          }
        }
        return out;
      } catch { return []; }
    },
    // Approximate polygons and ellipses to AABB rectangles for quick blocking
    extractApproximateAABBs(){
      try {
        if (!isTiled(map)) return [];
        const out = [];
        for (const layer of (map.layers||[])){
          if (layer.type !== 'objectgroup') continue;
          const layerIsCollision = (layer.properties||[]).some(p => p.name==='collision' && p.value===true);
          for (const obj of (layer.objects||[])){
            const objIsCollision = (obj.properties||[]).some(p => p.name==='collision' && p.value===true);
            if (!(layerIsCollision || objIsCollision)) continue;
            const tw = map.tilewidth||1, th = map.tileheight||1;
            if (obj.polygon && Array.isArray(obj.polygon)){
              const xs = obj.polygon.map(p=>p.x||0), ys = obj.polygon.map(p=>p.y||0);
              const minx = Math.min(...xs), maxx = Math.max(...xs);
              const miny = Math.min(...ys), maxy = Math.max(...ys);
              const x = (obj.x + minx)/tw, y = (obj.y + miny)/th;
              const w = (maxx-minx)/tw, h = (maxy-miny)/th;
              if (w>0 && h>0) out.push({ x,y,w,h });
              continue;
            }
            if (obj.ellipse){
              const x = (obj.x||0)/tw, y=(obj.y||0)/th, w=(obj.width||0)/tw, h=(obj.height||0)/th;
              if (w>0 && h>0) out.push({ x,y,w,h });
              continue;
            }
            if (obj.polyline && Array.isArray(obj.polyline)){
              const xs = obj.polyline.map(p=>p.x||0), ys = obj.polyline.map(p=>p.y||0);
              const minx = Math.min(...xs), maxx = Math.max(...xs);
              const miny = Math.min(...ys), maxy = Math.max(...ys);
              const x = (obj.x + minx)/tw, y = (obj.y + miny)/th;
              const w = (maxx-minx)/tw, h = (maxy-miny)/th;
              if (w>0 && h>0) out.push({ x,y,w,h });
              continue;
            }
            // default rect (rotation ignored for AABB)
            const x = (obj.x||0)/tw, y=(obj.y||0)/th, w=(obj.width||0)/tw, h=(obj.height||0)/th;
            if (w>0 && h>0) out.push({ x,y,w,h });
          }
        }
        return out;
      } catch { return []; }
    },
    getGrid(){
      if (!map) return null;
      if (isTiled(map)) return collisionGrid;
      return Array.isArray(map.tiles) ? map.tiles : null;
    },
    getSize(){
      if (!map) return { width:0, height:0 };
      if (isTiled(map)) return { width: map.width|0, height: map.height|0 };
      return { width: map.width|0, height: map.height|0 };
    },
    getCostGrid(){ return this._costGrid || null; },
    getLayer(name){
      if (!isTiled(map)) return null;
      const l = (map.layers||[]).find(l => l.name === name);
      return l || null;
    },
    findLayerByProp(propName, propValue=true){
      if (!isTiled(map)) return null;
      return (map.layers||[]).find(l => (l.properties||[]).some(p => p.name===propName && p.value===propValue)) || null;
    },
    getTileAt(layerNameOrGrid, x, y){
      try {
        if (typeof layerNameOrGrid === 'string' && isTiled(map)){
          const l = this.getLayer(layerNameOrGrid); if (!l || l.type!=='tilelayer') return 0;
          const w = map.width|0; const idx = y*w + x; return l.data?.[idx] || 0;
        }
        const g = Array.isArray(layerNameOrGrid) ? layerNameOrGrid : collisionGrid; if (!g) return 0;
        return g?.[y]?.[x] || 0;
      } catch { return 0; }
    },
  };
}
