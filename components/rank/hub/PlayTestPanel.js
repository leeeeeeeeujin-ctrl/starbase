const styles = {
  root: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 12,
    display: 'grid',
    gap: 12,
  },
  label: { display: 'grid', gap: 4 },
  input: { width: '100%' },
  select: { width: '100%' },
  button: {
    padding: '8px 12px',
    borderRadius: 8,
    background: '#111827',
    color: '#fff',
    border: 'none',
  },
  result: {
    background: '#0b1020',
    color: '#e0e7ff',
    padding: 12,
    borderRadius: 8,
    overflow: 'auto',
  },
}

export default function PlayTestPanel({ games, form, onSubmit }) {
  const {
    playGameId,
    setPlayGameId,
    playHeroIdsCSV,
    setPlayHeroIdsCSV,
    userApiKey,
    setUserApiKey,
    playResult,
  } = form
  return (
    <section style={styles.root}>
      <h3 style={{ margin: '4px 0' }}>플레이(테스트 호출)</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        <label style={styles.label}>
          게임
          <select value={playGameId} onChange={(event) => setPlayGameId(event.target.value)} style={styles.select}>
            <option value="">선택</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.label}>
          Hero IDs (쉼표 구분, 슬롯 합계만큼)
          <input
            value={playHeroIdsCSV}
            onChange={(event) => setPlayHeroIdsCSV(event.target.value)}
            placeholder="uuid1, uuid2, ..."
            style={styles.input}
          />
        </label>
        <label style={styles.label}>
          OpenAI API Key
          <input
            value={userApiKey}
            onChange={(event) => setUserApiKey(event.target.value)}
            placeholder="sk-..."
            style={styles.input}
          />
        </label>
        <button type="button" onClick={onSubmit} style={styles.button}>
          플레이
        </button>
        <pre style={styles.result}>{playResult}</pre>
      </div>
    </section>
  )
}
