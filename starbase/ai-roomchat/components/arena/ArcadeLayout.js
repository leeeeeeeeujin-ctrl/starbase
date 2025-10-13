import Link from 'next/link'
import styles from './ArcadeLayout.module.css'

export function ArcadeLayout({ title, actions = [], children }) {
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>{title || 'Rank Arcade'}</h1>
          <p className={styles.subtitle}>Supabase RPC + Realtime driven arena flow</p>
        </div>
        <nav className={styles.nav}>
          <Link href="/">개요</Link>
          <Link href="/arena/queue">큐</Link>
          <Link href="/arena/staging">준비</Link>
          <Link href="/arena/control">운영</Link>
        </nav>
        {actions?.length ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
