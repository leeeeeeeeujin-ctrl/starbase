import React from 'react';
import dynamic from 'next/dynamic';
const ClientOnly = ({ children }) => {
  const [ready, setReady] = React.useState(false);
  React.useEffect(()=> setReady(true), []);
  return ready ? children : null;
};

import { useCapabilities } from '@/context/ClientCapabilitiesContext';

export default function CapabilitiesDebugPage(){
  return (
    <ClientOnly>
      <Content />
    </ClientOnly>
  );
}

function Content(){
  const { ready, caps } = useCapabilities();
  const [result, setResult] = React.useState(null);

  async function runWorkerTest(){
    if (!caps.workers) return setResult('Workers not supported');
    const code = `onmessage = (e)=>{ const n=e.data||5e6; let s=0; for(let i=0;i<n;i++){ s+=i%7 } postMessage(s); }`;
    const blob = new Blob([code], { type:'text/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    const t0 = performance.now();
    w.onmessage = (ev)=>{ const t1 = performance.now(); setResult(`Worker sum done in ${(t1-t0).toFixed(1)}ms, sum=${ev.data}`); w.terminate(); URL.revokeObjectURL(url); };
    w.postMessage(3e6);
  }

  return (
    <div style={{ padding: 16, fontFamily:'system-ui,sans-serif' }}>
      <h1>Client Capabilities</h1>
      {!ready && <p>Detecting...</p>}
      {ready && (
        <pre style={{ background:'#111', color:'#eee', padding:12, borderRadius:6, overflowX:'auto' }}>
          {JSON.stringify(caps, null, 2)}
        </pre>
      )}
      <div style={{ marginTop: 12, display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={runWorkerTest}>Worker test</button>
      </div>
      {result && <p style={{ marginTop: 8 }}>{result}</p>}
      <p style={{ marginTop: 16, fontSize: 12, opacity: 0.8 }}>
        Tip: High-tier devices will run more logic locally; low-tier will fallback to server.
      </p>
    </div>
  );
}
