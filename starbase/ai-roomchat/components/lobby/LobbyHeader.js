import React from 'react'
import Link from 'next/link'

export default function LobbyHeader({ onBack, navLinks = [] }) {
  return (
    <header style={styles.root}>
      <div style={styles.titleRow}>
        <button onClick={onBack} style={styles.backButton}>
          ← 캐릭터로
        </button>
        <div style={styles.headingGroup}>
          <h1 style={styles.heading}>로비</h1>
          <p style={styles.caption}>실시간 채팅으로 소통하고, 바로 아래 탭에서 원하는 게임을 찾아 참여하세요.</p>
        </div>
      </div>
      {navLinks.length ? (
        <nav style={styles.nav}>
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href} style={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  )
}

const styles = {
  root: {
    background: '#111827',
    borderRadius: 24,
    padding: '18px 20px',
    color: '#f8fafc',
    boxShadow: '0 32px 68px -42px rgba(15, 23, 42, 0.75)',
    display: 'grid',
    gap: 16,
  },
  titleRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  backButton: {
    padding: '8px 14px',
    borderRadius: 999,
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.4)',
    color: '#f8fafc',
    fontWeight: 600,
  },
  headingGroup: {
    display: 'grid',
    gap: 4,
  },
  heading: {
    margin: 0,
    fontSize: 24,
  },
  caption: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: '#cbd5f5',
  },
  nav: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  navLink: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    color: '#f8fafc',
    textDecoration: 'none',
    fontWeight: 600,
  },
}
//
