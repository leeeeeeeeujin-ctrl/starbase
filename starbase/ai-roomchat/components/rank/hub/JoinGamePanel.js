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
    background: '#2563eb',
    color: '#fff',
    border: 'none',
  },
}

export default function JoinGamePanel({ games, form, onSubmit }) {
  const { selGameId, setSelGameId, heroIdsCSV, setHeroIdsCSV } = form
  return (
    <section style={styles.root}>
      <h3 style={{ margin: '4px 0' }}>참가 등록(내 캐릭터 팩)</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        <label style={styles.label}>
          게임
          <select value={selGameId} onChange={(event) => setSelGameId(event.target.value)} style={styles.select}>
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
            value={heroIdsCSV}
            onChange={(event) => setHeroIdsCSV(event.target.value)}
            placeholder="uuid1, uuid2, ..."
            style={styles.input}
          />
        </label>
        <button type="button" onClick={onSubmit} style={styles.button}>
          참가/팩 저장
        </button>
      </div>
    </section>
  )
}
