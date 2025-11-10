"use client";

export default function UISchemaRenderer({ schema, onEvent, resolveAsset }){
  if (!schema) return null;
  const renderNode = (node) => {
    if (!node) return null;
    const t = (node.type||'').toLowerCase();
  switch (t) {
      case 'vstack':
        return <div style={{ display:'grid', gap: node.gap??8 }}>{(node.children||[]).map((c,i)=>(<div key={i}>{renderNode(c)}</div>))}</div>;
      case 'hstack':
        return <div style={{ display:'flex', gap: node.gap??8 }}>{(node.children||[]).map((c,i)=>(<div key={i} style={{ flex: c.flex? `0 0 ${c.flex}`:'none' }}>{renderNode(c)}</div>))}</div>;
      case 'text':
        return <div style={{ color: node.color||'#e2e8f0', fontSize: node.fontSize||14, fontWeight: node.bold?700:500 }}>{node.value||''}</div>;
      case 'button':
        return <button onClick={()=>onEvent?.(node.event||node.id||'click', node.payload||{})} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>{node.label||'Button'}</button>;
      case 'image':
        return <img src={resolveAsset? resolveAsset(node.src) : node.src} alt={node.alt||''} style={{ maxWidth:'100%', borderRadius: node.radius??8, border: node.border? '1px solid #334155':'none' }} />;
      case 'spacer':
        return <div style={{ height: node.size||8 }} />;
      case 'card':
        return <div style={{ border:'1px solid #25314a', borderRadius:12, background:'rgba(2,6,23,0.5)', padding: node.padding??10 }}>{(node.children||[]).map((c,i)=>(<div key={i}>{renderNode(c)}</div>))}</div>;
      case 'canvas': {
        const ref = { current: null };
        // Note: use inline effect via ref callback to notify mount with the element
        const cb = (el) => {
          ref.current = el;
          try { if (el && typeof onEvent === 'function') onEvent(node.eventMount || 'canvasMount', { id: node.id, canvas: el }); } catch {}
        };
        const w = node.width||320, h = node.height||200;
        const style = { display:'block', width:w, height:h, background: node.background||'#0b1220', border:'1px solid #334155', borderRadius:8 };
        return <canvas ref={cb} width={w} height={h} style={style} />;
      }
      case 'number': {
        const v = (typeof node.value === 'number') ? node.value : (Number(node.value) || 0);
        const step = (typeof node.step === 'number') ? node.step : 1;
        const min = (typeof node.min === 'number') ? node.min : undefined;
        const max = (typeof node.max === 'number') ? node.max : undefined;
        return (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {node.label ? <div style={{ color:'#cbd5e1', fontSize:13 }}>{node.label}</div> : null}
            <input type="number" value={v}
              onChange={(e)=>{ const val = Number(e.target.value); onEvent?.(node.event||'change', { id: node.id, value: val }); }}
              step={step} min={min} max={max}
              style={{ width: 100, padding:'6px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
          </div>
        );
      }
      case 'table': {
        const cols = Array.isArray(node.columns) ? node.columns : [];
        const rows = Array.isArray(node.data) ? node.data : [];
        const onRow = (row, idx) => onEvent?.(node.event||'rowClick', { id: node.id, row, index: idx });
        return (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {cols.map((c,i)=>(<th key={i} style={{ textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #334155', color:'#93c5fd', fontWeight:600 }}>{c.label || c.key}</th>))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r,ri)=>(
                  <tr key={ri} onClick={()=>onRow(r,ri)} style={{ cursor: node.event ? 'pointer':'default' }}>
                    {cols.map((c,ci)=>(
                      <td key={ci} style={{ padding:'6px 8px', borderBottom:'1px solid #25314a', color:'#e2e8f0' }}>{String(r?.[c.key] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      default:
        if (Array.isArray(node)) return <>{node.map((c,i)=>(<div key={i}>{renderNode(c)}</div>))}</>;
        if (typeof node === 'string') return <div style={{ whiteSpace:'pre-wrap', color:'#e2e8f0' }}>{node}</div>;
        return <div style={{ color:'#94a3b8', fontSize:12 }}>unknown: {String(node?.type||'')}</div>;
    }
  };
  return <div>{renderNode(schema)}</div>;
}
