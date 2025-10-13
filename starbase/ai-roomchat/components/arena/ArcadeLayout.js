import Link from 'next/link'
import styles from './ArcadeLayout.module.css'

const ARENA_LINKS = [
  { href: '/', label: '개요' },
  { href: '/arena/queue', label: '큐' },
  { href: '/arena/staging', label: '준비' },
  { href: '/arena/control', label: '운영' },
]

const PROJECT_LINKS = [
  { href: '/rooms', label: '방 목록' },
  { href: '/lobby', label: '로비' },
  { href: '/roster', label: '로스터' },
  { href: '/maker', label: '게임 제작' },
  { href: '/play', label: '메인룸' },
]

export function ArcadeLayout({ title, actions = [], children }) {
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.titleColumn}>
          <div>
            <h1>{title || 'Rank Arcade'}</h1>
            <p className={styles.subtitle}>Supabase RPC + Realtime driven arena flow</p>
          </div>
          <div className={styles.navGroup}>
            <nav className={styles.nav} aria-label="Arena flow navigation">
              {ARENA_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
            <nav
              className={`${styles.nav} ${styles.secondaryNav}`}
              aria-label="Original project navigation"
            >
              {PROJECT_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
        {actions?.length ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
