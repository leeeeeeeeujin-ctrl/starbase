
import { useCharacterDashboardContext } from '../../context'
import StatPageSelector from '../left/StatPageSelector'
import GameStatCarousel from '../left/GameStatCarousel'

const styles = {
  panel: {
    display: 'grid',
    gap: 24,
  },
}

export default function StatsPanel() {
  const {
    statPages,
    statPageIndex,
    setStatPageIndex,
    hasParticipations,
    visibleStatSlides,
    selectedGameId,
    onSelectGame,
    selectedEntry,
  } = useCharacterDashboardContext()

  return (
    <div style={styles.panel}>
      <StatPageSelector
        statPages={statPages}
        statPageIndex={statPageIndex}
        onChangeStatPage={setStatPageIndex}
      />
      <GameStatCarousel
        hasParticipations={hasParticipations}
        visibleStatSlides={visibleStatSlides}
        selectedGameId={selectedGameId}
        onSelectGame={onSelectGame}
        selectedEntry={selectedEntry}
      />
    </div>
  )
}
