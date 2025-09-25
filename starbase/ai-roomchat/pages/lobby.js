import React, { useCallback, useState } from 'react'
import { useRouter } from 'next/router'

import LobbyLayout from '../components/lobby/LobbyLayout'
import LobbyHeader from '../components/lobby/LobbyHeader'
import TabBar from '../components/lobby/TabBar'
import ChatPanel from '../components/lobby/ChatPanel'
import GameSearchPanel from '../components/lobby/GameSearchPanel'
import AlertsPanel from '../components/lobby/AlertsPanel'
import useLobbyChat from '../components/lobby/hooks/useLobbyChat'
import useGameBrowser from '../components/lobby/hooks/useGameBrowser'
import useLobbyAlerts from '../components/lobby/hooks/useLobbyAlerts'
import { LOBBY_TABS, NAV_LINKS, SORT_OPTIONS } from '../components/lobby/constants'

export default function Lobby() {
  const router = useRouter()
  const { heroId } = router.query
  const [activeTab, setActiveTab] = useState('chat')

  const chat = useLobbyChat({
    heroId,
    onRequireAuth: () => router.replace('/'),
  })

  const gameBrowser = useGameBrowser({ enabled: activeTab === 'games' })
  const alerts = useLobbyAlerts()

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
      {activeTab === 'chat' && (
        <ChatPanel
          displayName={chat.displayName}
          avatarUrl={chat.avatarUrl}
          messages={chat.messages}
          input={chat.input}
          onInputChange={chat.setInput}
          onSend={chat.sendMessage}
          listRef={chat.listRef}
        />
      )}

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
        />
      )}

      {activeTab === 'alerts' && <AlertsPanel alerts={alerts} />}
    </LobbyLayout>
  )
}
//
