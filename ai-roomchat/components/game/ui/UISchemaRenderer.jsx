"use client";

import { applyShellStyleProps } from '../uiShellStyle';

export default function UISchemaRenderer({ schema, onEvent, resolveAsset }){
  if (!schema) return null;
  const renderNode = (node) => {
    if (!node) return null;
    const t = (node.type||'').toLowerCase();
    const tokenStyle = applyShellStyleProps(node.styleProps || node.style || {});
    switch (t) {
      case 'vstack': {
        const style = { display:'grid', gap: node.gap??8, ...tokenStyle };
        return <div style={style}>{(node.children||[]).map((c,i)=>(<div key={i}>{renderNode(c)}</div>))}</div>;
      }
      case 'hstack': {
        const style = { display:'flex', gap: node.gap??8, ...tokenStyle };
        return <div style={style}>{(node.children||[]).map((c,i)=>(<div key={i} style={{ flex: c.flex? `0 0 ${c.flex}`:'none' }}>{renderNode(c)}</div>))}</div>;
      }
      case 'text': {
        const style = {
          color: node.color||'#e2e8f0',
          fontSize: node.fontSize||14,
          fontWeight: node.bold?700:500,
          ...tokenStyle,
        };
        return <div style={style}>{node.value||''}</div>;
      }
      case 'button': {
        const style = {
          padding:'8px 12px',
          borderRadius:8,
          border:'1px solid #334155',
          background:'#0b1220',
          color:'#e2e8f0',
          ...tokenStyle,
        };
        return (
          <button
            onClick={()=>onEvent?.(node.event||node.id||'click', node.payload||{})}
            style={style}
          >
            {node.label||'Button'}
          </button>
        );
      }
      case 'input': {
        const placeholder = node.placeholder || '';
        const name = node.name || node.id || 'input';
        return (
          <input
            defaultValue={node.value||''}
            placeholder={placeholder}
            onChange={(e)=>onEvent?.(node.event||'input', { name, value: e.target.value })}
            style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', width: node.width||'100%', ...tokenStyle }}
          />
        );
      }
      case 'textarea': {
        const placeholder = node.placeholder || '';
        const name = node.name || node.id || 'textarea';
        return (
          <textarea
            rows={node.rows||4}
            defaultValue={node.value||''}
            placeholder={placeholder}
            onChange={(e)=>onEvent?.(node.event||'input', { name, value: e.target.value })}
            style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', width: node.width||'100%', ...tokenStyle }}
          />
        );
      }
      case 'toggle': {
        const name = node.name || node.id || 'toggle';
        return (
          <label style={{ display:'inline-flex', alignItems:'center', gap:8, color:'#e2e8f0' }}>
            <input type="checkbox" defaultChecked={!!node.value} onChange={(e)=>onEvent?.(node.event||'toggle', { name, value: !!e.target.checked })} />
            <span>{node.label||name}</span>
          </label>
        );
      }
      case 'select': {
        const name = node.name || node.id || 'select';
        const opts = Array.isArray(node.options) ? node.options : [];
        return (
          <select defaultValue={node.value} onChange={(e)=>onEvent?.(node.event||'select', { name, value: e.target.value })} style={{ padding:'6px 8px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>
            {opts.map((o,i)=> <option key={i} value={typeof o==='object'?o.value:o}>{typeof o==='object'? (o.label||o.value) : o}</option>)}
          </select>
        );
      }
      case 'list': {
        const items = Array.isArray(node.items) ? node.items : [];
        return (
          <ul style={{ margin:0, paddingLeft:18, ...tokenStyle }}>
            {items.map((it,i)=> <li key={i} style={{ color:'#e2e8f0' }}>{renderNode(it)}</li>)}
          </ul>
        );
      }
      case 'grid': {
        const cols = Math.max(1, Number(node.cols||2));
        return (
          <div style={{ display:'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: node.gap??8, ...tokenStyle }}>
            {(node.children||[]).map((c,i)=>(<div key={i}>{renderNode(c)}</div>))}
          </div>
        );
      }
      case 'progress': {
        const val = Math.max(0, Math.min(100, Number(node.value||0)));
        return (
          <div style={{ width:'100%', background:'#0b1220', border:'1px solid #334155', borderRadius:6 }}>
            <div style={{ width:`${val}%`, height:8, background:'#22c55e', borderRadius:6 }} />
          </div>
        );
      }
      case 'slider': {
        const name = node.name || node.id || 'slider';
        const min = Number(node.min ?? 0), max = Number(node.max ?? 100), step = Number(node.step ?? 1);
        return (
          <input type="range" min={min} max={max} step={step} defaultValue={node.value ?? 0} onChange={(e)=>onEvent?.(node.event||'slider', { name, value: Number(e.target.value) })} />
        );
      }
      case 'image':
        return <img src={resolveAsset? resolveAsset(node.src) : node.src} alt={node.alt||''} style={{ maxWidth:'100%', borderRadius: node.radius??8, border: node.border? '1px solid #334155':'none', ...tokenStyle }} />;
      case 'spacer':
        return <div style={{ height: node.size||8 }} />;
      case 'card': {
        const style = {
          border:'1px solid #25314a',
          borderRadius:12,
          background:'rgba(2,6,23,0.5)',
          padding: node.padding??10,
          ...tokenStyle,
        };
        return <div style={style}>{(node.children||[]).map((c,i)=>(<div key={i}>{renderNode(c)}</div>))}</div>;
      }
      default:
        if (Array.isArray(node)) return <>{node.map((c,i)=>(<div key={i}>{renderNode(c)}</div>))}</>;
        if (typeof node === 'string') return <div style={{ whiteSpace:'pre-wrap', color:'#e2e8f0' }}>{node}</div>;
        return <div style={{ color:'#94a3b8', fontSize:12 }}>unknown: {String(node?.type||'')}</div>;
    }
  };
  return <div>{renderNode(schema)}</div>;
}
