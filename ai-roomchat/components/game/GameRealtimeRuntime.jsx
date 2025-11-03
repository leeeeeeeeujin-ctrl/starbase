"use client";

import { GameRuntimeProvider, useGameRuntime } from "./GameRuntimeProvider.jsx";
import MainGameUI from "./MainGameUI.jsx";
import GameChatPanel from "./GameChatPanel.jsx";
import CountdownNextBar from "./CountdownNextBar.jsx";
import HistoryPanel from "./HistoryPanel.jsx";
import Dummy2D from "./engines/Dummy2D.jsx";
import Dummy3D from "./engines/Dummy3D.jsx";

function useResponsiveCols() {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const onR = () => setNarrow((typeof window!=='undefined') && (window.innerWidth < 980));
    onR();
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return narrow;
}

import * as React from 'react';
import { useWorkspace } from "../workspace/CodeWorkspaceProvider.jsx";

function RuntimeLoader() {
  const { files } = useWorkspace();
  const rt = useGameRuntime();
  React.useEffect(() => {
    try {
      const graph = JSON.parse(files['/graph/prompt-graph.json']?.content || '{"nodes":[],"edges":[]}');
      const config = JSON.parse(files['/game/runtime.config.json']?.content || '{"durations":[30,60,90,120,180]}');
      const src = String(files['/game/hooks/automation.js']?.content || '');
      const hooks = transpileHooks(src);
      rt.setRuntime({ graph, hooks, config });
    } catch {}
  }, [files['/graph/prompt-graph.json']?.content, files['/game/runtime.config.json']?.content, files['/game/hooks/automation.js']?.content]);
  return null;
}

function transpileHooks(src){
  try {
    // very naive transform: remove 'export ' keywords and return known names
    const body = src.replace(/export\s+function/g, 'function');
    const fn = new Function(`${body}; return { onTurnStart: (typeof onTurnStart==='function')?onTurnStart:undefined, onUserAction: (typeof onUserAction==='function')?onUserAction:undefined, transformPrompt: (typeof transformPrompt==='function')?transformPrompt:undefined, selectNext: (typeof selectNext==='function')?selectNext:undefined };`);
    return fn() || {};
  } catch { return {}; }
}

export default function GameRealtimeRuntime({ roomId = 'local-demo', currentUser = { id:'local', role:'players' }, roles = { players:['local','ai1','ai2'], observers:[] } }){
  const narrow = useResponsiveCols();
  const cols = narrow ? '1fr' : '1.15fr 0.85fr';
  return (
    <GameRuntimeProvider roomId={roomId} roles={roles}>
      <RuntimeLoader />
      <div style={{ display:'grid', gridTemplateRows:'auto 1fr', height:'100%', gap:8 }}>
        <CountdownNextBar currentUser={currentUser} />
        <div style={{ display:'grid', gridTemplateColumns: cols, gap:8, minHeight:0 }}>
          <div style={{ display:'grid', gridTemplateRows: narrow ? 'auto auto' : '1fr 1fr', gap:8, minHeight:0 }}>
            <MainGameUI currentUser={currentUser} />
            <HistoryPanel currentUser={currentUser} />
          </div>
          <div style={{ display:'grid', gridTemplateRows: narrow ? 'auto auto' : '1fr 1fr', gap:8, minHeight:0 }}>
            <GameChatPanel currentUser={currentUser} />
            <div style={{ display:'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap:8, minHeight:0 }}>
              <Dummy2D />
              {!narrow && <Dummy3D />}
            </div>
          </div>
        </div>
      </div>
    </GameRuntimeProvider>
  );
}
