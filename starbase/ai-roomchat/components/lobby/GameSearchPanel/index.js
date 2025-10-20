import React from 'react'
import SearchControls from './SearchControls'
import GameList from './GameList'
import GameDetail from './GameDetail'
import { styles } from './styles'

export default function GameSearchPanel({
  query,
  onQueryChange,
  sort,
  onSortChange,
  sortOptions,
  rows,
  loading,
  selectedGame,
  onSelectGame,
  detailLoading,
  roles,
  participants,
  roleChoice,
  onRoleChange,
  roleSlots,
  onEnterGame,
  viewerParticipant,
  viewerId,
  onJoinGame,
  joinLoading,
}) {
  return (
    <div style={styles.root}>
      <div style={styles.searchColumn}>
        <SearchControls
          query={query}
          onQueryChange={onQueryChange}
          sort={sort}
          onSortChange={onSortChange}
          sortOptions={sortOptions}
        />
        <GameList
          rows={rows}
          loading={loading}
          selectedGameId={selectedGame?.id}
          onSelectGame={onSelectGame}
        />
      </div>

      <GameDetail
        game={selectedGame}
        detailLoading={detailLoading}
        participants={participants}
        roles={roles}
        roleChoice={roleChoice}
        onRoleChange={onRoleChange}
        roleSlots={roleSlots}
        onEnterGame={onEnterGame}
        viewerParticipant={viewerParticipant}
        viewerId={viewerId}
        onJoinGame={onJoinGame}
        joinLoading={joinLoading}
      />
    </div>
  )
}
//
