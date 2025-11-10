export function createPathfindingEasystar(EasyStar, opts = {}){
  if (!EasyStar) return null;
  const es = new EasyStar.js();
  let grid = null;
  let usingCostGrid = false;
  return {
    setGrid(g){
      grid = Array.isArray(g) ? g : null;
      if (grid) {
        es.setGrid(grid);
        usingCostGrid = !!opts.costMode;
        // Acceptable tiles: if costMode, accept all values except blockValue
        if (usingCostGrid) {
          const blockValue = (opts.blockValue == null) ? 255 : opts.blockValue;
          const acc = new Set();
          for (let y=0;y<grid.length;y++){
            const row = grid[y]||[];
            for (let x=0;x<row.length;x++){ const v = row[x]; if (v !== blockValue) acc.add(v||0); }
          }
          es.setAcceptableTiles(Array.from(acc));
          // tile costs: value itself or provided mapping
          const costs = opts.tileCosts && typeof opts.tileCosts==='object' ? opts.tileCosts : {};
          acc.forEach((tileId) => {
            const cost = (tileId===0) ? (opts.baseCost||1) : (costs[tileId] || tileId || 1);
            try { es.setTileCost(tileId, Number(cost)||1); } catch {}
          });
        } else {
          es.setAcceptableTiles(Array.isArray(opts.acceptableTiles) ? opts.acceptableTiles : [0]);
        }
        if (opts.allowDiagonal) es.enableDiagonalMovement(); else es.disableCornerCutting();
        if (opts.tileCosts && typeof opts.tileCosts === 'object') {
          Object.entries(opts.tileCosts).forEach(([tile, cost]) => { try { es.setTileCost(Number(tile), Number(cost)); } catch {} });
        }
      }
    },
    setOptions(next){ Object.assign(opts, next||{}); if (grid) this.setGrid(grid); },
    findPath({ sx, sy, tx, ty }){
      return new Promise((resolve) => {
        if (!grid) return resolve([]);
        es.findPath(sx, sy, tx, ty, (p) => resolve(Array.isArray(p)? p.map(pt=>({x:pt.x,y:pt.y})) : []));
        // run a few iterations; in UI threads you might loop until done asynchronously
        for (let i=0;i<(opts.iterations||500);i++) es.calculate();
      });
    },
  };
}
