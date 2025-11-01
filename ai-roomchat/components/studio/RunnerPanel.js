import { useEffect, useMemo, useRef, useState } from 'react';
import { useTemplate } from '../../contexts/TemplateStore';

function safeParse(text){ try{ return JSON.parse(text||'{}'); }catch{ return {}; } }

export default function RunnerPanel(){
  const { templateText } = useTemplate();
  const template = useMemo(() => safeParse(templateText), [templateText]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('browser'); // browser | mock | proxy
  const [proxyUrl, setProxyUrl] = useState('http://127.0.0.1:4311/run');
  const [proxyAuth, setProxyAuth] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(12000);
  const [runOnSave, setRunOnSave] = useState(false);
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const iframeRef = useRef(null);

  const append = (type, msg) => setLogs(l => [...l, { t: Date.now(), type, msg }]);

  useEffect(() => {
    const onMsg = (e) => {
      const data = e.data;
      if (!data || data.channel !== 'runner') return;
      if (data.type === 'log') append('log', data.payload);
      if (data.type === 'error') append('error', data.payload);
      if (data.type === 'done') setRunning(false);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const runMock = async () => {
    setError(''); setRunning(true); setLogs([]);
    try {
      const nodes = Array.isArray(template.nodes) ? template.nodes : [];
      const edges = Array.isArray(template.edges) ? template.edges : [];
      const byId = new Map(nodes.map(n => [n.id, n]));
      let current = byId.get('start') || nodes[0];
      if (!current) throw new Error('노드가 없습니다');
      append('log', `Start at ${current.id}`);
      let steps = 0;
      while (steps < 50) {
        const outs = edges.filter(e => e.source === current.id);
        if (outs.length === 0) { append('log', `End at ${current.id}`); break; }
        const e = outs[0];
        append('log', `Edge ${e.id} ${e.label||''}`);
        const next = byId.get(e.target);
        if (!next) { append('error', `Missing target ${e.target}`); break; }
        current = next; steps++;
      }
    } catch (e) {
      setError(String(e.message||e));
    } finally { setRunning(false); }
  };

  const runProxy = async () => {
    setError(''); setRunning(true); setLogs([]);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(proxyAuth ? { Authorization: proxyAuth } : {}),
        },
        body: JSON.stringify({ template }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.logs)) data.logs.forEach(x => append('log', String(x)));
      if (data.error) append('error', String(data.error));
      if (data.result) append('log', `result: ${typeof data.result==='string'?data.result:JSON.stringify(data.result)}`);
    } catch (e) {
      setError(String(e.message||e));
    } finally { setRunning(false); }
  };

  const runBrowser = async () => {
    setError(''); setRunning(true); setLogs([]);
    try {
      const code = template?.runtime?.code;
      const srcdoc = `<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script>(function(){\n`+
        `const chan='runner';\n`+
        `function pl(type,payload){ parent.postMessage({channel:chan,type,payload}, '*'); }\n`+
        `const console={ log:(...a)=>pl('log', a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')) };\n`+
        `window.addEventListener('message', async (e)=>{ try{ const data=e.data; if(!data||data.channel!==chan) return;\n`+
        `const tpl=data.template;\n`+
        `try{\n`+
        (code ?
          `const user= (function(){ ${code}; return (typeof run==='function')? run : null; })();\n`+
          `if(!user) throw new Error('runtime.code 내에 run(template, log) 함수를 export 하세요');\n`+
          `await Promise.resolve(user(tpl, (m)=>console.log(m)));\n`
        :
          `// fallback: simple flow\n`+
          `const nodes = Array.isArray(tpl.nodes)?tpl.nodes:[]; const edges = Array.isArray(tpl.edges)?tpl.edges:[];\n`+
          `const byId=new Map(nodes.map(n=>[n.id,n])); let cur=byId.get('start')||nodes[0]; if(!cur) throw new Error('노드가 없습니다');\n`+
          `console.log('Start', cur.id); let i=0; while(i<50){ const outs=edges.filter(e=>e.source===cur.id); if(outs.length===0){console.log('End', cur.id); break;} const ed=outs[0]; console.log('Edge', ed.id, ed.label||''); cur=byId.get(ed.target); if(!cur) throw new Error('Missing target'); i++; }\n`
        )+
        `pl('done'); }catch(err){ pl('error', String(err&&err.message||err)); pl('done'); } })\n`+
        `);})();<\/script></body></html>`;
      if (!iframeRef.current) return;
      iframeRef.current.srcdoc = srcdoc;
      setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage({ channel:'runner', template }, '*');
      }, 50);
    } catch (e) {
      setError(String(e.message||e)); setRunning(false);
    }
  };

  const stop = () => {
    try { if (iframeRef.current) iframeRef.current.srcdoc = '<html></html>'; } catch {}
    setRunning(false);
  };

  const downloadLogs = () => {
    const text = logs.map(l => `[${new Date(l.t).toISOString()}] ${l.type.toUpperCase()} ${l.msg}`).join('\n');
    const blob = new Blob([text], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='runner-logs.txt'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  };

  const run = () => {
    if (mode === 'mock') return runMock();
    if (mode === 'browser') return runBrowser();
    if (mode === 'proxy') return runProxy();
  };

  // persist runner prefs
  useEffect(() => {
    try {
      const raw = localStorage.getItem('studio.runner.prefs');
      if (raw) {
        const p = JSON.parse(raw);
        if (p.mode) setMode(p.mode);
        if (p.proxyUrl) setProxyUrl(p.proxyUrl);
        if (p.proxyAuth) setProxyAuth(p.proxyAuth);
        if (typeof p.timeoutMs === 'number') setTimeoutMs(p.timeoutMs);
        if (typeof p.runOnSave === 'boolean') setRunOnSave(p.runOnSave);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('studio.runner.prefs', JSON.stringify({ mode, proxyUrl, proxyAuth, timeoutMs, runOnSave })); } catch {}
  }, [mode, proxyUrl, proxyAuth, timeoutMs, runOnSave]);

  // run on save
  useEffect(() => {
    if (!runOnSave) return;
    if (running) return;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateText]);

  return (
    <div>
      <button onClick={() => setOpen(v=>!v)}>{open? 'Runner 닫기' : 'Runner 열기'}</button>
      {open && (
        <div style={{ borderTop:'1px solid #eee', marginTop:8, paddingTop:8 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <select value={mode} onChange={e=> setMode(e.target.value)}>
              <option value="browser">브라우저</option>
              <option value="mock">모의</option>
              <option value="proxy">프록시</option>
            </select>
            <button onClick={run} disabled={running}>Run</button>
            <button onClick={stop} disabled={!running}>Stop</button>
            <button onClick={downloadLogs} disabled={logs.length===0}>로그 저장</button>
            <label style={{ marginLeft:8, fontSize:12 }}>
              <input type="checkbox" checked={runOnSave} onChange={e=> setRunOnSave(e.target.checked)} /> 저장 시 실행
            </label>
            {running && <span style={{ color:'#2563eb' }}>실행 중…</span>}
            {error && <span style={{ color:'#dc2626' }}>{error}</span>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:8, marginTop:8 }}>
            <div style={{ border:'1px solid #eee', borderRadius:8, minHeight:120, maxHeight:240, overflow:'auto', padding:8, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:12 }}>
              {logs.length===0 ? <div style={{ color:'#6b7280' }}>출력 없음</div> : (
                logs.map((l,i)=>(<div key={i} style={{ color: l.type==='error'?'#dc2626':'#111827' }}>{l.msg}</div>))
              )}
            </div>
            <div>
              <iframe ref={iframeRef} title="runner" sandbox="allow-scripts" style={{ width:'100%', height:240, border:'1px solid #eee', borderRadius:8 }} />
              {mode==='proxy' && (
                <div style={{ marginTop:8, display:'grid', gap:6 }}>
                  <label>Proxy URL</label>
                  <input value={proxyUrl} onChange={e=> setProxyUrl(e.target.value)} />
                  <label>Authorization 헤더(선택)</label>
                  <input value={proxyAuth} onChange={e=> setProxyAuth(e.target.value)} placeholder="e.g., Bearer sk-..." />
                  <label>Timeout(ms)</label>
                  <input type="number" min={1000} step={1000} value={timeoutMs} onChange={e=> setTimeoutMs(parseInt(e.target.value||'12000',10))} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
