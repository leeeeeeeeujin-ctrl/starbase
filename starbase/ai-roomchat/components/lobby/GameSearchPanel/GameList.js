import React from 'react'
import { styles } from './styles'

export default function GameList({ rows, loading, selectedGameId, onSelectGame }) {
  return (
    <div style={styles.listBox}>
      {loading && <div style={styles.emptyState}>불러오는 중…</div>}
      {!loading && rows.length === 0 && <div style={styles.emptyState}>조건에 맞는 게임이 없습니다.</div>}
      {rows.map((game) => {
        const active = selectedGameId === game.id
        return (
          <button
            key={game.id}
            onClick={() => onSelectGame(game)}
            style={{ ...styles.gameRow, ...(active ? styles.gameRowActive : styles.gameRowInactive) }}
          >
            <div style={styles.gameThumb}>
              {game.image_url ? <img src={game.image_url} alt="" style={styles.gameThumbImage} /> : null}
            </div>
            <div style={styles.gameInfo}>
              <strong style={styles.gameTitle}>{game.name}</strong>
              <span style={styles.gameDesc}>
                {game.description
                  ? game.description.slice(0, 80) + (game.description.length > 80 ? '…' : '')
                  : '설명이 없습니다.'}
              </span>
              <div style={styles.gameMeta}>
                <span>좋아요 {game.likes_count ?? 0}</span>
                <span>게임횟수 {game.play_count ?? 0}</span>
              </div>
              {Array.isArray(game.tags) && game.tags.length ? (
                <div style={styles.gameTags}>
                  {game.tags.map((tag) => (
                    <span key={tag} style={styles.gameTagChip}>
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <span style={styles.gameDate}>{new Date(game.created_at).toLocaleDateString()}</span>
          </button>
        )
      })}
    </div>
  )
}
//
