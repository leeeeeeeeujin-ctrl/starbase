'use client'

import AuthButton from '../../components/AuthButton'
import styles from './LandingPage.module.css'

export function LandingPage() {
  return (
    <main className={styles.root}>
      <h1 className={styles.title}>천계전선</h1>
      <div className={styles.cta}>
        <AuthButton />
      </div>
    </main>
  )
}
