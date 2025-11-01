import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudioTemplate as useTemplate } from '../../contexts/StudioStore';
import dynamic from 'next/dynamic';
import VirtualList from '../common/VirtualList';
import { subscribe } from '../../contexts/StudioBus';

const GraphCanvas = dynamic(() => import('./GraphCanvas'), { ssr: false });

function safeParse(jsonText) {
  try { return JSON.parse(jsonText || '{}'); } catch { return {}; }
}

export default function NodesEditor() {
  const { templateText, setTemplateText } = useTemplate();
  const tpl = useMemo(() => safeParse(templateText), [templateText]);
  const nodes = Array.isArray(tpl.nodes) ? tpl.nodes : [];
  const edges = Array.isArray(tpl.edges) ? tpl.edges : [];
  const [selectedId, setSelectedId] = useState(nodes[0]?.id ?? null);
  const commitRef = useRef(null);
  const [connectMode, setConnectMode] = useState(false);
  const [snap, setSnap] = useState(true);
  const [gridSize, setGridSize] = useState(20);
  const [nodeMenu, setNodeMenu] = useState({ open: false, id: null });
  const [edgeMenu, setEdgeMenu] = useState({ open: false, id: null });
  const [tempLabel, setTempLabel] = useState('');

  const commit = (nextObj) => {
    if (commitRef.current) clearTimeout(commitRef.current);
    commitRef.current = setTimeout(() => setTemplateText(JSON.stringify(nextObj, null, 2)), 150);
  };

  const setNodes = (nextNodes) => {
    const next = { ...tpl, nodes: nextNodes };
    commit(next);
  };

  const setEdges = (nextEdges) => {
    const next = { ...tpl, edges: nextEdges };
    commit(next);
  };

  const addNode = () => {
    const id = `node_${Math.random().toString(36).slice(2,8)}`;
    const next = [...nodes, { id, label: 'New Node', position: { x: 0, y: 0 }, data: {} }];
    setNodes(next);
    setSelectedId(id);
  };

  const removeNode = (id) => {
    const idx = nodes.findIndex(n => n.id === id);
    if (idx === -1) return;
    const next = nodes.filter(n => n.id !== id);
    setNodes(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const updateNode = (id, patch) => {
    const next = nodes.map(n => n.id === id ? { ...n, ...patch } : n);
    setNodes(next);
  };

  const updatePosition = (id, xy) => {
    const next = nodes.map(n => n.id === id ? { ...n, position: { ...(n.position||{}), ...xy } } : n);
    setNodes(next);
  };

  const addEdge = () => {
    const src = nodes[0]?.id; const dst = nodes[1]?.id;
    if (!src || !dst) return;
    const id = `edge_${Math.random().toString(36).slice(2,8)}`;
    setEdges([ ...edges, { id, source: src, target: dst, label: '' } ]);
  };

  const removeEdge = (id) => setEdges(edges.filter(e => e.id !== id));
  const updateEdge = (id, patch) => setEdges(edges.map(e => e.id === id ? { ...e, ...patch } : e));

  const duplicateNode = (id) => {
    const target = nodes.find(n => n.id === id);
    if (!target) return;
    const nid = `${id}_copy`;
    const pos = { x: (target.position?.x ?? 0) + 24, y: (target.position?.y ?? 0) + 24 };
    setNodes([...nodes, { ...target, id: nid, label: target.label ? `${target.label} copy` : nid, position: pos }]);
    setSelectedId(nid);
  };

  useEffect(() => {
    const off = subscribe('studio:focus', (it) => {
      if (!it) return;
      if (it.type === 'node') {
        const n = nodes[it.index] || nodes.find(x => x.id === it.id);
        if (n) setSelectedId(n.id);
      } else if (it.type === 'edge') {
        const e = edges[it.index] || edges.find(x => x.id === it.id);
        if (e) { setEdgeMenu({ open: true, id: e.id }); setTempLabel(e.label || ''); }
      }
    });
    return () => off?.();
  }, [nodes, edges]);

  // persist prefs
  useEffect(() => {
    try {
      const raw = localStorage.getItem('studio.nodes.prefs');
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.connectMode === 'boolean') setConnectMode(p.connectMode);
        if (typeof p.snap === 'boolean') setSnap(p.snap);
        if (typeof p.gridSize === 'number') setGridSize(p.gridSize);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('studio.nodes.prefs', JSON.stringify({ connectMode, snap, gridSize })); } catch {}
  }, [connectMode, snap, gridSize]);

  const selected = nodes.find(n => n.id === selectedId) || null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%' }}>
      <div style={{ borderRight: '1px solid #eee', padding: 12, overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems:'center' }}>
          <button onClick={addNode}>+ Add Node</button>
          <button onClick={() => selected && removeNode(selected.id)} disabled={!selected}>Remove</button>
          <span style={{ flex:1 }} />
          <label style={{ fontSize:12 }}>
            <input type="checkbox" checked={connectMode} onChange={e => setConnectMode(e.target.checked)} /> Connect edges
          </label>
          <label style={{ fontSize:12, marginLeft:8 }}>
            <input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> Snap
          </label>
          <input type="number" min={4} step={2} value={gridSize} onChange={e => setGridSize(parseInt(e.target.value||'20',10))} style={{ width:64 }} />
        </div>
        <div>
          {nodes.length === 0 && <div style={{ color: '#666' }}>No nodes. Click "+ Add Node".</div>}
          {nodes.length > 0 && (
            <VirtualList
              count={nodes.length}
              itemHeight={56}
              height={260}
              renderItem={(i) => {
                const n = nodes[i];
                return (
                  <div style={{ padding: 8, marginBottom: 6, border: '1px solid #ddd', borderRadius: 6, background: selectedId===n.id?'#f5f9ff':'#fff', cursor:'pointer' }} onClick={() => setSelectedId(n.id)}>
                    <div style={{ fontWeight: 600 }}>{n.label || n.id}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{n.id}</div>
                  </div>
                );
              }}
            />
          )}
        </div>

        <div style={{ height: 16 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={addEdge} disabled={nodes.length < 2}>+ Add Edge</button>
        </div>
        <div>
          {edges.length === 0 && <div style={{ color:'#666' }}>No edges.</div>}
          {edges.length > 0 && (
            <VirtualList
              count={edges.length}
              itemHeight={86}
              height={240}
              renderItem={(i) => {
                const e = edges[i];
                return (
                  <div key={e.id} style={{ padding: 8, marginBottom: 6, border: '1px solid #ddd', borderRadius: 6, background:'#fff' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap: 8, alignItems:'center' }}>
                      <select value={e.source} onChange={ev => updateEdge(e.id, { source: ev.target.value })}>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.label||n.id}</option>)}
                      </select>
                      <select value={e.target} onChange={ev => updateEdge(e.id, { target: ev.target.value })}>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.label||n.id}</option>)}
                      </select>
                      <button onClick={() => removeEdge(e.id)}>Remove</button>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <input placeholder="label" value={e.label||''} onChange={ev => updateEdge(e.id, { label: ev.target.value })} style={{ width:'100%' }} />
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>
      <div style={{ padding: 16, overflow: 'auto' }}>
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          selectedId={selectedId}
          onMoveNode={(id, xy) => updatePosition(id, xy)}
          onSelectNode={(id) => setSelectedId(id)}
          connectMode={connectMode}
          onCreateEdge={(src, dst) => {
            const id = `edge_${Math.random().toString(36).slice(2,8)}`;
            setEdges([ ...edges, { id, source: src, target: dst, label: '' } ]);
          }}
          onCanvasLongPress={(x, y) => {
            const id = `node_${Math.random().toString(36).slice(2,8)}`;
            setNodes([...nodes, { id, label: 'New', position: { x, y }, data: {} }]);
            setSelectedId(id);
          }}
          onNodeLongPress={(id) => {
            const node = nodes.find(n => n.id === id);
            setTempLabel(node?.label || '');
            setNodeMenu({ open: true, id });
          }}
          onEdgeClick={(id) => {
            const edge = edges.find(e => e.id === id);
            setTempLabel(edge?.label || '');
            setEdgeMenu({ open: true, id });
          }}
          snap={snap}
          gridSize={gridSize}
          height={420}
        />
        <div style={{ height: 12 }} />
        {!selected && <div style={{ color: '#666' }}>Select a node to edit.</div>}
        {selected && (
          <div style={{ display: 'grid', gap: 12, maxWidth: 800 }}>
            <div>
              <label>ID</label>
              <input value={selected.id} readOnly style={{ width: '100%' }} />
            </div>
            <div>
              <label>Label</label>
              <input
                value={selected.label || ''}
                onChange={e => updateNode(selected.id, { label: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label>Pos X</label>
                <input type="number" value={selected.position?.x ?? 0} onChange={e => updatePosition(selected.id, { x: Number(e.target.value) })} style={{ width: '100%' }} />
              </div>
              <div>
                <label>Pos Y</label>
                <input type="number" value={selected.position?.y ?? 0} onChange={e => updatePosition(selected.id, { y: Number(e.target.value) })} style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <label>Data (JSON)</label>
              <textarea
                rows={10}
                value={JSON.stringify(selected.data ?? {}, null, 2)}
                onChange={e => {
                  try {
                    const data = JSON.parse(e.target.value || '{}');
                    updateNode(selected.id, { data });
                  } catch {}
                }}
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
            </div>
          </div>
        )}
        {nodeMenu.open && (
          <div style={{ position:'fixed', left: 12, bottom: 12, right: 12, background:'#fff', border:'1px solid #ddd', borderRadius:8, boxShadow:'0 8px 28px rgba(0,0,0,0.15)', padding:12 }}>
            <div style={{ fontWeight:600, marginBottom:8 }}>Node actions</div>
            <div style={{ display:'grid', gap:8 }}>
              <label>Label</label>
              <input value={tempLabel} onChange={e => setTempLabel(e.target.value)} />
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => { updateNode(nodeMenu.id, { label: tempLabel }); setNodeMenu({ open:false, id:null }); }}>이름 변경</button>
                <button onClick={() => { duplicateNode(nodeMenu.id); setNodeMenu({ open:false, id:null }); }}>복제</button>
                <button onClick={() => { removeNode(nodeMenu.id); setNodeMenu({ open:false, id:null }); }}>삭제</button>
                <span style={{ flex:1 }} />
                <button onClick={() => setNodeMenu({ open:false, id:null })}>닫기</button>
              </div>
            </div>
          </div>
        )}

        {edgeMenu.open && (
          <div style={{ position:'fixed', left: 12, bottom: 12, right: 12, background:'#fff', border:'1px solid #ddd', borderRadius:8, boxShadow:'0 8px 28px rgba(0,0,0,0.15)', padding:12 }}>
            <div style={{ fontWeight:600, marginBottom:8 }}>Edge actions</div>
            <div style={{ display:'grid', gap:8 }}>
              <label>Label</label>
              <input value={tempLabel} onChange={e => setTempLabel(e.target.value)} />
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => { updateEdge(edgeMenu.id, { label: tempLabel }); setEdgeMenu({ open:false, id:null }); }}>라벨 변경</button>
                <button onClick={() => { removeEdge(edgeMenu.id); setEdgeMenu({ open:false, id:null }); }}>삭제</button>
                <span style={{ flex:1 }} />
                <button onClick={() => setEdgeMenu({ open:false, id:null })}>닫기</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
