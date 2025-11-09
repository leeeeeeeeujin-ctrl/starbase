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
  const [error, setError] = React.useState(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  useGameInput(adapterRef, containerRef);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const factory = typeof adapterFactory === "function" ? adapterFactory : exampleAdapterFactory;
    // Support factory that accepts options and returns the impl object
    let adapter;
    try {
      adapter = factory(options);
      if (!adapter || typeof adapter.init !== 'function') throw new Error('Invalid GameAdapter');
    } catch (e) {
      setError(e);
      return () => {};
    }
    adapterRef.current = adapter;
    try { adapter.init(container, ctx || {}); } catch (e) { setError(e); }
    let started = false;
    try { adapter.start(); started = true; } catch (e) { setError(e); }
    const onResize = () => { try { adapter.resize?.(); } catch {} };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      try { if (started) adapter.stop(); } catch {}
      try { adapter.dispose(); } catch {}
      adapterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapterFactory, reloadKey]);

  return (
    <div ref={containerRef} className={className} style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      {error && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', color:'#fff', zIndex:30 }}>
          <div style={{ maxWidth: 520, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Game Adapter Error</div>
            <div style={{ whiteSpace:'pre-wrap', fontFamily:'monospace', fontSize:12, opacity:0.9 }}>{String(error)}</div>
            <button style={{ marginTop:12, padding:'8px 12px', background:'#3a6df0', color:'#fff', border:'none' }} onClick={() => {
              setError(null);
              setReloadKey((k) => k + 1);
            }}>다시 시도</button>
          </div>
        </div>
      )}
    </div>
  );
}
