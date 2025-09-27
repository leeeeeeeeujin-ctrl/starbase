import HeroCard from './HeroCard'
import styles from './styles'

export default function HeroList({
  loading,
  error,
  heroes,
  onSelectHero,
  onCreateHero,
  onRetry,
}) {
  if (loading) {
    return <div style={styles.statusBox}>로스터를 불러오는 중입니다…</div>
  }

  if (error) {
    return (
      <div style={styles.statusBox} role="alert">
        {error}
        <button type="button" onClick={onRetry} style={styles.retryButton}>
          다시 시도
        </button>
      </div>
    )
  }

  if (!heroes.length) {
    return (
      <div style={styles.statusBox}>
        아직 등록된 영웅이 없습니다.
        <br />
        아래 버튼을 눌러 첫 캐릭터를 만들어보세요.
        <button type="button" onClick={onCreateHero} style={styles.retryButton}>
          영웅 만들기
        </button>
      </div>
    )
  }

  return (
    <div style={styles.heroList}>
      {heroes.map((hero) => (
        <HeroCard key={hero.id} hero={hero} onSelect={onSelectHero} />
      ))}
      <button type="button" onClick={onCreateHero} style={styles.createCard}>
        + 영웅 만들기
      </button>
    </div>
  )
}
