// Runtime feature selection helper.
//
// This provides a thin layer on top of meta.capabilities + workspace files,
// so PlayOverlayContent and other runtime surfaces can make consistent
// decisions about which "features" are active without duplicating logic.
//
// A "runtime feature" is a higher-level unit composed of one or more
// capability contracts (see capabilityContracts.js). For example:
//   - core.text-runtime = core.graph + core.runtimeConfig + core.hooks + ui.text

/**
 * @typedef {Object} RuntimeFeature
 * @property {string} id
 * @property {string} label
 * @property {string[]} capabilities
 * @property {string[]} requiredFiles
 */

/** @type {RuntimeFeature[]} */
export const RUNTIME_FEATURES = [
  {
    id: 'core.text-runtime',
    label: 'Core text runtime',
    capabilities: ['core.graph', 'core.runtimeConfig', 'core.hooks', 'ui.text'],
    requiredFiles: [
      '/template.json',
      '/graph/prompt-graph.json',
      '/game/runtime.config.json',
      '/game/hooks/automation.js',
    ],
  },
  {
    id: 'net.realtime-basic',
    label: 'Realtime networking (basic)',
    capabilities: ['network.realtime'],
    requiredFiles: ['/game/network.config.json'],
  },
];

/**
 * Select active runtime features and derived flags from capabilities/files.
 *
 * This is intentionally simple for now; it is meant to be the single place
 * where "core.text-runtime" and basic realtime/CRDT flags are computed.
 *
 * @param {Object} params
 * @param {string[]} [params.capabilities]
 * @param {Object<string,{content?:string}>} [params.files]
 * @param {Object} [params.config]
 */
export function selectRuntimeFeatures(params = {}) {
  const caps = Array.isArray(params.capabilities) ? params.capabilities : [];
  const capSet = new Set(caps);
  const files = params.files || {};

  /** @type {RuntimeFeature[]} */
  const features = [];

  const hasAllCaps = (need) => need.every((c) => capSet.has(c));
  const hasAllFiles = (paths) => paths.every((p) => typeof files[p]?.content === 'string');

  // Core text runtime: prefer explicit capabilities, but allow legacy
  // detection when capabilities are absent.
  const coreTextDef = RUNTIME_FEATURES[0];
  let wantsCoreText = false;
  if (coreTextDef) {
    if (hasAllCaps(coreTextDef.capabilities)) {
      wantsCoreText = true;
    } else if (capSet.size === 0 && hasAllFiles(coreTextDef.requiredFiles)) {
      // Legacy sets with the right files but no capabilities selected
      // should still behave like core.text-runtime.
      wantsCoreText = true;
    }
    if (wantsCoreText) {
      features.push(coreTextDef);
    }
  }

  // Basic realtime feature: only when capability is selected and config file exists.
  const netRealtimeDef = RUNTIME_FEATURES.find((f) => f.id === 'net.realtime-basic');
  if (netRealtimeDef && hasAllCaps(netRealtimeDef.capabilities) && hasAllFiles(netRealtimeDef.requiredFiles)) {
    features.push(netRealtimeDef);
  }

  // Derived flags used by Play overlay today.
  const flags = {
    wantsCoreTextRuntime: wantsCoreText,
    wantsRealtimeNetwork: capSet.has('network.realtime'),
    wantsSharedCrdt: capSet.has('crdt.yjs'),
  };

  return { features, flags };
}
