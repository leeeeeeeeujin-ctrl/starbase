import { useEffect, useState } from 'react';

export default function DeviceEventsAdmin() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    setLoading(true);
    try {
      const res = await fetch('/api/devices/events');
      const j = await res.json();
      if (j && j.rows) setEvents(j.rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Device Events</h2>
      <button onClick={fetchEvents} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>id</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>event_type</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>device_id</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>actor</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>detail</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>{String(e.id)}</td>
              <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>{e.event_type}</td>
              <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>{e.device_id}</td>
              <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>{e.actor}</td>
              <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
