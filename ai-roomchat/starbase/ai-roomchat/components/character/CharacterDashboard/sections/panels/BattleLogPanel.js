
import { useCharacterDashboardContext } from '../../context'
import BattleLogSection from '../right/BattleLogSection'

export default function BattleLogPanel() {
  const { battleDetails, visibleBattles, onShowMoreBattles, battleLoading, battleError } =
    useCharacterDashboardContext()

  return (
    <BattleLogSection
      battleDetails={battleDetails}
      visibleBattles={visibleBattles}
      onShowMoreBattles={onShowMoreBattles}
      battleLoading={battleLoading}
      battleError={battleError}
    />
  )
}
