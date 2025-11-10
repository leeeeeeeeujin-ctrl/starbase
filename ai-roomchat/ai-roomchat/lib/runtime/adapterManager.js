// Dynamic adapter loader with CDN fallbacks. Uses webpackIgnore to avoid bundling.

const CDN = {
  'renderer:pixi': 'https://cdn.jsdelivr.net/npm/pixi.js@7.4.0/dist/pixi.min.mjs',
  'pathfinding:easystar': 'https://cdn.jsdelivr.net/npm/easystarjs@0.4.4/bin/easystar-0.4.4.min.js',
  'net:socketio': 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js',
  // You can extend here: three, colyseus, yjs, etc.
};

async function dyn(url){
  // note: most ESM CDNs work with webpackIgnore
  return import(/* webpackIgnore: true */ url);
}

export async function loadAdapter(name, options = {}){
  switch (name) {
    case 'renderer:pixi': {
      const mod = await dyn(CDN['renderer:pixi']);
      const PIXI = mod?.default || mod;
      const { createRendererPixi } = await import('./adapters/rendererPixi.js');
      return createRendererPixi(PIXI);
    }
    case 'pathfinding:easystar': {
      // easystar UMD exposes EasyStar as global in some builds; try both
      let EasyStar = null;
      try { const mod = await dyn(CDN['pathfinding:easystar']); EasyStar = mod?.EasyStar || mod?.default || (globalThis && globalThis.EasyStar); } catch {}
      if (!EasyStar && typeof window !== 'undefined') EasyStar = window.EasyStar;
      const { createPathfindingEasystar } = await import('./adapters/pathfindingEasystar.js');
      return createPathfindingEasystar(EasyStar, options);
    }
    case 'net:socketio': {
      const mod = await dyn(CDN['net:socketio']);
      const io = mod?.io || mod?.default?.io || mod?.default;
      const { createNetSocketIO } = await import('./adapters/netSocketIO.js');
      return createNetSocketIO(io, options);
    }
    default:
      throw new Error(`Unknown adapter: ${name}`);
  }
}

