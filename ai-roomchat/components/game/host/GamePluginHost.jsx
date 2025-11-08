import React from "react";
import exampleAdapterFactory from "../../../lib/game/adapters/exampleAdapter.js";
import useGameInput from "../../../lib/game/input/useGameInput.js";

// Host that mounts a user-supplied GameAdapter into a container.
// Props:
// - adapterFactory: () => GameAdapter (optional; falls back to example adapter)
// - options: adapter init options
// - ctx: { sessionId, gameId, character, network, emit }
// - style / className forwarded to container

export default function GamePluginHost({ adapterFactory, options, ctx, style, className }) {
  const containerRef = React.useRef(null);
  const adapterRef = React.useRef(null);
  useGameInput(adapterRef, containerRef);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const factory = typeof adapterFactory === "function" ? adapterFactory : exampleAdapterFactory;
    // Support factory that accepts options and returns the impl object
    const adapter = factory(options);
    adapterRef.current = adapter;
    try { adapter.init(container, ctx || {}); } catch {}
    let started = false;
    try { adapter.start(); started = true; } catch {}
    const onResize = () => { try { adapter.resize?.(); } catch {} };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      try { if (started) adapter.stop(); } catch {}
      try { adapter.dispose(); } catch {}
      adapterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapterFactory]);

  return <div ref={containerRef} className={className} style={{ position: "relative", width: "100%", height: "100%", ...style }} />;
}
