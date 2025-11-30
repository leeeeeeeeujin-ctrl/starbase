// World grid engine adapter (basic)
//
// This module provides a minimal, host-side "engine" for the
// `world.grid.tilemap` capability. It is intentionally small:
// - buildInitialGridState(files): derives an in-memory grid state from
//   `/world/tilemap.json` and `/world/entities.json`.
// - movePlayerOnGrid(grid, dir): returns a new grid state with the player
//   moved one tile in the requested direction, if walkable.
// - createWorldGridEngine({ files, bus, hooks }): convenience wrapper that
//   keeps the grid state in memory, can emit `world:grid:state` updates,
//   and optionally delegates to world/grid hooks (stepSimulation/applyAction)
//   when provided.

/**
 * @typedef {Object} GridEntity
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {string} kind
 * @property {string|undefined} skin
 * @property {string|undefined} label
 */

/**
 * @typedef {Object} GridState
 * @property {number} width
 * @property {number} height
 * @property {number} tileSize
 * @property {Array<{ data: number[][] }>} layers
 * @property {Record<string, { walkable?: boolean }>} tileset
 * @property {GridEntity[]} entities
 */

/**
 * Build initial grid state from workspace files.
 * Expects `/world/tilemap.json` and `/world/entities.json` to be present
 * in the `files` map with a `content` field.
 *
 * @param {Object<string,{content?:string}>} files
 * @returns {GridState|null}
 */
export function buildInitialGridState(files) {
  try {
    const tilemapText = files?.['/world/tilemap.json']?.content;
    const entitiesText = files?.['/world/entities.json']?.content;
    if (!tilemapText || !entitiesText) return null;
    const tilemap = JSON.parse(tilemapText);
    const entitiesObj = JSON.parse(entitiesText);
    const entities = Object.values(entitiesObj || {}).map((ent) => ({
      id: ent.id || '',
      x: ent.x ?? 0,
      y: ent.y ?? 0,
      kind: ent.kind || 'entity',
      skin: typeof ent.skin === 'string' ? ent.skin : undefined,
      label: typeof ent.label === 'string' ? ent.label : undefined,
    }));
    const layers = Array.isArray(tilemap.layers) ? tilemap.layers : [];
    const tileset =
      tilemap.tileset && typeof tilemap.tileset === 'object' ? tilemap.tileset : {};
    return {
      width: tilemap.width || 0,
      height: tilemap.height || 0,
      tileSize: tilemap.tileSize || 24,
      layers,
      tileset,
      entities,
    };
  } catch {
    return null;
  }
}

/**
 * Move the first player entity on the grid by one tile, if possible.
 *
 * @param {GridState|null} grid
 * @param {'up'|'down'|'left'|'right'} dir
 * @returns {GridState|null}
 */
export function movePlayerOnGrid(grid, dir) {
  if (!grid) return grid;
  const width = grid.width || 0;
  const height = grid.height || 0;
  const layers = Array.isArray(grid.layers) ? grid.layers : [];
  const layer = layers[0] && Array.isArray(layers[0].data) ? layers[0].data : [];
  const tileset = grid.tileset || {};
  const entities = Array.isArray(grid.entities)
    ? grid.entities.map((e) => ({ ...e }))
    : [];
  const playerIndex = entities.findIndex(
    (e) => e.kind === 'player' || e.id === 'player',
  );
  if (playerIndex < 0) return grid;
  const player = entities[playerIndex];
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (nx < 0 || ny < 0 || nx >= width || ny >= height) return grid;
  const row = layer[ny] || [];
  const t = row[nx] ?? 0;
  const tile = tileset[t] || {};
  const walkable = tile.walkable !== false;
  if (!walkable) return grid;
  player.x = nx;
  player.y = ny;
  return {
    ...grid,
    entities,
  };
}

/**
 * Create a minimal grid engine over the given files.
 * The engine keeps state in memory and can emit `world:grid:state` updates
 * on the provided bus when moves occur. When hooks are supplied, it can also
 * delegate simulation and action application to workspace-defined logic.
 *
 * @param {{
 *   files?: Object<string,{content?:string}>,
 *   bus?: { emit?: (event:string,payload:any)=>void },
 *   hooks?: {
 *     stepSimulation?: (dt:number, ctx:any) => any|Promise<any>,
 *     applyAction?: (action:any, ctx:any) => any|Promise<any>
 *   }
 * }} [options]
 */
export function createWorldGridEngine(options = {}) {
  const { files = {}, bus = null, hooks = null } = options;
  let grid = buildInitialGridState(files);
  let hookFns = hooks && typeof hooks === 'object' ? hooks : null;

  const publish = () => {
    if (!bus || typeof bus.emit !== 'function') return;
    try {
      bus.emit('world:grid:state', { grid });
    } catch {
      // ignore bus errors
    }
  };

  return {
    getGrid() {
      return grid;
    },
    setGrid(next) {
      grid = next || null;
      publish();
    },
    movePlayer(dir) {
      grid = movePlayerOnGrid(grid, dir);
      publish();
    },
    /**
     * Apply a high-level action to the grid. When hooks.applyAction is
     * present, it is given the first chance to handle the action. If it
     * returns an object containing a `grid` or `entities` field, the engine
     * updates its internal state accordingly. Otherwise, a basic fallback
     * interprets the action as a directional move and calls movePlayerOnGrid.
     *
     * @param {any} action
     * @param {any} ctx
     */
    async applyAction(action, ctx) {
      const h = hookFns && typeof hookFns.applyAction === 'function'
        ? hookFns.applyAction
        : null;

      if (h) {
        try {
          const result = await Promise.resolve(h(action, ctx || {}));
          if (result && typeof result === 'object') {
            if (result.grid) {
              grid = result.grid;
              publish();
              return;
            }
            if (Array.isArray(result.entities)) {
              grid = { ...(grid || {}), entities: result.entities };
              publish();
              return;
            }
          }
        } catch {
          // Ignore hook errors and fall back to default behaviour
        }
      }

      // Fallback: treat the action as a directional move.
      if (!action || typeof action !== 'object') return;
      let dir = action.dir || action.direction || null;
      if (!dir && typeof action.text === 'string') {
        const text = action.text.toLowerCase();
        if (text.includes('위') || text.includes('up')) dir = 'up';
        else if (text.includes('아래') || text.includes('down')) dir = 'down';
        else if (text.includes('왼') || text.includes('left')) dir = 'left';
        else if (text.includes('오른') || text.includes('right')) dir = 'right';
      }
      if (dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right') {
        grid = movePlayerOnGrid(grid, dir);
        publish();
      }
    },
    /**
     * Advance simulation by dt. When hooks.stepSimulation is present, it
     * receives the current dt and ctx. If it returns an object containing a
     * `grid` or `entities` field, the engine updates its state and publishes
     * the result.
     *
     * @param {number} dt
     * @param {any} ctx
     */
    async step(dt = 1, ctx) {
      const h = hookFns && typeof hookFns.stepSimulation === 'function'
        ? hookFns.stepSimulation
        : null;
      if (!h) return;
      try {
        const result = await Promise.resolve(h(dt, ctx || {}));
        if (result && typeof result === 'object') {
          if (result.grid) {
            grid = result.grid;
          } else if (Array.isArray(result.entities)) {
            grid = { ...(grid || {}), entities: result.entities };
          }
          publish();
        }
      } catch {
        // Ignore hook errors for now
      }
    },
    /**
     * Update the hook set used by this engine. This is useful when the
     * host reloads /game/hooks/automation.js and wants the engine to use
     * the new implementations without recreating the entire engine.
     *
     * @param {any} nextHooks
     */
    setHooks(nextHooks) {
      hookFns = nextHooks && typeof nextHooks === 'object' ? nextHooks : null;
    },
  };
}
