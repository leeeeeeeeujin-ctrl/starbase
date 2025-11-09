import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { GameIntegrationProvider, useGameIntegration } from '../../components/GameIntegrationContext';

// Simple authoritative game component that listens for editor commands and maintains variables
function AuthoritativeGame() {
  const api = useGameIntegration();

  useEffect(() => {
    if (!api) return;
    const unsub = api.onCommand(({ command, payload }) => {
      try {
        if (command === 'setVariable') {
          const { key, value } = payload || {};
          const newVars = { ...(api._internalVars || {}), [key]: value };
          api._internalVars = newVars;
          api.emitVariablesChanged && api.emitVariablesChanged(newVars);
        } else if (command === 'setVariables') {
          const { variables } = payload || {};
          const newVars = { ...(api._internalVars || {}), ...(variables || {}) };
          api._internalVars = newVars;
          api.emitVariablesChanged && api.emitVariablesChanged(newVars);
        } else if (command === 'getVariables') {
          api.emitVariablesChanged && api.emitVariablesChanged({ ...(api._internalVars || {}) });
        }
      } catch (e) {
        // swallow
      }
    });

    // ensure initial snapshot broadcast
    try {
      api._internalVars = api._internalVars || {};
      api.emitVariablesChanged && api.emitVariablesChanged({ ...(api._internalVars || {}) });
    } catch (e) {}

    return () => unsub && unsub();
  }, [api]);

  return null;
}

function Listener({ onVars }) {
  const api = useGameIntegration();
  useEffect(() => {
    if (!api) return;
    const cb = v => onVars(v);
    api.onVariablesChanged && api.onVariablesChanged(cb);
    // request snapshot
    api.requestVariables && api.requestVariables();
    return () => api.offVariablesChanged && api.offVariablesChanged(cb);
  }, [api, onVars]);
  return null;
}

function EditorSim({ keyName, value }) {
  const api = useGameIntegration();
  useEffect(() => {
    if (!api) return;
    // send setVariable after mount
    try {
      api.setVariable && api.setVariable(keyName, value);
    } catch (e) {}
  }, [api, keyName, value]);
  return null;
}

test('editor setVariable -> authoritative game updates variables -> listener receives snapshot', async () => {
  const received = [];
  function onVars(v) {
    received.push(v);
  }

  await act(async () => {
    render(
      <GameIntegrationProvider>
        <AuthoritativeGame />
        <Listener onVars={onVars} />
        <EditorSim keyName={'testKey'} value={'testValue'} />
      </GameIntegrationProvider>
    );
  });

  // allow async microtasks to run
  await act(async () => {
    await Promise.resolve();
  });

  // Listener should have been called at least once with the snapshot including our key
  const found = received.some(s => s && s.testKey === 'testValue');
  expect(found).toBe(true);
});
