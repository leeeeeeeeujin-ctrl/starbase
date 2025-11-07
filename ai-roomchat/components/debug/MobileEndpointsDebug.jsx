import React, { useEffect, useState } from 'react';

// Simple viewer for mobile-endpoints.json generated at build time.
// Shows guidance if primaryHost is null (no env configured at build).
export default function MobileEndpointsDebug() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [override, setOverride] = useState('');
  const [activeHost, setActiveHost] = useState(null);

  useEffect(() => {
    fetch('/mobile-endpoints.json')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load mobile-endpoints.json');
        return r.json();
      })
      .then(json => {
        setData(json);
        const stored = localStorage.getItem('MOBILE_SERVER_OVERRIDE');
        if (stored) setActiveHost(stored);
      })
      .catch(e => setError(e.message));
  }, []);

  function applyOverride() {
    if (!override) return;
    try {
      const url = new URL(override); // validate basic URL shape
      localStorage.setItem('MOBILE_SERVER_OVERRIDE', url.toString());
      setActiveHost(url.toString());
    } catch (e) {
      alert('Invalid URL: ' + e.message);
    }
  }

  function clearOverride() {
    localStorage.removeItem('MOBILE_SERVER_OVERRIDE');
    setActiveHost(null);
  }

  return (
    <div style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Mobile Endpoints Debug</h1>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!data && !error && <p>Loading...</p>}
      {data && (
        <>
          <section style={{ marginBottom: '1rem' }}>
            <h2>Resolved (build-time) Endpoints</h2>
            <pre style={{ background: '#111', color: '#eee', padding: '0.75rem', borderRadius: 6, overflowX: 'auto' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
            {data.primaryHost === null && (
              <div style={{ background: '#442', color: '#ffd', padding: '0.75rem', borderRadius: 6 }}>
                <strong>primaryHost is null.</strong>
                <p style={{ marginTop: '0.5rem' }}>
                  Set one of the following environment variables before running <code>npm run mobile:build</code> to embed a production host:
                </p>
                <ul style={{ lineHeight: 1.4 }}>
                  <li><code>MOBILE_SERVER_URL</code></li>
                  <li><code>NEXT_PUBLIC_MOBILE_SERVER_URL</code></li>
                  <li><code>APP_BASE_URL</code></li>
                  <li><code>VERCEL_PROJECT_PRODUCTION_URL</code></li>
                  <li><code>VERCEL_URL</code></li>
                  <li><code>NEXT_PUBLIC_SUPABASE_URL</code> (fallback, usually not ideal as primary web host)</li>
                </ul>
                <p style={{ marginTop: '0.5rem' }}>After setting, rebuild to regenerate <code>mobile-endpoints.json</code>.</p>
              </div>
            )}
          </section>

          <section style={{ marginBottom: '1rem' }}>
            <h2>Runtime Override</h2>
            <p>Set a temporary override host (stored in <code>localStorage</code>) without rebuilding. Clients can check this key when initializing network calls.</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="https://your-host.example"
                value={override}
                onChange={e => setOverride(e.target.value)}
                style={{ flex: '1 1 280px', padding: '0.5rem' }}
              />
              <button onClick={applyOverride} style={{ padding: '0.5rem 1rem' }}>Apply Override</button>
              <button onClick={clearOverride} style={{ padding: '0.5rem 1rem' }}>Clear Override</button>
            </div>
            <p style={{ marginTop: '0.5rem' }}>Active override: {activeHost ? <code>{activeHost}</code> : <em>none</em>}</p>
            <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Note: You still need full server CORS allowances for the override domain.</p>
          </section>

          <section>
            <h2>Integration Notes</h2>
            <ol style={{ lineHeight: 1.5 }}>
              <li>App startup: check <code>localStorage.MOBILE_SERVER_OVERRIDE</code>; if present use it, else fall back to build-time <code>primaryHost</code>.</li>
              <li>If both are null/absent, prompt user or show an error state guiding env variable setup.</li>
              <li>Consider adding a health probe to <code>/api/health</code> against the selected host and surface status here.</li>
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
