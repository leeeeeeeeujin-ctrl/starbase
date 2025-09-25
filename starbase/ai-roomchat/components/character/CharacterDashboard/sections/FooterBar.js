import React from 'react'

export default function FooterBar({ onBack, onGoLobby }) {
  return (
    <footer style={styles.footer}>
      <button type="button" onClick={onBack} style={styles.backButton}>
        ← 뒤로가기
      </button>
      <button type="button" onClick={onGoLobby} style={styles.lobbyButton}>
        로비로 이동
      </button>
    </footer>
  )
}

const styles = {
  footer: {
    position: 'fixed',
    left: 0,
    bottom: 0,
    width: '100%',
    background: 'rgba(2, 6, 23, 0.92)',
    borderTop: '1px solid rgba(148, 163, 184, 0.25)',
    padding: '12px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backdropFilter: 'blur(6px)',
    zIndex: 5,
  },
  backButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.75)',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  lobbyButton: {
    padding: '10px 24px',
    borderRadius: 999,
    border: 'none',
    background: '#38bdf8',
    color: '#020617',
    fontWeight: 800,
  },
}

//
