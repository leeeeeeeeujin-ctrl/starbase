import React from 'react';
import SearchControls from '../GameSearchPanel/SearchControls';
import GameList from '../GameSearchPanel/GameList';
import GameManagementDetail from '../GameSearchPanel/GameManagementDetail';
import { styles } from '../GameSearchPanel/styles';

export default function MyGamesPanel({
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
  viewerId,
  tags,
  onAddTag,
  onRemoveTag,
  seasons,
  onFinishSeason,
  onStartSeason,
  stats,
  battleLogs,
  onRefreshDetail,
  onDeleteGame,
}) {
  const isSignedIn = Boolean(viewerId);

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
        {!isSignedIn ? (
          <div style={styles.emptyState}>내 게임을 보려면 먼저 로그인해 주세요.</div>
        ) : null}
        <GameList
          rows={rows}
          loading={loading}
          selectedGameId={selectedGame?.id}
          onSelectGame={onSelectGame}
        />
      </div>

      <GameManagementDetail
        game={selectedGame}
        detailLoading={detailLoading}
        participants={participants}
        roles={roles}
        roleChoice={roleChoice}
        onRoleChange={onRoleChange}
        roleSlots={roleSlots}
        onEnterGame={onEnterGame}
        viewerId={viewerId}
        tags={tags}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
        seasons={seasons}
        onFinishSeason={onFinishSeason}
        onStartSeason={onStartSeason}
        stats={stats}
        battleLogs={battleLogs}
        onRefreshDetail={onRefreshDetail}
        onDeleteGame={onDeleteGame}
      />
    </div>
  );
}
