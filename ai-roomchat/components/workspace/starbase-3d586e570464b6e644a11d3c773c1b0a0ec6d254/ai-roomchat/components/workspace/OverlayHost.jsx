"use client";

import { useEffect, useState } from 'react';
import AICodeChatPanel from './AICodeChatPanel.jsx';
import CodeEditorOverlayV2 from './CodeEditorOverlayV2.jsx';

export default function OverlayHost() {
  const [overlay, setOverlay] = useState(null); // { type: 'ai'|'code', props: {} }

  useEffect(() => {
    function onOpen(e) {
      try {
        const detail = e?.detail || {};
        const type = detail.type;
        if (type !== 'ai' && type !== 'code') return;
        setOverlay({ type, props: detail.props || {} });
      } catch {}
    }
    function onClose() { setOverlay(null); }
    window.addEventListener('overlay:open', onOpen);
    window.addEventListener('overlay:close', onClose);
    return () => {
      window.removeEventListener('overlay:open', onOpen);
      window.removeEventListener('overlay:close', onClose);
    };
  }, []);

  if (!overlay) return null;
  const common = { onClose: () => setOverlay(null) };
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1600, pointerEvents:'none' }}>
      <div style={{ position:'absolute', right:16, bottom:16, width:420, height:360, pointerEvents:'auto' }}>
        {overlay.type === 'ai' ? (
          <AICodeChatPanel {...common} {...overlay.props} />
        ) : overlay.type === 'code' ? (
          <CodeEditorOverlayV2 {...overlay.props} onRequestClose={() => setOverlay(null)} />
        ) : null}
      </div>
    </div>
  );
}

