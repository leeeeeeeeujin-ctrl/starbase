// Core runtime: minimal in-memory runner for
// core.graph + core.runtimeConfig + core.hooks.
//
// This is UI-agnostic and does not talk to DOM.

import { buildIndex } from './promptRunner.js';
import { callHookWithTimeout } from './safeEvalHookModule.js';

export function createCoreRuntime({ graph, config, hooks, files }) {
  const { nodesById, outEdges } = buildIndex(graph || {});
  const cfg = config || {};
  let currentId = cfg.entryNode || null;
  let turn = 0;
  const variables = {};

  function getCurrentNode() {
    return currentId ? nodesById.get(currentId) || null : null;
  }

  function buildContext(reason, input) {
    return {
      turn,
      activeRole: cfg.roles && cfg.roles[0],
      variables,
      node: getCurrentNode(),
      files: files || {},
      reason,
      input,
    };
  }

  function neighborsOf(id) {
    const edges = outEdges.get(id) || [];
    return edges.map((e) => ({
      id: e.target,
      label: e.label || '',
      type: (nodesById.get(e.target) || {}).type || undefined,
    }));
  }

  function getHookTimeout() {
    const v = cfg.hookTimeoutMs || cfg.hookTimeout;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 500;
  }

  async function chooseNext(reason, input) {
    const ctx = buildContext(reason, input);
    let nextId = null;

    if (hooks && typeof hooks.onUserAction === 'function' && reason === 'user_action') {
      const res = await callHookWithTimeout(
        () => hooks.onUserAction(ctx, input),
        getHookTimeout(),
      );
      if (typeof res === 'string') nextId = res;
      else if (res && typeof res === 'object' && res.next) nextId = res.next;
    }

    if (!nextId && hooks && typeof hooks.selectNext === 'function') {
      const neighbors = ctx.node ? neighborsOf(ctx.node.id) : [];
      const chosen = await callHookWithTimeout(
        () => hooks.selectNext(ctx, neighbors),
        getHookTimeout(),
      );
      if (typeof chosen === 'string') nextId = chosen || null;
    }

    if (!nextId && ctx.node) {
      const neighbors = neighborsOf(ctx.node.id);
      nextId = neighbors[0] && neighbors[0].id;
    }

    return nextId;
  }

  async function computePrompt(reason) {
    const ctx = buildContext(reason, undefined);
    const node = ctx.node;
    if (!node) {
      return { prompt: null, ui: undefined };
    }
    const baseText = String(node.label || node.id || '');

    if (!hooks || typeof hooks.transformPrompt !== 'function') {
      return { prompt: baseText, ui: undefined };
    }

    try {
      const res = await callHookWithTimeout(
        () => hooks.transformPrompt(ctx),
        getHookTimeout(),
      );
      if (res == null) return { prompt: baseText, ui: undefined };
      if (typeof res === 'string') return { prompt: res, ui: undefined };
      if (typeof res === 'object') {
        const finalPrompt = typeof res.prompt === 'string' && res.prompt.length
          ? res.prompt
          : baseText;
        return { prompt: finalPrompt, ui: res.ui };
      }
      return { prompt: baseText, ui: undefined };
    } catch (e) {
      return {
        prompt: baseText,
        ui: { error: e?.message || String(e) },
      };
    }
  }

  async function step({ reason = 'auto', input } = {}) {
    const nextId = await chooseNext(reason, input);
    const hadNode = !!getCurrentNode();

    if (nextId && nodesById.has(nextId)) {
      currentId = nextId;
      turn += 1;
    } else if (!nextId && !hadNode) {
      // already ended; keep null
      currentId = null;
    } else if (!nextId && hadNode) {
      // no valid transition; treat as end of graph
      currentId = null;
    }

    const ctx = buildContext(reason, input);
    const { prompt, ui } = await computePrompt(reason);
    return {
      current: ctx.node,
      turn,
      prompt,
      ui,
      variables,
    };
  }

  async function getCurrentWithPrompt() {
    const ctx = buildContext('inspect', undefined);
    const { prompt, ui } = await computePrompt('inspect');
    return {
      current: ctx.node,
      turn,
      prompt,
      ui,
      variables,
    };
  }

  return {
    getCurrentNode,
    step,
    getCurrentWithPrompt,
  };
}
