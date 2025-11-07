import React, { useState } from 'react';
import { offloadImageCompress, offloadAudioFeatures } from '@/lib/client/offload/imageAudioOffload';
import { runMatchWithFallback } from '@/lib/client/offload/ruleSim';
import { getMetricsSnapshot, resetMetrics } from '@/lib/client/offload/metrics';
import { useCapabilities } from '@/context/ClientCapabilitiesContext';

export default function OffloadDebug() {
  const { caps, ready } = useCapabilities();
  const [imgResult, setImgResult] = useState(null);
  const [audioResult, setAudioResult] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [metrics, setMetrics] = useState(getMetricsSnapshot());
  const [loadingImg, setLoadingImg] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [loadingSim, setLoadingSim] = useState(false);

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingImg(true);
    const res = await offloadImageCompress(file, { maxWidth: 800, quality: 0.75 });
    setImgResult(res);
    setLoadingImg(false);
  }

  async function handleAudio(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingAudio(true);
    const res = await offloadAudioFeatures(file, {});
    setAudioResult(res);
    setLoadingAudio(false);
  }

  async function handleSimulate() {
    setLoadingSim(true);
    const dummyState = {
      sessionId: 'debug-session',
      units: [
        { team: 'A', attack: 10, defense: 5 },
        { team: 'A', attack: 7, defense: 6 },
        { team: 'B', attack: 9, defense: 4 },
        { team: 'B', attack: 8, defense: 7 },
      ],
    };
    const res = await runMatchWithFallback(dummyState);
    setSimResult(res);
    setMetrics(getMetricsSnapshot());
    setLoadingSim(false);
  }

  function handleResetMetrics() {
    resetMetrics();
    setMetrics(getMetricsSnapshot());
  }

  return (
    <div style={{ padding: '1rem', fontFamily: 'system-ui,sans-serif' }}>
      <h1>Offload Debug</h1>
      {!ready && <p>Capabilities loading...</p>}
      {ready && (
        <pre style={{ background:'#111', color:'#eee', padding:'0.75rem', borderRadius:6, overflowX:'auto' }}>
          {JSON.stringify(caps, null, 2)}
        </pre>
      )}

      <section style={{ marginTop: '1rem' }}>
        <h2>Image Compression</h2>
        <input type="file" accept="image/*" onChange={handleImage} />
        {loadingImg && <p>Compressing...</p>}
        {imgResult && (
          <pre style={{ background:'#222', color:'#ddd', padding:'0.5rem', borderRadius:6 }}>
            {JSON.stringify(imgResult, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginTop:'1rem' }}>
        <h2>Audio Features</h2>
        <input type="file" accept="audio/*" onChange={handleAudio} />
        {loadingAudio && <p>Analyzing...</p>}
        {audioResult && (
          <pre style={{ background:'#222', color:'#ddd', padding:'0.5rem', borderRadius:6 }}>
            {JSON.stringify(audioResult, null, 2)}
          </pre>
        )}
      </section>

      <section style={{ marginTop:'1rem' }}>
        <h2>Rule Simulation (Local vs Fallback)</h2>
        <button onClick={handleSimulate} disabled={loadingSim}>{loadingSim ? 'Running...' : 'Run Simulation'}</button>
        {simResult && (
          <pre style={{ background:'#222', color:'#ddd', padding:'0.5rem', borderRadius:6 }}>
            {JSON.stringify(simResult, null, 2)}
          </pre>
        )}
        <div style={{ marginTop:'0.75rem' }}>
          <h3 style={{ margin:'0 0 0.25rem' }}>Offload Metrics</h3>
          <pre style={{ background:'#111', color:'#eee', padding:'0.5rem', borderRadius:6 }}>
            {JSON.stringify(metrics, null, 2)}
          </pre>
          <button onClick={handleResetMetrics} style={{ fontSize:12 }}>Reset Metrics</button>
        </div>
      </section>

      <p style={{ marginTop:'1.5rem', fontSize:12, opacity:0.7 }}>
        This page demonstrates client offloading. In production integrate these functions before calling server APIs.
      </p>
    </div>
  );
}
