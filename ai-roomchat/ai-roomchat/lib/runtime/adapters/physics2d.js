// Lightweight 2D collision contract (AABB + optional tile grid)
export function createPhysics2D(){
  const colliders = new Map(); // id -> { x,y,w,h }
  let grid = null; // [[0/1]]
  // spatial hash (broad-phase)
  let cell = 64; // px
  const buckets = new Map(); // key -> Set(id)
  const keyOf = (x,y)=>`${Math.floor(x/cell)}:${Math.floor(y/cell)}`;
  const put = (id, a) => {
    const keys = new Set([
      keyOf(a.x,a.y), keyOf(a.x+a.w,a.y), keyOf(a.x,a.y+a.h), keyOf(a.x+a.w,a.y+a.h)
    ]);
    keys.forEach(k => { const s=buckets.get(k)||new Set(); s.add(id); buckets.set(k,s); });
  };
  const removeFromBuckets = (id) => { buckets.forEach(s => s.delete(id)); };
  return {
    setCellSize(px){ cell = Math.max(8, px|0); },
    addCollider(id, aabb){ colliders.set(id, { ...aabb }); removeFromBuckets(id); put(id, aabb); },
    updateCollider(id, patch){ const a = colliders.get(id); if (!a) return; const next = { ...a, ...(patch||{}) }; colliders.set(id, next); removeFromBuckets(id); put(id, next); },
    removeCollider(id){ colliders.delete(id); removeFromBuckets(id); },
    addColliders(list = [], pfx = 'obj_'){ Array.isArray(list) && list.forEach((a,i)=>{ const id = `${pfx}${i}`; colliders.set(id, { ...a }); removeFromBuckets(id); put(id, a); }); },
    setCollisionGrid(g){ grid = Array.isArray(g) ? g : null; },
    queryOverlap(box){
      const res = [];
      const guess = new Set();
      // candidate ids from buckets
      const ks = new Set([ keyOf(box.x,box.y), keyOf(box.x+box.w,box.y), keyOf(box.x,box.y+box.h), keyOf(box.x+box.w,box.y+box.h) ]);
      ks.forEach(k => { const s=buckets.get(k); if (s) s.forEach(id=>guess.add(id)); });
      guess.forEach(id => {
        const b = colliders.get(id);
        if (b && box && (box.x < b.x + b.w) && (box.x + box.w > b.x) && (box.y < b.y + b.h) && (box.y + box.h > b.y)) res.push(id);
      });
      return res;
    },
    isBlockedCell(x, y){
      try { return grid && grid[y] && grid[y][x] === 1; } catch { return false; }
    },
    // Simple tile-grid sliding for axis-aligned boxes; assumes 1 unit == 1 tile.
    slideBoxOnGrid(box, dx, dy){
      const out = { ...box };
      const w = (grid && grid[0]) ? grid[0].length : 0;
      const h = grid ? grid.length : 0;
      const collide = (bx) => {
        // Sample corners to cells
        const xs = [Math.floor(bx.x), Math.floor(bx.x + bx.w - 1e-3)];
        const ys = [Math.floor(bx.y), Math.floor(bx.y + bx.h - 1e-3)];
        for (const yy of ys){ for (const xx of xs){ if (xx<0||yy<0||xx>=w||yy>=h) return true; if (grid[yy][xx]===1) return true; } }
        return false;
      };
      // X axis
      if (dx){
        out.x += dx;
        if (collide(out)){
          // step back to edge
          const step = Math.sign(dx);
          while (collide(out)) { out.x -= (step*0.01); if (Math.abs(out.x - box.x) > Math.abs(dx)) break; }
        }
      }
      // Y axis
      if (dy){
        out.y += dy;
        if (collide(out)){
          const step = Math.sign(dy);
          while (collide(out)) { out.y -= (step*0.01); if (Math.abs(out.y - box.y) > Math.abs(dy)) break; }
        }
      }
      return out;
    }
  };
}
