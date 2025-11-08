import React, { useEffect, useState } from 'react';

function usePasswordGate() {
  const [pass, setPass] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(false);

  async function verify(p) {
    setChecking(true);
    try {
      const res = await fetch('/api/admin/offload-metrics', {
        headers: { 'x-admin-password': p },
      });
      if (res.status === 200) {
        setAuthorized(true);
        localStorage.setItem('admin_pass', p);
      } else {
        setAuthorized(false);
      }
    } catch (e) {
      setAuthorized(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem('admin_pass');
    if (saved) verify(saved);
  }, []);

  return { pass, setPass, authorized, checking, verify };
}

export default function AdminOffloadPage() {
  const gate = usePasswordGate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastLocalSnapshot, setLastLocalSnapshot] = useState(null);
  const [note, setNote] = useState('');

  function loadLocalSnapshot() {
    try {
      const raw = localStorage.getItem('offload_metrics_last');
      if (raw) {
        setLastLocalSnapshot(JSON.parse(raw));
      }
    } catch {}
  }

  async function refresh() {
    if (!gate.authorized) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/offload-metrics', {
        headers: { 'x-admin-password': localStorage.getItem('admin_pass') || '' },
      });
      const data = await res.json();
      if (data && data.ok) setRows(data.rows || []);
    } catch (e) {}
    finally { setLoading(false); }
  }

  async function submitLocalSnapshot() {
    if (!gate.authorized || !lastLocalSnapshot) return;
    try {
      const snapshot = lastLocalSnapshot;
      const res = await fetch('/api/admin/offload-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': localStorage.getItem('admin_pass') || '',
        },
        body: JSON.stringify({
          counts: snapshot.counts,
          avgDurationMs: snapshot.avgDurationMs,
          reasons: snapshot.reasons,
          clientVersion: snapshot.clientVersion || null,
          note: note || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNote('');
        refresh();
      }
    } catch (e) {}
  }

  useEffect(() => {
    loadLocalSnapshot();
  }, []);

  useEffect(() => {
    if (gate.authorized) refresh();
  }, [gate.authorized]);

  return (
    <div style={{ padding: '1rem', fontFamily: 'system-ui,sans-serif' }}>
      <h1>Admin – Offload Metrics</h1>
      {!gate.authorized && (
        <div style={{ maxWidth: 400 }}>
          <p>Enter admin password to view metrics.</p>
          <input
            type="password"
            value={gate.pass}
            onChange={e => gate.setPass(e.target.value)}
            placeholder="Admin password"
            style={{ width: '100%', padding: '0.5rem' }}
          />
          <button disabled={!gate.pass || gate.checking} onClick={() => gate.verify(gate.pass)}>
            {gate.checking ? 'Verifying...' : 'Unlock'}
          </button>
        </div>
      )}
      {gate.authorized && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <button onClick={refresh} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
            <button onClick={loadLocalSnapshot} style={{ marginLeft: 8 }}>Load Local Snapshot</button>
          </div>
          <section style={{ marginBottom: '1.25rem' }}>
            <h2>Local Browser Snapshot</h2>
            {!lastLocalSnapshot && <p style={{ opacity:0.7 }}>No local snapshot found. Generate metrics via /debug/offload page.</p>}
            {lastLocalSnapshot && (
              <pre style={{ background:'#111', color:'#eee', padding:'0.75rem', borderRadius:6, overflowX:'auto' }}>
                {JSON.stringify(lastLocalSnapshot, null, 2)}
              </pre>
            )}
            <div style={{ marginTop: '0.5rem' }}>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Optional note"
                style={{ width:'60%', padding:'0.4rem' }}
              />
              <button onClick={submitLocalSnapshot} disabled={!lastLocalSnapshot} style={{ marginLeft:8 }}>Submit Snapshot</button>
            </div>
          </section>
          <section>
            <h2>Stored Offload Metrics</h2>
            {rows.length === 0 && <p style={{ opacity:0.7 }}>No stored rows yet.</p>}
            {rows.length > 0 && (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr>
                    <th style={th}>Collected At</th>
                    <th style={th}>Counts (sandbox/worker/inline/skipped)</th>
                    <th style={th}>Avg Duration (ms)</th>
                    <th style={th}>Skip Reasons</th>
                    <th style={th}>Client Version</th>
                    <th style={th}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i) => (
                    <tr key={r.id || r.collected_at || i} style={{ background: i%2?'#181818':'#121212' }}>
                      <td style={td}>{r.collected_at}</td>
                      <td style={td}>{r.counts ? JSON.stringify(r.counts) : '-'}</td>
                      <td style={td}>{r.avg_duration_ms ? JSON.stringify(r.avg_duration_ms) : '-'}</td>
                      <td style={td}>{r.reasons ? JSON.stringify(r.reasons) : '-'}</td>
                      <td style={td}>{r.client_version || '-'}</td>
                      <td style={td}>{r.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section style={{ marginTop:'1.5rem' }}>
            <h2>Related Operations</h2>
            <ul style={{ lineHeight:1.5 }}>
              <li><a href="/api/rank/cooldown-telemetry" target="_blank" rel="noreferrer">Cooldown Telemetry</a></li>
              <li><a href="/native_release.json" target="_blank" rel="noreferrer">Native Release Manifest</a></li>
              <li><a href="/mobile-endpoints.json" target="_blank" rel="noreferrer">Mobile Endpoints</a></li>
              <li><a href="/debug/offload" target="_blank" rel="noreferrer">Offload Debug Page</a></li>
              <li><a href="/api/health" target="_blank" rel="noreferrer">Health Probe</a></li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

const th = { textAlign:'left', padding:'4px 6px', borderBottom:'1px solid #333' };
const td = { padding:'4px 6px', verticalAlign:'top', fontFamily:'monospace' };
