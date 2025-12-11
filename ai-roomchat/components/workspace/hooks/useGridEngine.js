"use client";

import { useEffect, useRef } from 'react';

/**
 * World grid 엔진 초기화 및 관리
 * 
 * @param {Object} params
 * @param {Array} params.runtimeFeatures - 활성화된 런타임 기능들
 * @param {Object} params.files - 워크스페이스 파일들
 * @param {Object} params.bus - 이벤트 버스
 * @param {string} params.engine - 런타임 엔진 타입
 * @param {React.MutableRefObject} params.runtimeRef - Core runtime ref
 * @param {React.MutableRefObject} params.hooksRef - Runtime hooks ref
 * @returns {React.MutableRefObject} gridEngineRef
 */
export function useGridEngine({
  runtimeFeatures,
  files,
  bus,
  engine,
  runtimeRef,
  hooksRef,
}) {
  const gridEngineRef = useRef(null);

  useEffect(() => {
    const hasGridFeature = Array.isArray(runtimeFeatures)
      && runtimeFeatures.some((f) => f && f.id === 'world.grid-basic');

    if (!hasGridFeature) {
      gridEngineRef.current = null;
      return undefined;
    }

    let disposed = false;

    try {
      // Lazy require to avoid issues if the adapter is not bundled in some environments.
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const { createWorldGridEngine } = require('../../../lib/runtime/adapters/worldGridEngine.js');
      const gridEngine = createWorldGridEngine({
        files,
        bus,
        hooks: hooksRef.current || null,
      });
      gridEngineRef.current = gridEngine;

      // Link the engine to the current core runtime (if any)
      try {
        const rt = runtimeRef.current;
        if (rt && typeof rt.setWorldEngine === 'function') {
          rt.setWorldEngine(gridEngine);
        }
      } catch {
        // ignore linkage errors
      }

      // Ensure the engine also sees the latest hooks
      try {
        const hooks = hooksRef.current || null;
        if (hooks && typeof gridEngine.setHooks === 'function') {
          gridEngine.setHooks(hooks);
        }
      } catch {
        // ignore hook linkage errors
      }

      // Emit initial grid state
      try {
        const initial = gridEngine.getGrid();
        if (initial) {
          bus.emit('world:grid:state', { grid: initial });
        }
      } catch {
        // ignore publish errors
      }

      // Fallback handler for non-builtin engines
      const off = bus.on('player:chat', (payload) => {
        if (disposed || !gridEngineRef.current) return;
        if (engine === 'builtin') return; // builtin path uses coreRuntime handler instead
        try {
          const text = String(payload?.text || '');
          const action = { type: 'chat', text };
          const current = gridEngineRef.current;
          if (current && typeof current.applyAction === 'function') {
            Promise.resolve(current.applyAction(action, null)).catch(() => {});
          }
        } catch {
          // ignore movement errors
        }
      });

      return () => {
        disposed = true;
        try {
          const rt = runtimeRef.current;
          if (rt && typeof rt.setWorldEngine === 'function') {
            rt.setWorldEngine(null);
          }
        } catch {
          // ignore detach errors
        }
        gridEngineRef.current = null;
        try {
          off && off();
        } catch {
          // ignore detach errors
        }
      };
    } catch {
      gridEngineRef.current = null;
      return undefined;
    }
  }, [JSON.stringify(files), runtimeFeatures, bus, engine, runtimeRef, hooksRef]);

  return gridEngineRef;
}
