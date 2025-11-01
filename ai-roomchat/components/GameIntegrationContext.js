import React, { createContext, useContext, useRef } from 'react';

const GameIntegrationContext = createContext(null);

function createEmitter() {
  const listeners = {};
  return {
    on(event, cb) {
      if (!listeners[event]) listeners[event] = new Set();
      listeners[event].add(cb);
      return () => listeners[event] && listeners[event].delete(cb);
    },
    off(event, cb) {
      listeners[event] && listeners[event].delete(cb);
    },
    emit(event, data) {
      if (!listeners[event]) return;
      listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          // swallow handler errors to avoid breaking the emitter
          // handlers should manage their own errors
          // but log for debugging
          // eslint-disable-next-line no-console
          console.error('[GameIntegration] handler error', err);
        }
      });
    },
  };
}

export function GameIntegrationProvider({ children }) {
  const emitterRef = useRef(null);
  if (!emitterRef.current) emitterRef.current = createEmitter();

  const api = {
    // simple run event (text/result payload)
    sendRunToGame: run => emitterRef.current.emit('run', run),
    onRun: cb => emitterRef.current.on('run', cb),
    offRun: cb => emitterRef.current.off('run', cb),

    // structured commands for editor->game control (add/update/execute nodes, variables)
    // Validate commands to reduce attack surface. Only allow known commands and limit payload size.
    sendCommand: (command, payload) => {
      const allowed = new Set([
        'addNode',
        'updateNode',
        'executeNode',
        'setVariable',
        'setVariables',
        'getVariables',
      ]);
      const cmd = String(command || '');
      if (!allowed.has(cmd)) {
        // eslint-disable-next-line no-console
        console.warn('[GameIntegration] rejected unknown command', cmd);
        return false;
      }
      try {
        // very small safeguard: limit payload JSON size to 8KB
        const s = JSON.stringify(payload || {});
        const max = 8 * 1024; // 8 KB
        if (s.length > max) {
          // eslint-disable-next-line no-console
          console.warn('[GameIntegration] rejected oversized command payload', cmd, s.length);
          return false;
        }
      } catch (e) {
        return false;
      }

      return emitterRef.current.emit('command', { command: cmd, payload });
    },
    onCommand: cb => emitterRef.current.on('command', cb),
    offCommand: cb => emitterRef.current.off('command', cb),
    // variable convenience helpers
    setVariable: (key, value) => api.sendCommand('setVariable', { key, value }),
    setVariables: obj => api.sendCommand('setVariables', { variables: obj }),
    // request current variables snapshot from authoritative game instance
    requestVariables: () => api.sendCommand('getVariables', {}),
    // subscribe to variables change notifications
    onVariablesChanged: cb => emitterRef.current.on('variablesChanged', cb),
    offVariablesChanged: cb => emitterRef.current.off('variablesChanged', cb),
    // used by authoritative instance (game) to broadcast variable updates
    emitVariablesChanged: vars => emitterRef.current.emit('variablesChanged', vars),
  };

  return <GameIntegrationContext.Provider value={api}>{children}</GameIntegrationContext.Provider>;
}

export function useGameIntegration() {
  return useContext(GameIntegrationContext);
}

export default GameIntegrationContext;
