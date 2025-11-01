import React, { useEffect, useRef, useState, useMemo, memo } from 'react';

function GraphCanvas({
  nodes = [],
  edges = [],
  width = '100%',
  height = 380,
  onMoveNode,
  onSelectNode,
  selectedId,
  connectMode = false,
  onCreateEdge,
  onNodeLongPress,
  onEdgeClick,
  snap = false,
  gridSize = 20,
  onCanvasLongPress,
}) {
  const containerRef = useRef(null);
  const [drag, setDrag] = useState(null); // { id, offsetX, offsetY }
  const [panning, setPanning] = useState(false);
  const [pendingSrc, setPendingSrc] = useState(null); // node id
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 }); // pan (x,y) + zoom (k)
  const longPressRef = useRef(null);
  const gestureRef = useRef(null); // pinch/zoom state

  const nodeMap = useMemo(() => {
    const m = new Map();
    nodes.forEach(n => m.set(n.id, n));
    return m;
  }, [nodes]);

  useEffect(() => {
    let raf = null;
    let lastEvent = null;
    const tick = () => {
      raf = null;
      const e = lastEvent; if (!e) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (panning || drag || (connectMode && pendingSrc)) setMouse({ x: cx, y: cy });
      if (panning) {
        setView(v => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY }));
        return;
      }
      if (!drag) return;
      const wx = (cx - view.x) / view.k;
      const wy = (cy - view.y) / view.k;
      let x = wx - drag.offsetX;
      let y = wy - drag.offsetY;
      if (snap && gridSize > 1) {
        x = Math.round(x / gridSize) * gridSize;
        y = Math.round(y / gridSize) * gridSize;
      }
      onMoveNode?.(drag.id, { x: Math.round(x), y: Math.round(y) });
    };
    const onMove = (e) => { lastEvent = e; if (!raf) raf = requestAnimationFrame(tick); };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [drag, onMoveNode, panning, view, connectMode, pendingSrc, snap, gridSize]);

  const startDrag = (id, e) => {
    const n = nodeMap.get(id);
    if (!n) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - view.x) / view.k;
    const worldY = (mouseY - view.y) / view.k;
    const offsetX = worldX - (n.position?.x ?? 0);
    const offsetY = worldY - (n.position?.y ?? 0);
    setDrag({ id, offsetX, offsetY });
    onSelectNode?.(id);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY;
    const factor = Math.exp(delta * 0.001);
    setView(v => {
      const k = Math.min(3, Math.max(0.25, v.k * factor));
      const nx = mouseX - ((mouseX - v.x) * (k / v.k));
      const ny = mouseY - ((mouseY - v.y) * (k / v.k));
      return { x: nx, y: ny, k };
    });
  };

  const screenToWorld = (sx, sy) => ({ x: (sx - view.x) / view.k, y: (sy - view.y) / view.k });

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={(e) => {
        if (e.button === 1 || e.button === 2 || e.shiftKey) {
          setPanning(true);
        }
      }}
      onMouseUp={() => setPanning(false)}
      onTouchStart={(e) => {
        if (!containerRef.current) return;
        if (e.touches.length === 1) {
          const t = e.touches[0];
          const rect = containerRef.current.getBoundingClientRect();
          const sx = t.clientX - rect.left;
          const sy = t.clientY - rect.top;
          setMouse({ x: sx, y: sy });
          const { x, y } = screenToWorld(sx, sy);
          const hit = nodes.find(n => {
            const nx = n.position?.x ?? 0; const ny = n.position?.y ?? 0;
            return x >= nx && x <= nx + 120 && y >= ny && y <= ny + 44;
          });
          if (hit) {
            if (connectMode) {
              if (!pendingSrc) { setPendingSrc(hit.id); onSelectNode?.(hit.id); }
              else if (pendingSrc && pendingSrc !== hit.id) { onCreateEdge?.(pendingSrc, hit.id); setPendingSrc(null); }
              e.preventDefault();
              return;
            }
            const offsetX = x - (hit.position?.x ?? 0);
            const offsetY = y - (hit.position?.y ?? 0);
            setDrag({ id: hit.id, offsetX, offsetY });
            onSelectNode?.(hit.id);
            e.preventDefault();
            if (longPressRef.current) clearTimeout(longPressRef.current);
            longPressRef.current = setTimeout(() => {
              onNodeLongPress?.(hit.id, Math.round(x), Math.round(y));
            }, 600);
            return;
          }
          if (longPressRef.current) clearTimeout(longPressRef.current);
          longPressRef.current = setTimeout(() => {
            const world = screenToWorld(sx, sy);
            onCanvasLongPress?.(Math.round(world.x), Math.round(world.y));
          }, 600);
          e.preventDefault();
        } else if (e.touches.length >= 2) {
          if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
          const rect = containerRef.current.getBoundingClientRect();
          const p1 = e.touches[0]; const p2 = e.touches[1];
          const s1 = { x: p1.clientX - rect.left, y: p1.clientY - rect.top };
          const s2 = { x: p2.clientX - rect.left, y: p2.clientY - rect.top };
          const cx = (s1.x + s2.x) / 2; const cy = (s1.y + s2.y) / 2;
          const dist = Math.hypot(s2.x - s1.x, s2.y - s1.y);
          gestureRef.current = { mode: 'pinch', startK: view.k, startX: view.x, startY: view.y, startDist: dist, cx, cy };
          e.preventDefault();
        }
      }}
      onTouchMove={(e) => {
        if (!containerRef.current) return;
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
        if (e.touches.length === 1) {
          const t = e.touches[0];
          const rect = containerRef.current.getBoundingClientRect();
          const sx = t.clientX - rect.left;
          const sy = t.clientY - rect.top;
          setMouse({ x: sx, y: sy });
          if (drag) {
            const { x, y } = screenToWorld(sx, sy);
            let nx = x - drag.offsetX; let ny = y - drag.offsetY;
            if (snap && gridSize > 1) {
              nx = Math.round(nx / gridSize) * gridSize;
              ny = Math.round(ny / gridSize) * gridSize;
            }
            onMoveNode?.(drag.id, { x: Math.round(nx), y: Math.round(ny) });
          }
          e.preventDefault();
        } else if (e.touches.length >= 2) {
          const p1 = e.touches[0]; const p2 = e.touches[1];
          const rect = containerRef.current.getBoundingClientRect();
          const s1 = { x: p1.clientX - rect.left, y: p1.clientY - rect.top };
          const s2 = { x: p2.clientX - rect.left, y: p2.clientY - rect.top };
          const cx = (s1.x + s2.x) / 2; const cy = (s1.y + s2.y) / 2;
          const dist = Math.hypot(s2.x - s1.x, s2.y - s1.y);
          const g = gestureRef.current;
          if (g && g.mode === 'pinch') {
            const factor = dist / (g.startDist || 1);
            const k = Math.min(3, Math.max(0.25, (g.startK || 1) * factor));
            const nx = cx - ((cx - (g.startX || 0)) * (k / (g.startK || 1)));
            const ny = cy - ((cy - (g.startY || 0)) * (k / (g.startK || 1)));
            setView({ x: nx, y: ny, k });
          }
          e.preventDefault();
        }
      }}
      onTouchEnd={() => {
        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
        setDrag(null);
        gestureRef.current = null;
      }}
      style={{ position: 'relative', width, height, border: '1px solid #e5e5e5', borderRadius: 6, background: '#fafafa', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(#f3f4f6 1px, transparent 1px), linear-gradient(90deg, #f3f4f6 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

      <svg width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges.map(e => {
            const s = nodeMap.get(e.source);
            const t = nodeMap.get(e.target);
            if (!s || !t) return null;
            const x1 = (s.position?.x ?? 0) + 60;
            const y1 = (s.position?.y ?? 0) + 20;
            const x2 = (t.position?.x ?? 0) + 60;
            const y2 = (t.position?.y ?? 0) + 20;
            return (
              <g key={e.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9aa4b2" strokeWidth={2} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={18} onClick={() => onEdgeClick?.(e.id)} />
                {e.label ? (
                  <text x={(x1+x2)/2} y={(y1+y2)/2 - 6} textAnchor="middle" fontSize={11} fill="#666">{e.label}</text>
                ) : null}
              </g>
            );
          })}
          {connectMode && pendingSrc && (() => {
            const s = nodeMap.get(pendingSrc);
            if (!s) return null;
            const sx = (s.position?.x ?? 0) + 60;
            const sy = (s.position?.y ?? 0) + 20;
            const { x, y } = screenToWorld(mouse.x, mouse.y);
            return <line x1={sx} y1={sy} x2={x} y2={y} stroke="#60a5fa" strokeWidth={2} strokeDasharray="4 4" />
          })()}
        </g>
      </svg>

      <div style={{ position: 'absolute', transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0', willChange: 'transform' }}>
        {nodes.map(n => {
          const x = n.position?.x ?? 0;
          const y = n.position?.y ?? 0;
          const isSel = selectedId === n.id;
          return (
            <div
              key={n.id}
              onMouseDown={(e) => {
                if (connectMode) {
                  if (!pendingSrc) {
                    setPendingSrc(n.id);
                    onSelectNode?.(n.id);
                  } else if (pendingSrc && pendingSrc !== n.id) {
                    onCreateEdge?.(pendingSrc, n.id);
                    setPendingSrc(null);
                  }
                  e.stopPropagation();
                  return;
                }
                startDrag(n.id, e);
              }}
              onClick={() => onSelectNode?.(n.id)}
              style={{
                position: 'absolute', left: x, top: y, width: 120, padding: '6px 8px',
                background: isSel ? '#eef6ff' : '#ffffff', border: `2px solid ${isSel ? '#3b82f6' : '#d1d5db'}`,
                borderRadius: 8, cursor: connectMode ? 'crosshair' : 'move', userSelect: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{n.label || n.id}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{n.id}</div>
            </div>
          );
        })}
      </div>

      {connectMode && (
        <div style={{ position: 'absolute', left: 8, top: 8, background: '#111827', color:'#fff', borderRadius: 6, padding:'4px 8px', fontSize:12, opacity:0.9 }}>
          엣지 연결 모드: 노드 두 개를 차례로 클릭
        </div>
      )}
    </div>
  );
}

export default memo(GraphCanvas);
