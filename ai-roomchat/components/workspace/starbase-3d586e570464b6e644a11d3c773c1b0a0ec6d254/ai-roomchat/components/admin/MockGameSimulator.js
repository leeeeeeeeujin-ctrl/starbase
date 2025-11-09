import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './CooldownDashboard.module.css';

async function api(path, init) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'request_failed');
  return body;
}

export default function MockGameSimulator() {
  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState('mock-1');
  const [snapshot, setSnapshot] = useState(null);
  const [role, setRole] = useState('player');
  const [content, setContent] = useState('hello');
  const [ownerId, setOwnerId] = useState('owner-1');
  const [heroId, setHeroId] = useState('hero-1');
  const [status, setStatus] = useState(null);

  const reload = useCallback(async () => {
    setStatus(null);
    try {
      const body = await api('/api/admin/mock-game/list');
      setGames(body.games || []);
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(async () => {
    setStatus(null);
    try {
      const body = await api('/api/admin/mock-game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      setSnapshot(body.snapshot);
      reload();
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    }
  }, [gameId, reload]);

  const fetchSnapshot = useCallback(async id => {
    setStatus(null);
    try {
      const body = await api(`/api/admin/mock-game/${encodeURIComponent(id)}/snapshot`);
      setSnapshot(body.snapshot);
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    }
  }, []);

  const join = useCallback(async () => {
    if (!snapshot?.gameId) return;
    setStatus(null);
    try {
      const body = await api(`/api/admin/mock-game/${encodeURIComponent(snapshot.gameId)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId, heroId, role }),
      });
      setSnapshot(body.snapshot);
      reload();
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    }
  }, [snapshot, ownerId, heroId, role, reload]);

  const add = useCallback(async () => {
    if (!snapshot?.gameId) return;
    setStatus(null);
    try {
      const body = await api(`/api/admin/mock-game/${encodeURIComponent(snapshot.gameId)}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content }),
      });
      setSnapshot(body.snapshot);
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    }
  }, [snapshot, role, content]);

  const reset = useCallback(async () => {
    if (!snapshot?.gameId) return;
    setStatus(null);
    try {
      const body = await api(`/api/admin/mock-game/${encodeURIComponent(snapshot.gameId)}/reset`, {
        method: 'POST',
      });
      setSnapshot(body.snapshot);
      reload();
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    }
  }, [snapshot, reload]);

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Mock Game Simulator</h2>
      </header>
      <div className={styles.form}>
        <label className={styles.label}>Game ID</label>
        <input className={styles.input} value={gameId} onChange={e => setGameId(e.target.value)} />
        <button className={styles.button} onClick={create}>
          Create
        </button>
        <button className={styles.secondaryButton} onClick={() => fetchSnapshot(gameId)}>
          Load
        </button>
      </div>

      <div className={styles.form}>
        <label className={styles.label}>Owner / Hero / Role</label>
        <input
          className={styles.input}
          placeholder="ownerId"
          value={ownerId}
          onChange={e => setOwnerId(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder="heroId"
          value={heroId}
          onChange={e => setHeroId(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder="role"
          value={role}
          onChange={e => setRole(e.target.value)}
        />
        <button className={styles.button} onClick={join}>
          Join
        </button>
      </div>

      <div className={styles.form}>
        <label className={styles.label}>Add Turn</label>
        <input
          className={styles.input}
          placeholder="content"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        <button className={styles.button} onClick={add}>
          Add
        </button>
        <button className={styles.secondaryButton} onClick={reset}>
          Reset
        </button>
      </div>

      {status && (
        <p className={status.type === 'error' ? styles.statusError : styles.statusSuccess}>
          {status.message}
        </p>
      )}

      {snapshot && (
        <div className={styles.preview} style={{ padding: 16 }}>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </div>
      )}

      <div>
        <h3 className={styles.subtitle}>Games</h3>
        <ul>
          {games.map(g => (
            <li key={g.id}>
              <button className={styles.secondaryButton} onClick={() => fetchSnapshot(g.id)}>
                {g.id}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
