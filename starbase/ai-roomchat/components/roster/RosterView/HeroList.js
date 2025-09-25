import CreateHeroCard from './CreateHeroCard'
import HeroCard from './HeroCard'
import styles from './styles'

export default function HeroList({ loading, error, heroes, onRequestDelete, onResetError }) {
  const createCard = <CreateHeroCard />

  if (loading) {
    return <div style={styles.loadingState}>로스터를 불러오는 중입니다…</div>
  }

  if (error) {
    return (
      <>
        <div style={styles.errorBox} role="alert">
          {error}
          <button type="button" onClick={onResetError} style={styles.errorResetButton}>
            다시 시도
          </button>
        </div>
        {createCard}
      </>
    )
  }

  if (!heroes.length) {
    return (
      <>
        <div style={styles.emptyState}>
          아직 등록된 영웅이 없습니다.
          <br />
          아래의 <span style={{ color: '#38bdf8' }}>영웅 생성</span> 카드를 눌러 첫 캐릭터를 만들어보세요.
        </div>
        {createCard}
      </>
    )
  }

  return (
    <>
      {heroes.map((hero) => (
        <HeroCard key={hero.id} hero={hero} onDelete={onRequestDelete} />
      ))}
      {createCard}
    </>
  )
}
