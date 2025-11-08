import React from "react";
import GamePluginHost from "../host/GamePluginHost.jsx";
import userAdapterFactory from "../../../src/game/index.js";

// Minimal slot component for DynamicSlot mapping.
// Accepts props.slotConfig to pass adapterFactory/options.

export default function GameCanvasSlot({ slotConfig = {}, sessionId, gameId, character, network, onEvent, useRuntimeLoader = false }) {
  const { adapterFactory, options } = slotConfig;
  const [runtimeFactory, setRuntimeFactory] = React.useState(null);
  const [runtimeUrl, setRuntimeUrl] = React.useState(null);
  const factory = (useRuntimeLoader && runtimeFactory) || adapterFactory || userAdapterFactory; // prefer runtime > provided > user
  const ctx = React.useMemo(() => ({ sessionId, gameId, character, network, emit: onEvent }), [gameId, onEvent, sessionId, character, network]);
  // Load runtime factory from user module endpoint if enabled
  React.useEffect(() => {
    if (!useRuntimeLoader) return;
    let revoked = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/workspace/user-module');
        if (!res.ok) throw new Error('fetch user-module failed');
        const text = await res.text();
        const blob = new Blob([text], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        revoked = url;
        const mod = await import(/* webpackIgnore: true */ url);
        if (cancelled) return;
        const f = mod && (mod.default || mod.createAdapter || mod.adapter);
        if (typeof f === 'function') {
          setRuntimeFactory(() => f);
          setRuntimeUrl(url);
        }
      } catch (e) {
        console.warn('runtime loader failed', e);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [useRuntimeLoader]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <GamePluginHost adapterFactory={factory} options={options} ctx={ctx} />
    </div>
  );
}
