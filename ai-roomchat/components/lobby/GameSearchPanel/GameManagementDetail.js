import React, { useMemo, useState } from 'react';
import { styles } from './styles';

function formatNumber(value) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('ko-KR').format(value);
}

function formatWinRate(value) {
  if (value === null || value === undefined) return '-';
  const ratio = value > 1 ? value : value * 100;
  return `${Math.round(ratio * 10) / 10}%`;
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch (error) {
    return value;
  }
}

export default function GameManagementDetail({
  game,
  detailLoading,
  participants,
  roles,
  roleChoice,
  onRoleChange,
  roleSlots,
  onEnterGame,
  viewerId,
  tags = [],
  onAddTag,
  onRemoveTag,
  seasons = [],
  onFinishSeason,
  onStartSeason,
  stats,
  battleLogs = [],
  onRefreshDetail,
  onDeleteGame,
}) {
  const [tagInput, setTagInput] = useState('');

  const activeSeason = useMemo(
    () => seasons.find(season => (season.status || '').toLowerCase() === 'active'),
    [seasons]
  );

  const archivedSeasons = useMemo(
    () => seasons.filter(season => (season.status || '').toLowerCase() !== 'active'),
    [seasons]
  );

  const hasGame = Boolean(game);

  const roleSummaries = useMemo(
    () =>
      roles.map(role => {
        const slot = roleSlots.get(role.name) || { capacity: role.slot_count ?? 1, occupied: 0 };
        const capacity = Number.isFinite(Number(slot.capacity)) ? Number(slot.capacity) : 0;
        const occupied = slot.occupied ?? 0;
        const minimum = Math.max(0, capacity);
        return {
          ...role,
          capacity,
          occupied,
          minimum,
        };
      }),
    [roles, roleSlots]
  );

  if (!hasGame) {
    return <div style={styles.detailPlaceholder}>게임을 선택하면 상세 정보가 표시됩니다.</div>;
  }

  const isOwner = Boolean(viewerId && game?.owner_id && viewerId === game.owner_id);

  const handleEnter = () => {
    onEnterGame(game, roleChoice);
  };

  const handleAddTag = async event => {
    event.preventDefault();
    if (!onAddTag) return;
    const value = tagInput.trim();
    if (!value) return;
    const result = await onAddTag(value);
    if (result?.error) {
      alert(result.error);
      return;
    }
    setTagInput('');
  };

  const handleRemoveTag = async tagId => {
    if (!onRemoveTag) return;
    const result = await onRemoveTag(tagId);
    if (result?.error) {
      alert(result.error);
    }
  };

  const handleStartSeason = async () => {
    if (!onStartSeason) return;
    if (activeSeason) {
      alert('이미 진행 중인 시즌이 있어 새 시즌을 시작할 수 없습니다.');
      return;
    }
    const result = await onStartSeason();
    if (result?.error) {
      alert(result.error);
    }
  };

  const handleFinishSeason = async seasonId => {
    if (!onFinishSeason) return;
    const targetId = seasonId || activeSeason?.id;
    if (!targetId) return;
    const confirmEnd = window.confirm('현재 시즌을 종료하고 랭킹을 보관할까요?');
    if (!confirmEnd) return;
    const result = await onFinishSeason(targetId);
    if (result?.error) {
      alert(result.error);
    }
  };

  const handleRefresh = () => {
    if (typeof onRefreshDetail === 'function') {
      onRefreshDetail();
    }
  };

  const handleDelete = async () => {
    if (!onDeleteGame) return;
    const confirmDelete = window.confirm(
      '게임을 삭제하면 모든 참가 기록이 사라집니다. 계속할까요?'
    );
    if (!confirmDelete) return;
    const result = await onDeleteGame();
    if (result?.error) {
      alert(result.error);
    }
  };

  const topPlayers = stats?.topPlayers || [];

  return (
    <div style={styles.detailBox}>
      <div style={styles.detailHeader}>
        <div>
          <strong style={styles.detailTitle}>{game.name}</strong>
          <p style={styles.detailDesc}>{game.description || '설명이 없습니다.'}</p>
        </div>
        <div style={styles.detailMeta}>
          <span>좋아요 {formatNumber(game.likes_count)}</span>
          <span>게임 횟수 {formatNumber(game.play_count)}</span>
          {game.created_at ? <span>등록일 {formatDate(game.created_at)}</span> : null}
        </div>
      </div>

      <div style={styles.tagSection}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>태그</span>
          {typeof onRefreshDetail === 'function' ? (
            <button type="button" style={styles.refreshButton} onClick={handleRefresh}>
              새로고침
            </button>
          ) : null}
        </div>
        <div style={styles.tagList}>
          {tags.length === 0 ? <span style={styles.tagEmpty}>태그가 없습니다.</span> : null}
          {tags.map(tag => (
            <span key={tag.id} style={styles.tagChip}>
              #{tag.tag}
              {isOwner ? (
                <button
                  type="button"
                  style={styles.tagRemove}
                  onClick={() => handleRemoveTag(tag.id)}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
        {isOwner ? (
          <form style={styles.tagInputRow} onSubmit={handleAddTag}>
            <input
              value={tagInput}
              onChange={event => setTagInput(event.target.value)}
              placeholder="새 태그 입력"
              style={styles.tagInput}
            />
            <button type="submit" style={styles.tagSubmit} disabled={!tagInput.trim()}>
              추가
            </button>
          </form>
        ) : null}
      </div>

      {isOwner ? (
        <div style={styles.ownerControls}>
          <button
            type="button"
            style={styles.ownerButton}
            onClick={() => window.open(`/rank/${game.id}`, '_blank', 'noopener')}
          >
            게임 관리 열기
          </button>
          <button
            type="button"
            style={{ ...styles.ownerButton, ...(activeSeason ? styles.ownerButtonDisabled : null) }}
            onClick={handleStartSeason}
            disabled={Boolean(activeSeason)}
          >
            새 시즌 시작
          </button>
          {activeSeason ? (
            <button
              type="button"
              style={styles.ownerButton}
              onClick={() => handleFinishSeason(activeSeason.id)}
            >
              시즌 종료
            </button>
          ) : null}
          <button
            type="button"
            style={{ ...styles.ownerButton, ...styles.dangerButton }}
            onClick={handleDelete}
          >
            게임 삭제
          </button>
        </div>
      ) : null}

      {stats ? (
        <div style={styles.statsSection}>
          <span style={styles.sectionTitle}>게임 통계</span>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{formatNumber(stats.totalPlayers)}</span>
              <span style={styles.statLabel}>참여 인원</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{formatNumber(stats.totalBattles)}</span>
              <span style={styles.statLabel}>누적 전투</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{formatNumber(stats.averageRating)}</span>
              <span style={styles.statLabel}>평균 레이팅</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{formatWinRate(stats.averageWinRate)}</span>
              <span style={styles.statLabel}>평균 승률</span>
            </div>
          </div>
          {topPlayers.length ? (
            <div style={styles.topPlayerList}>
              {topPlayers.map(entry => (
                <div key={`${entry.rank}-${entry.heroId}`} style={styles.topPlayerRow}>
                  <span>
                    {entry.rank}. {entry.heroName}
                  </span>
                  <span>
                    레이팅 {formatNumber(entry.rating)} / 전투 {formatNumber(entry.battles)} / 승률{' '}
                    {formatWinRate(entry.winRate)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={styles.roleSection}>
        <span style={styles.roleLabel}>역할 선택</span>
        <div style={styles.roleGrid}>
          {roleSummaries.map(role => {
            const active = roleChoice === role.name;
            return (
              <button
                key={role.id || role.name}
                onClick={() => onRoleChange(role.name)}
                style={{
                  ...styles.roleButton,
                  ...(active ? styles.roleButtonActive : styles.roleButtonInactive),
                }}
              >
                <strong>{role.name}</strong>
                <span style={styles.roleSlotMeta}>
                  최소 {role.minimum}명 필요 · 현재 {role.occupied}명 참가
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.participantSection}>
        <span style={styles.participantLabel}>참여 중</span>
        <div style={styles.participantList}>
          {detailLoading && <div style={styles.emptyState}>참여 정보를 불러오는 중…</div>}
          {!detailLoading && participants.length === 0 && (
            <div style={styles.emptyState}>아직 참여한 사람이 없습니다.</div>
          )}
          {participants.map(row => (
            <div key={row.id} style={styles.participantRow}>
              <span style={styles.participantName}>{row.name || row.hero_name || row.hero_id}</span>
              <span style={styles.participantRole}>{row.role || '미지정'}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.seasonSection}>
        <span style={styles.sectionTitle}>시즌 현황</span>
        {activeSeason ? (
          <div style={styles.seasonCard}>
            <div style={styles.seasonHeader}>
              <strong>{activeSeason.name}</strong>
              <span>진행 중</span>
            </div>
            <div style={styles.seasonMetaRow}>
              <span>시작 {formatDate(activeSeason.startedAt || activeSeason.started_at)}</span>
              {activeSeason.endedAt || activeSeason.ended_at ? (
                <span>종료 {formatDate(activeSeason.endedAt || activeSeason.ended_at)}</span>
              ) : null}
            </div>
            {Array.isArray(activeSeason.leaderboard) && activeSeason.leaderboard.length ? (
              <div style={styles.topPlayerList}>
                {activeSeason.leaderboard.slice(0, 5).map(entry => (
                  <div
                    key={`${activeSeason.id}-${entry.rank}-${entry.hero_id}`}
                    style={styles.topPlayerRow}
                  >
                    {entry.rank}. {entry.name || entry.hero_name || entry.hero_id} — 레이팅{' '}
                    {formatNumber(entry.rating)}
                  </div>
                ))}
              </div>
            ) : null}
            {isOwner ? (
              <div style={styles.seasonActions}>
                <button
                  type="button"
                  style={styles.ownerButton}
                  onClick={() => handleFinishSeason(activeSeason.id)}
                >
                  시즌 종료
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={styles.emptyState}>진행 중인 시즌이 없습니다.</div>
        )}

        {archivedSeasons.length ? (
          <div style={styles.seasonArchive}>
            {archivedSeasons.map(season => (
              <div key={season.id} style={styles.seasonCard}>
                <div style={styles.seasonHeader}>
                  <strong>{season.name}</strong>
                  <span>종료</span>
                </div>
                <div style={styles.seasonMetaRow}>
                  <span>시작 {formatDate(season.startedAt || season.started_at)}</span>
                  {season.endedAt || season.ended_at ? (
                    <span>종료 {formatDate(season.endedAt || season.ended_at)}</span>
                  ) : null}
                </div>
                {Array.isArray(season.leaderboard) && season.leaderboard.length ? (
                  <div style={styles.topPlayerList}>
                    {season.leaderboard.slice(0, 5).map(entry => (
                      <div
                        key={`${season.id}-${entry.rank}-${entry.hero_id}`}
                        style={styles.topPlayerRow}
                      >
                        {entry.rank}. {entry.name || entry.hero_name || entry.hero_id} — 레이팅{' '}
                        {formatNumber(entry.rating)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={styles.logSection}>
        <span style={styles.sectionTitle}>최근 베틀로그</span>
        {battleLogs.length === 0 ? (
          <div style={styles.emptyState}>아직 기록된 베틀로그가 없습니다.</div>
        ) : (
          <div style={styles.logList}>
            {battleLogs.slice(0, 12).map(log => (
              <div key={log.id} style={styles.logItem}>
                <div style={styles.logMeta}>
                  <span>{formatDate(log.createdAt || log.created_at)}</span>
                  {log.battle?.score_delta ? (
                    <span>점수 변동 {formatNumber(log.battle.score_delta)}</span>
                  ) : null}
                  {log.battle?.result ? <span>결과 {log.battle.result}</span> : null}
                </div>
                {log.prompt ? <p style={styles.logText}>프롬프트: {log.prompt}</p> : null}
                {log.aiResponse ? <p style={styles.logText}>응답: {log.aiResponse}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={handleEnter} disabled={!game} style={styles.enterButton}>
        선택한 역할로 입장
      </button>
    </div>
  );
}
