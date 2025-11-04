"use client";

export default function UISchemaRenderer({ schema, onEvent }){
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
        return <img src={node.src} alt={node.alt||''} style={{ maxWidth:'100%', borderRadius: node.radius??8, border: node.border? '1px solid #334155':'none' }} />;
      case 'spacer':
        return <div style={{ height: node.size||8 }} />;
      case 'card':
        return <div style={{ border:'1px solid #25314a', borderRadius:12, background:'rgba(2,6,23,0.5)', padding: node.padding??10 }}>{(node.children||[]).map((c,i)=>(<div key={i}>{renderNode(c)}</div>))}</div>;
      default:
        if (Array.isArray(node)) return <>{node.map((c,i)=>(<div key={i}>{renderNode(c)}</div>))}</>;
        if (typeof node === 'string') return <div style={{ whiteSpace:'pre-wrap', color:'#e2e8f0' }}>{node}</div>;
        return <div style={{ color:'#94a3b8', fontSize:12 }}>unknown: {String(node?.type||'')}</div>;
    }
  };
  return <div>{renderNode(schema)}</div>;
}

