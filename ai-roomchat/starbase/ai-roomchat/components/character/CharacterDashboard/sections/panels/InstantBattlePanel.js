import { useCharacterDashboardContext } from '../../context';
import InstantBattleSection from '../right/InstantBattleSection';

export default function InstantBattlePanel() {
  const { selectedGameId, selectedEntry, battleSummary, onStartBattle } =
    useCharacterDashboardContext();

  return (
    <InstantBattleSection
      selectedGameId={selectedGameId}
      selectedEntry={selectedEntry}
      battleSummary={battleSummary}
      onStartBattle={onStartBattle}
    />
  );
}
