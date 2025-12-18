// Core runtime: minimal in-memory runner for
// core.graph + core.runtimeConfig + core.hooks.
//
// This is UI-agnostic and does not talk to DOM, but it does take care of
// keeping a few standard data slots (특히 stats.turn) 정리해 둔다.

import { buildIndex } from './promptRunner.js';
import { callHookWithTimeout } from './safeEvalHookModule.js';
import { buildInitialGridState } from './adapters/worldGridEngine.js';
import { updateStandardSlots } from './standardSlots.js';

export function createCoreRuntime({ graph, config, hooks, files, initialVariables }) {
  const { nodesById, outEdges } = buildIndex(graph || {});
  const cfg = config || {};
  let currentId = cfg.entryNode || null;
  if (!currentId || !nodesById.has(currentId)) {
    // entryNode가 비어 있거나 그래프에 존재하지 않으면
    // 첫 번째 노드를 안전한 기본값(fallback)으로 사용한다.
    // 
    // 주의: 이 fallback은 안전장치일 뿐이며,
    // maker graph sync가 정상 작동하면 항상 유효한 entryNode가 제공되어야 한다.
    // (syncPromptGraphToVfs가 시작 슬롯을 entryNode로 설정함)
    const first = nodesById.keys().next();
    currentId = first && !first.done ? first.value : null;
    if (currentId && process.env.NODE_ENV !== 'production') {
      console.warn(
        '[coreRuntime] entryNode missing or invalid, using fallback node:',
        currentId
      );
    }
  }
  let turn = 0;
  const variables =
    initialVariables && typeof initialVariables === 'object'
      ? JSON.parse(JSON.stringify(initialVariables))
      : {};

  // Optional world/grid engine that can provide a live grid state.
  // When present, ctx.world will reflect the engine's current grid state.
  let worldEngine = null;

  // Lazy world/grid context, derived either from the world engine (when set)
  // or from workspace files as a fallback. This is read-only from the
  // runtime's point of view; hooks are expected to treat it as a snapshot.
  let worldCtx = null;
  let worldInitialized = false;

  function getWorldContext() {
    try {
      let grid = null;
      if (worldEngine && typeof worldEngine.getGrid === 'function') {
        // When a live world engine is attached, always read the latest grid
        // state instead of caching, so ctx.world stays in sync with gameplay.
        grid = worldEngine.getGrid();
      } else {
        if (worldInitialized) return worldCtx;
        worldInitialized = true;
        grid = buildInitialGridState(files || {});
      }
      if (!grid) {
        worldCtx = null;
        return worldCtx;
      }
      const tilemap = {
        width: grid.width,
        height: grid.height,
        tileSize: grid.tileSize,
        layers: grid.layers,
        tileset: grid.tileset,
      };
      const entities = Array.isArray(grid.entities) ? grid.entities : [];
      worldCtx = {
        grid,
        tilemap,
        entities,
      };
    } catch {
      worldCtx = null;
    }
    return worldCtx;
  }

  function setWorldEngine(engine) {
    worldEngine = engine || null;
    // Invalidate any cached snapshot so the next read reflects the new source.
    worldCtx = null;
    worldInitialized = false;
  }

  function getCurrentNode() {
    return currentId ? nodesById.get(currentId) || null : null;
  }

  function buildContext(reason, input) {
    const ctx = {
      turn,
      activeRole: cfg.roles && cfg.roles[0],
      variables,
      node: getCurrentNode(),
      files: files || {},
      world: getWorldContext(),
      reason,
      input,
    };

    // 표준 데이터 슬롯(stats / scene / effects / speaker) 중에서
    // 최소한 stats.turn 은 런타임에서 일관되게 채워 둔다.
    // (hooks나 호스트 코드가 updateStandardSlots를 여러 번 호출해도 안전하다.)
    try {
      updateStandardSlots(ctx, {
        stats: { turn },
      });
    } catch {
      // 표준 슬롯 업데이트 실패는 게임 진행을 막지 않는다.
    }

    return ctx;
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
    const v = cfg.hookTimeoutMs ?? cfg.hookTimeout;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    // 기본값:
    // - 텍스트 런타임/AI 판정 훅(onUserAction/transformPrompt 등)이
    //   외부 API를 호출할 수 있으므로, 500ms 수준의 타임아웃은 너무 공격적이다.
    // - 별도 설정이 없을 때는 여유 있는 15초를 기본으로 사용한다.
    return 15000;
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
    const isNewNode = nextId && nodesById.has(nextId) && currentId !== nextId;

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

    // 새 노드 진입 시 onTurnStart 훅 호출
    if (isNewNode && hooks && typeof hooks.onTurnStart === 'function') {
      try {
        await hooks.onTurnStart(ctx);
      } catch (e) {
        console.warn('[coreRuntime] onTurnStart error:', e);
      }
    }

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

  function getContextSnapshot(reason = 'inspect', input) {
    return buildContext(reason, input);
  }

  return {
    getCurrentNode,
    step,
    getCurrentWithPrompt,
    setWorldEngine,
    getContextSnapshot,
  };
}
