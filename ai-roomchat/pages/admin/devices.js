import React, { useEffect, useState } from 'react';
import Head from 'next/head';

export default function DevicesAdmin() {
  const [devices, setDevices] = useState([]);
  const [adminPass, setAdminPass] = useState('');
  const [loading, setLoading] = useState(false);

  async function fetchDevices() {
    setLoading(true);
    try {
      const q = adminPass ? `?adminPassword=${encodeURIComponent(adminPass)}` : '';
      const res = await fetch('/api/devices/list' + q, { method: 'GET' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'failed');
      setDevices(j.devices || []);
    } catch (e) {
      alert('Failed to load devices: ' + String(e));
    } finally {
      setLoading(false);
    }
  }

  async function revoke(token) {
    if (!confirm('Revoke device token?')) return;
    try {
      const res = await fetch('/api/devices/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, adminPassword: adminPass || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'revoke failed');
      alert('Revoked');
      fetchDevices();
    } catch (e) {
      alert('Revoke failed: ' + String(e));
    }
  }

  useEffect(() => {
    // try to load on mount
    fetchDevices();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <Head>
        <title>Devices Admin</title>
      </Head>
      <h1>Devices</h1>
      <div style={{ marginBottom: 12 }}>
        <label>Admin password (if configured)</label>
        <input value={adminPass} onChange={e => setAdminPass(e.target.value)} style={{ marginLeft: 8 }} />
        <button onClick={fetchDevices} style={{ marginLeft: 8 }} disabled={loading}>
          Refresh
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>DeviceId</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>DisplayName</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Token (truncated)</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Exp</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {devices.map(d => (
            <tr key={d.token || d.id}>
              <td style={{ padding: '8px 4px' }}>{d.device_id || d.deviceId || '—'}</td>
              <td style={{ padding: '8px 4px' }}>{d.display_name || d.displayName || '—'}</td>
              <td style={{ padding: '8px 4px', fontFamily: 'monospace' }}>{
                (d.token || '').slice(0, 24) + (d.token && d.token.length > 24 ? '…' : '')
              }</td>
              <td style={{ padding: '8px 4px' }}>{d.exp ? new Date(d.exp * 1000).toLocaleString() : '—'}</td>
              <td style={{ padding: '8px 4px' }}>
                <button onClick={() => revoke(d.token || d.id)}>Revoke</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
