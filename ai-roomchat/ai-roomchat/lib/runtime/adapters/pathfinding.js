// Grid-based pathfinding contract (interface compatible with easystar style)
export function createPathfinding(){
  let grid = null; // [[0/1]] 0=walkable,1=blocked
  const dirs = [ [1,0],[-1,0],[0,1],[0,-1] ];
  return {
    setGrid(g){ grid = Array.isArray(g) ? g : null; },
    findPath({ sx, sy, tx, ty }){
      if (!grid) return [];
      const h = grid.length, w = grid[0]?.length || 0;
      const inb = (x,y)=>x>=0&&y>=0&&x<w&&y<h;
      const key = (x,y)=>x+","+y;
      const q = [[sx,sy]]; const prev = new Map(); const seen = new Set([key(sx,sy)]);
      while (q.length){
        const [x,y] = q.shift();
        if (x===tx && y===ty) break;
        for (const [dx,dy] of dirs){
          const nx=x+dx, ny=y+dy;
          if (!inb(nx,ny) || grid[ny][nx]===1) continue;
          const k=key(nx,ny); if (seen.has(k)) continue;
          seen.add(k); prev.set(k, [x,y]); q.push([nx,ny]);
        }
      }
      // reconstruct
      const out=[]; let cx=tx, cy=ty; const ks=key(cx,cy);
      if (!prev.has(ks) && !(sx===tx && sy===ty)) return [];
      while (!(cx===sx && cy===sy)) { out.push({x:cx,y:cy}); const p=prev.get(key(cx,cy)); if (!p) break; [cx,cy]=p; }
      out.push({x:sx,y:sy}); out.reverse();
      return out;
    }
  };
}

