import { useMemo, useState } from 'react';
import { useTemplate } from '../../contexts/TemplateStore';

function safeParse(text){ try{ return JSON.parse(text||'{}'); }catch{ return null; } }
function pretty(obj){ try{ return JSON.stringify(obj, null, 2);}catch{ return ''; } }

export default function AIPanel(){
  const { templateText, setTemplateText } = useTemplate();
  const tpl = useMemo(()=> safeParse(templateText) ?? {}, [templateText]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('mock'); // mock | bridge | manual
  const [bridgeUrl, setBridgeUrl] = useState('http://127.0.0.1:4311/run-template');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [diffs, setDiffs] = useState([]);

  function computeDiff(a, b, path = '') {
    const out = [];
    if (a === b) return out;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      out.push({ type: 'change', path, from: a, to: b });
      return out;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in a)) { out.push({ type:'add', path: p, to: b[k] }); continue; }
      if (!(k in b)) { out.push({ type:'remove', path: p, from: a[k] }); continue; }
      out.push(...computeDiff(a[k], b[k], p));
    }
    return out;
  }

  const apply = (next) => setTemplateText(pretty(next));

  const runMock = async (type) => {
    setError(''); setBusy(true);
    try {
      const next = { ...tpl };
      if (type === 'summarize') {
        next.summary = `노드 ${Array.isArray(tpl.nodes)?tpl.nodes.length:0}개, 엣지 ${Array.isArray(tpl.edges)?tpl.edges.length:0}개, 리소스 그룹 ${tpl.resources?Object.keys(tpl.resources).length:0}개`;
      } else if (type === 'scaffoldNodes') {
        next.nodes = [
          { id: 'start', label: 'Start', position: { x: 60, y: 60 }, data: {} },
          { id: 'fight', label: 'Fight', position: { x: 280, y: 80 }, data: {} },
          { id: 'reward', label: 'Reward', position: { x: 500, y: 100 }, data: {} },
        ];
        next.edges = [
          { id: 'e1', source: 'start', target: 'fight', label: 'begin' },
          { id: 'e2', source: 'fight', target: 'reward', label: 'win' },
        ];
      } else if (type === 'scaffoldResources') {
        next.resources = {
          characters: [{ id:'hero', name:'Hero' }],
          skills: [{ id:'slash', name:'Slash' }],
          items: [{ id:'potion', name:'Potion' }],
          music: [], backgrounds: [], custom: []
        };
      }
      apply(next);
    } catch(e){ setError(String(e.message||e)); }
    finally { setBusy(false); }
  };

  const runBridge = async () => {
    setError(''); setBusy(true);
    try {
      const res = await fetch(bridgeUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ template: tpl }),
      });
      if (!res.ok) throw new Error(`bridge ${res.status}`);
      const data = await res.json();
      if (data && data.template) {
        const next = data.template;
        setPreview(pretty(next));
        try { setDiffs(computeDiff(tpl, next)); } catch { setDiffs([]); }
      }
    } catch(e){ setError(String(e.message||e)); }
    finally { setBusy(false); }
  };

  const applyManual = () => {
    setError('');
    const patch = safeParse(manual);
    if (!patch || typeof patch !== 'object') { setError('유효한 JSON이 아닙니다.'); return; }
    const next = { ...tpl, ...patch };
    apply(next);
  };

  return (
    <>
      <button onClick={()=> setOpen(v=>!v)}>{open? 'AI 닫기' : 'AI 도우미'}</button>
      {open && (
        <div style={{ position:'fixed', right:16, bottom:16, width:420, height:520, background:'#fff', border:'1px solid #ddd', borderRadius:10, boxShadow:'0 8px 28px rgba(0,0,0,0.15)', overflow:'hidden', display:'flex', flexDirection:'column', zIndex:30 }}>
          <div style={{ padding:'8px 12px', borderBottom:'1px solid #eee', display:'flex', gap:8, alignItems:'center' }}>
            <strong>AI 도우미</strong>
            <span style={{ flex:1 }} />
            <select value={mode} onChange={e=> setMode(e.target.value)}>
              <option value="mock">모의</option>
              <option value="bridge">로컬 브리지</option>
              <option value="manual">수동 JSON 머지</option>
            </select>
          </div>
          <div style={{ padding:12, flex:1, overflow:'auto' }}>
            {mode === 'mock' && (
              <div style={{ display:'grid', gap:8 }}>
                <button disabled={busy} onClick={()=> runMock('summarize')}>요약 추가</button>
                <button disabled={busy} onClick={()=> runMock('scaffoldNodes')}>노드 스캐폴드</button>
                <button disabled={busy} onClick={()=> runMock('scaffoldResources')}>리소스 스캐폴드</button>
              </div>
            )}
            {mode === 'bridge' && (
              <div style={{ display:'grid', gap:8 }}>
                <label>브리지 URL</label>
                <input value={bridgeUrl} onChange={e=> setBridgeUrl(e.target.value)} />
                <button disabled={busy} onClick={runBridge}>실행</button>
                {preview && (
                  <>
                    <label>결과 미리보기</label>
                    <textarea rows={10} value={preview} onChange={e=> setPreview(e.target.value)} style={{ width:'100%', fontFamily:'monospace' }} />
                    {diffs?.length > 0 && (
                      <div style={{ fontSize:12, background:'#f8fafc', border:'1px solid #e5e7eb', padding:8, borderRadius:6 }}>
                        <div style={{ fontWeight:600, marginBottom:6 }}>변경 요약 ({diffs.length})</div>
                        <ul style={{ margin:0, paddingLeft:18, maxHeight:120, overflow:'auto' }}>
                          {diffs.slice(0,50).map((d,i) => (
                            <li key={i}>{d.type} {d.path}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { try { const obj = JSON.parse(preview); apply(obj); setPreview(''); setDiffs([]); } catch { setError('미리보기 JSON이 유효하지 않습니다.'); } }}>적용</button>
                      <button onClick={() => setPreview('')}>취소</button>
                    </div>
                  </>
                )}
                <div style={{ fontSize:12, color:'#666' }}>로컬 툴에서 템플릿을 입력받아 수정된 템플릿을 반환하도록 구현하세요. POST {{ template }} → {{ template }}</div>
              </div>
            )}
            {mode === 'manual' && (
              <div style={{ display:'grid', gap:8 }}>
                <label>머지할 JSON</label>
                <textarea rows={12} value={manual} onChange={e=> setManual(e.target.value)} style={{ width:'100%', fontFamily:'monospace' }} />
                <button onClick={applyManual}>머지 적용</button>
              </div>
            )}
            {!!error && <div style={{ color:'#d33' }}>{error}</div>}
          </div>
          <div style={{ padding:8, borderTop:'1px solid #eee', fontSize:12, color:'#666' }}>
            {busy ? '작업 중…' : '준비 완료'}
          </div>
        </div>
      )}
    </>
  );
}
