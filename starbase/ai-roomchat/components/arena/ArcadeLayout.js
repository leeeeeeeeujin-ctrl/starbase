import Link from 'next/link'
import styles from './ArcadeLayout.module.css'

const CORE_LINKS = [
  { href: '/', label: '타이틀' },
  { href: '/roster', label: '로스터' },
  { href: '/lobby', label: '캐릭터·로비' },
]

const ARENA_LINKS = [
  { href: '/arena/queue', label: '큐' },
  { href: '/arena/staging', label: '준비' },
  { href: '/arena/sessions/demo-session', label: '본게임 데모' },
  { href: '/arena/control', label: '운영' },
]

const SUPPORT_LINKS = [
  { href: '/play', label: '메인룸' },
  { href: '/maker', label: '게임 제작' },
  { href: '/rooms', label: '레거시 방 목록' },
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
          <div className={styles.navStacks}>
            <div className={styles.navGroup}>
              <p className={styles.navLabel}>기본 흐름</p>
              <nav className={`${styles.nav} ${styles.primaryNav}`} aria-label="Core flow navigation">
                {CORE_LINKS.map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className={styles.navGroup}>
              <p className={styles.navLabel}>Arena 매칭</p>
              <nav className={`${styles.nav} ${styles.arenaNav}`} aria-label="Arena navigation">
                {ARENA_LINKS.map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className={`${styles.navGroup} ${styles.secondaryGroup}`}>
              <p className={styles.navLabel}>부가기능</p>
              <nav
                className={`${styles.nav} ${styles.secondaryNav}`}
                aria-label="Supporting navigation"
              >
                {SUPPORT_LINKS.map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
        {actions?.length ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
