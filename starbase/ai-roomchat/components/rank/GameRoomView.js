// components/rank/GameRoomView.js
import Image from 'next/image'
import styles from './GameRoomView.module.css'

function renderRules(rules) {
  if (!rules) return null

  if (typeof rules === 'string') {
    const trimmed = rules.trim()
    if (!trimmed) return null
    return <p className={styles.rulesText}>{trimmed}</p>
  }

  try {
    const pretty = JSON.stringify(rules, null, 2)
    if (!pretty) return null
    return (
      <pre className={styles.rulesCode}>
        {pretty}
      </pre>
    )
  } catch (error) {
    return null
  }
}

export default function GameRoomView({ game, onBack }) {
  if (!game) {
    return (
      <div className={styles.room}>
        <div className={styles.inner}>
          <p className={styles.empty}>게임 정보를 불러오는 중입니다…</p>
        </div>
      </div>
    )
  }

  const { name, description, image_url: imageUrl } = game

  return (
    <div className={styles.room}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            ← 목록으로
          </button>
        </div>

        <h1 className={styles.title}>{name || '이름 없는 게임'}</h1>

        {imageUrl ? (
          <div className={styles.coverWrap}>
            <Image
              src={imageUrl}
              alt={name || '게임 대표 이미지'}
              width={960}
              height={540}
              className={styles.cover}
            />
          </div>
        ) : (
          <div className={styles.coverPlaceholder}>대표 이미지가 없어요</div>
        )}

        {description ? (
          <p className={styles.description}>{description}</p>
        ) : (
          <p className={styles.description}>설명이 아직 등록되지 않았어요.</p>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>게임 룰</h2>
          {renderRules(game.rules) || (
            <p className={styles.empty}>룰 정보가 준비 중입니다.</p>
          )}
        </section>
      </div>
    </div>
  )
}
