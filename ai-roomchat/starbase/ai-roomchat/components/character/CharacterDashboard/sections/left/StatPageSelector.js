
const styles = {
  container: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    fontWeight: 700,
    fontSize: 13,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.65)',
    color: '#e2e8f0',
  },
}

export default function StatPageSelector({ statPages, statPageIndex, onChangeStatPage }) {
  if (!statPages?.length || statPages.length <= 1) {
    return null
  }

  return (
    <div style={styles.container}>
      {statPages.map((_, index) => {
        const active = index === statPageIndex
        return (
          <button
            key={index}
            type="button"
            onClick={() => onChangeStatPage(index)}
            style={{
              ...styles.dot,
              background: active ? 'rgba(56, 189, 248, 0.85)' : styles.dot.background,
              border: active ? 'none' : styles.dot.border,
              color: active ? '#020617' : styles.dot.color,
            }}
          >
            {index + 1}
          </button>
        )
      })}
    </div>
  )
}
