import React, { useCallback, useState } from 'react'
import { useRouter } from 'next/router'

import LobbyLayout from '../components/lobby/LobbyLayout'
import LobbyHeader from '../components/lobby/LobbyHeader'
import TabBar from '../components/lobby/TabBar'
import GameSearchPanel from '../components/lobby/GameSearchPanel'
import CharacterStatsPanel from '../components/lobby/CharacterStatsPanel'
import useGameBrowser from '../components/lobby/hooks/useGameBrowser'
import { LOBBY_TABS, NAV_LINKS, SORT_OPTIONS } from '../components/lobby/constants'
import useLobbyStats from '../components/lobby/hooks/useLobbyStats'

export default function Lobby() {
  const router = useRouter()
  const { heroId } = router.query
  const [activeTab, setActiveTab] = useState('games')

  const gameBrowser = useGameBrowser({ enabled: activeTab === 'games' })
  const stats = useLobbyStats({ heroId, enabled: activeTab === 'stats' })

  const handleEnterGame = useCallback(
    (game, role) => {
      if (!game) return
      const target = role ? `${game.id}?role=${encodeURIComponent(role)}` : game.id
      router.push(`/rank/${target}`)
    },
    [router],
  )

  return (
    <LobbyLayout
      header={<LobbyHeader onBack={() => router.replace('/roster')} navLinks={NAV_LINKS} />}
      tabs={<TabBar tabs={LOBBY_TABS} activeTab={activeTab} onChange={setActiveTab} />}
    >
      {activeTab === 'games' && (
        <GameSearchPanel
          query={gameBrowser.gameQuery}
          onQueryChange={gameBrowser.setGameQuery}
          sort={gameBrowser.gameSort}
          onSortChange={gameBrowser.setGameSort}
          sortOptions={SORT_OPTIONS}
          rows={gameBrowser.gameRows}
          loading={gameBrowser.gameLoading}
          selectedGame={gameBrowser.selectedGame}
          onSelectGame={gameBrowser.setSelectedGame}
          detailLoading={gameBrowser.detailLoading}
          roles={gameBrowser.gameRoles}
          participants={gameBrowser.participants}
          roleChoice={gameBrowser.roleChoice}
          onRoleChange={gameBrowser.setRoleChoice}
          roleSlots={gameBrowser.roleSlots}
          onEnterGame={handleEnterGame}
          viewerId={gameBrowser.viewerId}
          tags={gameBrowser.gameTags}
          onAddTag={gameBrowser.addGameTag}
          onRemoveTag={gameBrowser.removeGameTag}
          seasons={gameBrowser.gameSeasons}
          onFinishSeason={gameBrowser.finishSeason}
          onStartSeason={gameBrowser.startSeason}
          stats={gameBrowser.gameStats}
          battleLogs={gameBrowser.gameBattleLogs}
          onRefreshDetail={gameBrowser.refreshSelectedGame}
          onDeleteGame={gameBrowser.deleteGame}
        />
      )}

      {activeTab === 'stats' && (
        <CharacterStatsPanel
          loading={stats.loading}
          error={stats.error}
          participations={stats.participations}
          seasons={stats.seasons}
          logs={stats.logs}
          onLeaveGame={stats.leaveGame}
          onRefresh={stats.refresh}
        />
      )}
    </LobbyLayout>
  )
}
//
