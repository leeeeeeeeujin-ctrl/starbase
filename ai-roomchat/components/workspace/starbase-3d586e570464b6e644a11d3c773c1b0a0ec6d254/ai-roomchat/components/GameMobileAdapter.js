import React, { useEffect, useState } from 'react';
import { useGameIntegration } from './GameIntegrationContext';

export default function GameMobileAdapter() {
  const gi = useGameIntegration?.();
  const [vars, setVars] = useState({});

  useEffect(() => {
    if (!gi) return;
    const cb = v => setVars(v || {});
    gi.onVariablesChanged && gi.onVariablesChanged(cb);
    // request initial snapshot
    gi.requestVariables && gi.requestVariables();
    return () => gi.offVariablesChanged && gi.offVariablesChanged(cb);
  }, [gi]);

  if (!gi) return null;

  return (
    <div style={{ padding: 12, background: '#071127', color: 'white', borderRadius: 8 }}>
      <h4 style={{ marginTop: 0 }}>Mobile Adapter</h4>
      <div style={{ fontSize: 12, marginBottom: 8 }}>Variables</div>
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
        {Object.keys(vars).length === 0 ? (
          <div style={{ opacity: 0.7 }}>No variables</div>
        ) : (
          Object.entries(vars).map(([k, v]) => (
            <div key={k} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{k}</div>
              <div style={{ fontFamily: 'monospace' }}>{String(v)}</div>
            </div>
          ))
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => gi.setVariable && gi.setVariable('mobile.ping', Date.now())}
          style={{ flex: 1, padding: 12, borderRadius: 8 }}
        >
          Ping
        </button>
        <button
          onClick={() => gi.requestVariables && gi.requestVariables()}
          style={{ flex: 1, padding: 12, borderRadius: 8 }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
