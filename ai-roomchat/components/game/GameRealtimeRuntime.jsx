"use client";

import { GameRuntimeProvider } from "./GameRuntimeProvider.jsx";
import MainGameUI from "./MainGameUI.jsx";
import GameChatPanel from "./GameChatPanel.jsx";
import CountdownNextBar from "./CountdownNextBar.jsx";
import HistoryPanel from "./HistoryPanel.jsx";
import Dummy2D from "./engines/Dummy2D.jsx";
import Dummy3D from "./engines/Dummy3D.jsx";

export default function GameRealtimeRuntime({ roomId = 'local-demo', currentUser = { id:'local', role:'players' }, roles = { players:['local','ai1','ai2'], observers:[] } }){
  return (
    <GameRuntimeProvider roomId={roomId} roles={roles}>
      <div style={{ display:'grid', gridTemplateRows:'auto 1fr', height:'100%', gap:8 }}>
        <CountdownNextBar currentUser={currentUser} />
        <div style={{ display:'grid', gridTemplateColumns:'1.15fr 0.85fr', gap:8, minHeight:0 }}>
          <div style={{ display:'grid', gridTemplateRows:'1fr 1fr', gap:8, minHeight:0 }}>
            <MainGameUI currentUser={currentUser} />
            <HistoryPanel currentUser={currentUser} />
          </div>
          <div style={{ display:'grid', gridTemplateRows:'1fr 1fr', gap:8, minHeight:0 }}>
            <GameChatPanel currentUser={currentUser} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, minHeight:0 }}>
              <Dummy2D />
              <Dummy3D />
            </div>
          </div>
        </div>
      </div>
    </GameRuntimeProvider>
  );
}

