import { useCallback, useEffect, useState } from 'react'
import styles from './CooldownDashboard.module.css'

async function api(path, init) {
  const res = await fetch(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || body.detail || 'request_failed')
  return body
}

export default function RealGameSimulator() {
  const [games, setGames] = useState([])
  const [heroes, setHeroes] = useState([])
  const [selectedGameId, setSelectedGameId] = useState('')
  const [selectedHeroIds, setSelectedHeroIds] = useState([])
  const [mode, setMode] = useState('rank_solo')
  const [apiKey, setApiKey] = useState('')
  const [sessions, setSessions] = useState([])
  const [currentSession, setCurrentSession] = useState(null)
  const [userInput, setUserInput] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadData()
// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
  }, [])

  const loadData = useCallback(async () => {
    try {
      const body = await api('/api/admin/mock-game-real/data')
      setGames(body.games || [])
      setHeroes(body.heroes || [])
    } catch (e) {
      setStatus({ type: 'error', message: `Failed to load data: ${e.message}` })
    }
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      const body = await api('/api/admin/mock-game-real/list')
      setSessions(body.sessions || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadSessions()
    const interval = setInterval(loadSessions, 5000)
    return () => clearInterval(interval)
  }, [loadSessions])

  const toggleHero = useCallback((heroId) => {
    setSelectedHeroIds(prev =>
      prev.includes(heroId) ? prev.filter(id => id !== heroId) : [...prev, heroId]
    )
  }, [])

  const createSession = useCallback(async () => {
    if (!selectedGameId) {
      setStatus({ type: 'error', message: 'Select a game first' })
      return
    }
    if (selectedHeroIds.length === 0) {
      setStatus({ type: 'error', message: 'Select at least one hero' })
      return
    }

    setLoading(true)
    setStatus(null)
    try {
      const body = await api('/api/admin/mock-game-real/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: selectedGameId,
          mode,
          heroIds: selectedHeroIds,
          config: { apiKey: apiKey || undefined },
        }),
      })
      setCurrentSession(body.snapshot)
      setStatus({ type: 'success', message: `Session created: ${body.snapshot.sessionId}` })
      loadSessions()
    } catch (e) {
      setStatus({ type: 'error', message: e.message })
    } finally {
      setLoading(false)
    }
  }, [selectedGameId, selectedHeroIds, mode, apiKey, loadSessions])

  const loadSession = useCallback(async (sessionId) => {
    setLoading(true)
    setStatus(null)
    try {
      const body = await api(`/api/admin/mock-game-real/${encodeURIComponent(sessionId)}/snapshot`)
      setCurrentSession(body.snapshot)
    } catch (e) {
      setStatus({ type: 'error', message: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  const advanceTurn = useCallback(async () => {
    if (!currentSession) return
    if (!userInput.trim()) {
      setStatus({ type: 'error', message: 'Enter user input' })
      return
    }

    setLoading(true)
    setStatus(null)
    try {
      const body = await api(`/api/admin/mock-game-real/${encodeURIComponent(currentSession.sessionId)}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput }),
      })
      setCurrentSession(body.snapshot)
      setUserInput('')
      setStatus({ type: 'success', message: `Turn ${body.snapshot.state.turn} completed` })
    } catch (e) {
      setStatus({ type: 'error', message: e.message })
    } finally {
      setLoading(false)
    }
  }, [currentSession, userInput])

  const resetSession = useCallback(async (sessionId) => {
    try {
      await api(`/api/admin/mock-game-real/${encodeURIComponent(sessionId)}/reset`, { method: 'POST' })
      if (currentSession?.sessionId === sessionId) {
        setCurrentSession(null)
      }
      loadSessions()
      setStatus({ type: 'success', message: 'Session reset' })
    } catch (e) {
      setStatus({ type: 'error', message: e.message })
    }
  }, [currentSession, loadSessions])

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Real Game Simulator</h2>
        <p style={{ fontSize: '0.85rem', color: 'rgba(199, 210, 254, 0.8)' }}>
          실제 캐릭터 데이터 + 실제 매칭/게임 로직 사용 (로컬 실행, DB 쓰기 없음)
        </p>
      </header>

      <div className={styles.form}>
        <label className={styles.label}>Game</label>
        <select className={styles.input} value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)}>
          <option value="">Select game...</option>
          {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>

        <label className={styles.label}>Mode</label>
        <select className={styles.input} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="rank_solo">Rank Solo</option>
          <option value="rank_duo">Rank Duo</option>
          <option value="casual_match">Casual Match</option>
        </select>

        <label className={styles.label}>API Key (optional, for AI turns)</label>
        <input
          type="password"
          className={styles.input}
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className={styles.form}>
        <label className={styles.label}>Select Heroes ({selectedHeroIds.length} selected)</label>
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid rgba(148, 163, 255, 0.25)', borderRadius: '0.5rem', padding: '0.5rem' }}>
          {heroes.map(hero => (
            <label key={hero.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedHeroIds.includes(hero.id)}
                onChange={() => toggleHero(hero.id)}
              />
              <span style={{ fontSize: '0.9rem', color: '#e2e8ff' }}>{hero.name}</span>
            </label>
          ))}
        </div>

        <button className={styles.button} onClick={createSession} disabled={loading}>
          {loading ? 'Creating...' : 'Create Session'}
        </button>
      </div>

      {status && (
        <p className={status.type === 'error' ? styles.statusError : styles.statusSuccess}>
          {status.message}
        </p>
      )}

      {currentSession && (
        <div className={styles.preview} style={{ marginTop: '1rem', padding: '1rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
            Session: {currentSession.gameName} ({currentSession.mode})
          </h3>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Turn: {currentSession.state.turn} | Status: {currentSession.state.statusMessage}
          </p>
          {currentSession.state.finished && (
            <p style={{ color: '#f59e0b', fontWeight: 600 }}>Session Finished</p>
          )}

          <div style={{ marginTop: '0.5rem' }}>
            <strong>Slots:</strong>
            <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem' }}>
              {(currentSession.slots || []).map((slot, i) => (
                <li key={i} style={{ fontSize: '0.85rem' }}>
                  [{slot.role}] {slot.heroName}
                </li>
              ))}
            </ul>
          </div>

          {!currentSession.state.finished && (
            <div className={styles.form} style={{ marginTop: '1rem' }}>
              <label className={styles.label}>User Input</label>
              <input
                className={styles.input}
                placeholder="Enter player action..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && advanceTurn()}
              />
              <button className={styles.button} onClick={advanceTurn} disabled={loading}>
                {loading ? 'Processing...' : 'Advance Turn'}
              </button>
            </div>
          )}

          <details style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>History ({currentSession.history.length})</summary>
            <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: '0.5rem', fontSize: '0.8rem' }}>
              {currentSession.history.map((entry, i) => (
                <div key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(15, 23, 42, 0.75)', borderRadius: '0.5rem' }}>
                  <strong>[{entry.role}]</strong> {entry.content}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <h3 className={styles.subtitle}>Active Sessions</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {sessions.map(s => (
            <li key={s.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <button className={styles.secondaryButton} onClick={() => loadSession(s.id)}>
                {s.gameName} (T{s.turn})
              </button>
              <button className={styles.secondaryButton} onClick={() => resetSession(s.id)}>
                Reset
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
