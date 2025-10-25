import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './CooldownDashboard.module.css';

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.detail || 'request_failed');
  return body;
}

export default function SessionInspector() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState(null);
  const [gameFilter, setGameFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const qs = gameFilter ? `?gameId=${encodeURIComponent(gameFilter)}` : '';
      const body = await api(`/api/admin/sessions/list${qs}`);
      setItems(body.items || []);
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    }
  }, [gameFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const open = useCallback(async id => {
    try {
      setStatus(null);
      const detail = await api(`/api/admin/sessions/${encodeURIComponent(id)}/detail`);
      setSelected(detail);
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    }
  }, []);

  const grouped = useMemo(() => {
    const map = new Map();
    items.forEach(s => {
      const key = s.game_id;
      if (!map.has(key)) map.set(key, { gameId: key, gameName: s.game_name || key, rows: [] });
      map.get(key).rows.push(s);
    });
    return Array.from(map.values());
  }, [items]);

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Session Inspector</h2>
        <p style={{ fontSize: '0.85rem', color: 'rgba(199, 210, 254, 0.8)' }}>
          rank_sessions / rank_battles / rank_battle_logs 미니 뷰어
        </p>
      </header>

      <div className={styles.form}>
        <label className={styles.label}>Filter by Game ID</label>
        <input
          className={styles.input}
          value={gameFilter}
          onChange={e => setGameFilter(e.target.value)}
          placeholder="uuid or empty"
        />
        <button className={styles.button} onClick={load}>
          Reload
        </button>
      </div>

      {status && (
        <p className={status.type === 'error' ? styles.statusError : styles.statusSuccess}>
          {status.message}
        </p>
      )}

      <div
        style={{
          maxHeight: 220,
          overflowY: 'auto',
          border: '1px solid rgba(148, 163, 255, 0.25)',
          borderRadius: '0.5rem',
          padding: '0.5rem',
        }}
      >
        {grouped.map(g => (
          <div key={g.gameId} style={{ marginBottom: '0.75rem' }}>
            <strong>{g.gameName}</strong>
            <ul style={{ listStyle: 'none', paddingLeft: 0, margin: '0.25rem 0' }}>
              {g.rows.map(s => (
                <li
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.25rem',
                  }}
                >
                  <button className={styles.secondaryButton} onClick={() => open(s.id)}>
                    {s.id.slice(0, 8)}… (T{s.turn}) [{s.status}]
                  </button>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {selected && (
        <div className={styles.preview} style={{ marginTop: '0.75rem', padding: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>
            Session {selected.session.id}
          </h3>
          <p style={{ fontSize: '0.85rem' }}>
            game_id: {selected.session.game_id} | turn: {selected.session.turn} | status:{' '}
            {selected.session.status}
          </p>

          <details style={{ marginTop: '0.5rem' }}>
            <summary style={{ cursor: 'pointer' }}>
              <strong>Meta</strong> ({selected.metas.length})
            </summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
              {JSON.stringify(selected.metas, null, 2)}
            </pre>
          </details>

          <details style={{ marginTop: '0.5rem' }} open>
            <summary style={{ cursor: 'pointer' }}>
              <strong>Battles</strong> ({selected.battles.length})
            </summary>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {selected.battles.map(b => (
                <div
                  key={b.id}
                  style={{
                    marginBottom: '0.5rem',
                    padding: '0.5rem',
                    background: 'rgba(15,23,42,0.6)',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <strong>Battle {b.id.slice(0, 8)}…</strong> | result: {b.result || '-'} |
                    score_delta: {b.score_delta ?? '-'}
                  </div>
                  {(b.logs || []).map(log => (
                    <div key={log.id} style={{ fontSize: '0.8rem', padding: '0.25rem 0' }}>
                      <em>turn {log.turn_no}</em> — {log.prompt || ''}
                      {log.ai_response ? (
                        <div style={{ opacity: 0.9 }}>{log.ai_response}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
