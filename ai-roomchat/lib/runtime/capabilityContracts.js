// Capability contracts describe what a workspace set must provide
// in order to use a particular gameplay / runtime feature.
//
// This is intentionally static for now; it mirrors the high‑level
// shape documented in `ai-roomchat/docs/CAPABILITY_CONTRACTS.md`.

/**
 * @typedef {Object} CapabilityContract
 * @property {string} id                Stable capability id (e.g. "core.graph").
 * @property {string} label             Short human‑readable name.
 * @property {string} category          Grouping key ("core", "ui", "world", "network", "persistence", ...).
 * @property {string} purpose           One‑line description of what this enables.
 * @property {string[]} files           Workspace files that participate in this capability.
 * @property {string[]} hooks           Hook functions / entrypoints implemented by the workspace.
 * @property {string[]} adapters        Adapters / runtime modules on the host side.
 * @property {string[]} references      Reference engines / repos in `reference_data/**` or `/docs/**`.
 */

/** @type {CapabilityContract[]} */
const capabilityContracts = [
  {
    id: 'core.graph',
    label: 'Core: Prompt Graph',
    category: 'core',
    purpose: 'Node/edge graph that defines the main game or prompt flow.',
    files: ['/graph/prompt-graph.json'],
    hooks: [],
    adapters: ['runtime.core.graphRunner'],
    references: [
      'docs/STATE_AND_TURNS.md',
      'reference_data/prompt-graph/**',
    ],
  },
  {
    id: 'core.runtimeConfig',
    label: 'Core: Runtime Config',
    category: 'core',
    purpose: 'Entry node, turn sequencing, and role configuration.',
    files: ['/game/runtime.config.json'],
    hooks: [],
    adapters: ['runtime.core.configLoader'],
    references: [
      'docs/STATE_AND_TURNS.md',
      'docs/match-mode-structure.md',
      'docs/matchmaking-schema-reference.md',
    ],
  },
  {
    id: 'core.hooks',
    label: 'Core: Game Hooks',
    category: 'core',
    purpose: 'Custom logic hooks for transforming prompts, reacting to actions, and selecting next states.',
    files: ['/game/hooks/automation.js'],
    hooks: [
      'transformPrompt(prompt, ctx)',
      'onUserAction(action, ctx)',
      'selectNext(state, ctx)',
    ],
    adapters: ['runtime.core.hooksBridge'],
    references: ['reference_data/**/hooks/**'],
  },
  {
    id: 'ui.text',
    label: 'UI: Text / Chat',
    category: 'ui',
    purpose: 'Simple text / turn‑based UI rendered inside the main game shell.',
    files: ['/game/ui/text.config.json'],
    hooks: [],
    adapters: ['ui.text.overlay'],
    references: ['reference_data/text-ui/**'],
  },
  {
    id: 'ui.canvas2d',
    label: 'UI: Canvas 2D',
    category: 'ui',
    purpose: '2D canvas‑based rendering surface for board / arcade‑style games.',
    files: ['/game/ui/canvas2d.config.json'],
    hooks: ['renderFrame(ctx)', 'handleInput(event, ctx)'],
    adapters: ['ui.canvas2d.engine'],
    references: ['reference_data/canvas2d/**'],
  },
  {
    id: 'world.grid.tilemap',
    label: 'World: Grid / Tilemap',
    category: 'world',
    purpose: 'Grid‑based worlds defined by tilemaps (roguelike, tactics, puzzle, etc).',
    files: ['/world/tilemap.json', '/world/entities.json'],
    hooks: ['stepSimulation(dt, ctx)', 'applyAction(action, ctx)'],
    adapters: ['world.grid.engine'],
    references: ['reference_data/tilemap/**'],
  },
  {
    id: 'network.realtime',
    label: 'Network: Realtime / Rooms',
    category: 'network',
    purpose: 'Room / lobby + realtime state sync for multi‑player games.',
    files: ['/game/network.config.json'],
    hooks: ['onRoomJoin(player, ctx)', 'onRoomLeave(player, ctx)'],
    adapters: ['network.socketio', 'network.supabase.realtime'],
    references: ['reference_data/realtime/**'],
  },
  {
    id: 'crdt.yjs',
    label: 'State: CRDT / Yjs',
    category: 'state',
    purpose: 'Conflict‑free shared state using Yjs documents.',
    files: ['/state/shared.yjs.json'],
    hooks: [],
    adapters: ['state.yjs.bridge'],
    references: ['reference_data/yjs/**'],
  },
  {
    id: 'persistence.supabase',
    label: 'Persistence: Supabase',
    category: 'persistence',
    purpose: 'Persist game state and match history to Supabase tables.',
    files: ['/game/persistence.supabase.json'],
    hooks: ['mapStateToRow(state)', 'mapRowToState(row)'],
    adapters: ['persistence.supabase.client'],
    references: ['docs/matchmaking-schema-reference.md'],
  },
];

function getCapabilityContracts() {
  return capabilityContracts;
}

module.exports = {
  capabilityContracts,
  getCapabilityContracts,
};

