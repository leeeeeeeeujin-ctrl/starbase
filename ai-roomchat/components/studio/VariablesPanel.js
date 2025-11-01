import { useMemo, useState } from 'react';
import { useTemplate } from '../../contexts/TemplateStore';

function safeParse(text){ try{ return JSON.parse(text||'{}'); }catch{ return {}; } }

export default function VariablesPanel(){
  const { templateText, setTemplateText } = useTemplate();
  const tpl = useMemo(()=> safeParse(templateText), [templateText]);
  const [open, setOpen] = useState(false);
  const vars = tpl.variables && typeof tpl.variables === 'object' ? tpl.variables : {};

  const setVars = (next) => {
    const nextTpl = { ...tpl, variables: next };
    setTemplateText(JSON.stringify(nextTpl, null, 2));
  };

  const upsert = (k,v) => setVars({ ...vars, [k]: v });
  const remove = (k) => { const n={...vars}; delete n[k]; setVars(n); };

  const entries = Object.entries(vars);

  return (
    <>
      <button onClick={() => setOpen(v=>!v)}>{open? 'Hide' : 'Variables'}</button>
      {open && (
        <div style={{ position: 'fixed', right: 16, top: 56, width: 360, height: 420, background:'#fff', border:'1px solid #ddd', borderRadius: 8, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', padding: 12, zIndex: 20, overflow:'auto' }}>
          <div style={{ display:'flex', justifyContent: 'space-between', alignItems:'center' }}>
            <strong>Variables</strong>
            <button onClick={() => setOpen(false)}>Close</button>
          </div>
          <div style={{ height: 8 }} />
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign:'left' }}>Key</th>
                <th style={{ textAlign:'left' }}>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={3} style={{ color:'#666' }}>No variables.</td></tr>
              )}
              {entries.map(([k,v]) => (
                <tr key={k}>
                  <td style={{ paddingRight: 8 }}>
                    <input value={k} readOnly style={{ width:'100%' }} />
                  </td>
                  <td>
                    <input value={String(v)} onChange={e=> upsert(k, e.target.value)} style={{ width:'100%' }} />
                  </td>
                  <td>
                    <button onClick={()=> remove(k)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ height: 12 }} />
          <NewVar onAdd={(k,v)=> upsert(k,v)} />
        </div>
      )}
    </>
  );
}

function NewVar({ onAdd }){
  const [k,setK]=useState('');
  const [v,setV]=useState('');
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap: 8 }}>
      <input placeholder="key" value={k} onChange={e=>setK(e.target.value)} />
      <input placeholder="value" value={v} onChange={e=>setV(e.target.value)} />
      <button onClick={()=>{ if(!k) return; onAdd?.(k,v); setK(''); setV(''); }}>Add</button>
    </div>
  );
}

