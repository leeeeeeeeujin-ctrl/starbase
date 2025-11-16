// Core runtime: minimal in-memory runner for
// core.graph + core.runtimeConfig + core.hooks.
//
// This is UI-agnostic and does not talk to DOM.

import { buildIndex } from './promptRunner.js';

export function createCoreRuntime({ graph, config, hooks, files }) {
  const { nodesById, outEdges } = buildIndex(graph || {});
  const cfg = config || {};
  let currentId = cfg.entryNode || null;
  let turn = 0;

  function getCurrentNode() {
    return currentId ? nodesById.get(currentId) || null : null;
  }

  function neighborsOf(id) {
    const edges = outEdges.get(id) || [];
    return edges.map((e) => ({
      id: e.target,
      label: e.label || '',
      type: (nodesById.get(e.target) || {}).type || undefined,
    }));
  }

  async function step({ reason = 'auto', input } = {}) {
    const node = getCurrentNode();
    const ctx = {
      turn,
      activeRole: cfg.roles && cfg.roles[0],
      variables: {},
      node,
      files: files || {},
      reason,
      input,
    };

    let nextId = null;
    if (hooks && typeof hooks.onUserAction === 'function' && reason === 'user_action') {
      const res = await Promise.resolve(hooks.onUserAction(ctx, input));
      if (typeof res === 'string') nextId = res;
      else if (res && typeof res === 'object' && res.next) nextId = res.next;
    }

    if (!nextId && hooks && typeof hooks.selectNext === 'function') {
      const neighbors = node ? neighborsOf(node.id) : [];
      nextId = await Promise.resolve(hooks.selectNext(ctx, neighbors));
    }

    if (!nextId && node) {
      const neighbors = neighborsOf(node.id);
      nextId = neighbors[0] && neighbors[0].id;
    }

    if (nextId && nodesById.has(nextId)) {
      currentId = nextId;
      turn += 1;
    } else {
      currentId = null;
    }

    return { current: getCurrentNode(), turn };
  }

  return {
    getCurrentNode,
    step,
  };
}

