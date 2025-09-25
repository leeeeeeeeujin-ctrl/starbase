import React from 'react'

export default function LobbyLayout({ header, tabs, children }) {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {header}
        {tabs}
        {children}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0f172a 0%, #1f2937 30%, #f8fafc 100%)',
    display: 'flex',
    flexDirection: 'column',
  },
  container: {
    width: '100%',
    maxWidth: 560,
    margin: '0 auto',
    padding: '24px 16px 140px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
}
//
