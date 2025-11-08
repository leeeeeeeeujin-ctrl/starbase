import React from "react";
import GamePluginHost from "../host/GamePluginHost.jsx";
import userAdapterFactory from "../../../src/game/index.js";

// Minimal slot component for DynamicSlot mapping.
// Accepts props.slotConfig to pass adapterFactory/options.

export default function GameCanvasSlot({ slotConfig = {}, sessionId, gameId, character, network, onEvent }) {
  const { adapterFactory, options } = slotConfig;
  const factory = adapterFactory || userAdapterFactory; // prefer user adapter when provided
  const ctx = React.useMemo(() => ({ sessionId, gameId, character, network, emit: onEvent }), [gameId, onEvent, sessionId, character, network]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <GamePluginHost adapterFactory={factory} options={options} ctx={ctx} />
    </div>
  );
}
