import Link from 'next/link'

const styles = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'space-between',
  },
  title: { margin: 0 },
  links: { display: 'flex', gap: 8 },
  linkButton: {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    textDecoration: 'none',
    color: '#0f172a',
  },
}

export default function RankHubHeader() {
  return (
    <header style={styles.root}>
      <h2 style={styles.title}>랭킹 허브</h2>
      <div style={styles.links}>
        <Link href="/roster">
          <a style={styles.linkButton}>로스터</a>
        </Link>
        <Link href="/maker">
          <a style={styles.linkButton}>게임 제작</a>
        </Link>
      </div>
    </header>
  )
}
