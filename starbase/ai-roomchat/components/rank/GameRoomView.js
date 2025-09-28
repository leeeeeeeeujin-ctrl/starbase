// components/rank/GameRoomView.js
import dynamic from 'next/dynamic'
import MyHeroStrip from './MyHeroStrip'
import ParticipantCard from './ParticipantCard'
import HistoryPanel from './HistoryPanel'
import styles from './GameRoomView.module.css'

const SharedChatDock = dynamic(() => import('../common/SharedChatDock'), { ssr: false })

const cx = (...classNames) => classNames.filter(Boolean).join(' ')

export default function GameRoomView({
  game,
  requiredSlots,
  participants,
  roles,
  pickRole,
  onChangeRole,
  alreadyJoined,
  canStart,
  myHero,
  myEntry,
  onBack,
  onOpenHeroPicker,
  onJoin,
  onStart,
  onOpenLeaderboard,
  onDelete,
  isOwner,
  deleting,
  startLabel = '게임 시작',
  startDisabled,
  historyText,
  onChatSend,
  chatHeroId,
}) {
  const backgroundImage = myHero?.image_url || game?.image_url || ''
  const rootStyle = backgroundImage ? { '--room-bg-image': `url(${backgroundImage})` } : undefined

  const hasRules = (() => {
    if (!game) return false
    if (typeof game.rules === 'string') {
      return game.rules.trim().length > 0
    }
    if (game.rules && typeof game.rules === 'object') {
      return Object.keys(game.rules).length > 0
    }
    return false
  })()

  const rawRoles = Array.isArray(roles) ? roles : []
  const normalizedRoles = rawRoles.map((role, index) => {
    if (typeof role === 'string') {
      return { key: role || `role-${index}`, name: role, capacity: null }
    }
    if (role && typeof role === 'object') {
      const name = role.name || `역할 ${index + 1}`
      const capacityValue =
        typeof role.slot_count === 'number'
          ? role.slot_count
          : typeof role.capacity === 'number'
          ? role.capacity
          : null
      return {
        key: role.id || name || `role-${index}`,
        name,
        capacity: capacityValue,
      }
    }
    return { key: `role-${index}`, name: `역할 ${index + 1}`, capacity: null }
  })

  const roleCounts = participants.reduce((acc, participant) => {
    const roleName = participant.role
    if (!roleName) return acc
    acc[roleName] = (acc[roleName] || 0) + 1
    return acc
  }, {})

  const roleStatus = normalizedRoles.map((role) => {
    const filled = roleCounts[role.name] || 0
    const locked = typeof role.capacity === 'number' ? filled >= role.capacity : false
    return { ...role, filled, locked }
  })

  const selectValue = alreadyJoined ? myEntry?.role || '' : pickRole || ''
  const selectedRole = roleStatus.find((role) => role.name === (alreadyJoined ? myEntry?.role : pickRole))
  const fallbackRole = roleStatus[0] || null
  const effectiveRole = alreadyJoined ? selectedRole : pickRole ? selectedRole : fallbackRole
  const joinLocked = !alreadyJoined && Boolean(effectiveRole?.locked)
  const noRoleAvailable = !alreadyJoined && !effectiveRole
  const joinDisabled = alreadyJoined || !myHero || joinLocked || noRoleAvailable
  const joinLabel = alreadyJoined
    ? '참여 완료'
    : joinLocked
    ? '정원 초과'
    : noRoleAvailable
    ? '참여 불가'
    : '참여하기'
  const joinTitle = (() => {
    if (alreadyJoined) return '이미 이 게임에 참가했습니다.'
    if (!myHero) return '캐릭터를 선택한 뒤 참여할 수 있습니다.'
    if (joinLocked) return '선택한 역할의 정원이 가득 찼습니다.'
    if (noRoleAvailable) return '참여 가능한 역할이 없습니다.'
    return undefined
  })()

  const startButtonDisabled = Boolean(startDisabled)
  let startHelper = ''
  if (!canStart) {
    startHelper = '최소 인원이 모여야 게임을 시작할 수 있어요.'
  } else if (!myHero) {
    startHelper = '캐릭터를 선택하면 시작할 수 있어요.'
  }

  const handleJoinClick = () => {
    if (joinDisabled) return
    onJoin?.()
  }

  const handleStartClick = () => {
    if (startButtonDisabled) return
    onStart?.()
  }

  const renderRules = () => {
    if (!hasRules) return null
    if (typeof game.rules === 'string') {
      return <p className={styles.rulesText}>{game.rules}</p>
    }
    try {
      return <pre className={styles.rulesCode}>{JSON.stringify(game.rules, null, 2)}</pre>
    } catch (error) {
      return null
    }
  }

  return (
    <div className={styles.room} style={rootStyle}>
      <div className={styles.backdrop} />
      <div className={styles.scrollArea}>
        <header className={styles.heroHeader}>
          <div className={styles.topRow}>
            <button type="button" onClick={onBack} className={cx(styles.pillButton, styles.backButton)}>
              ← 목록으로
            </button>
            <button
              type="button"
              onClick={onOpenLeaderboard}
              className={cx(styles.pillButton, styles.leaderboardButton)}
            >
              리더보드
            </button>
          </div>
          <span className={styles.tagline}>Ranked Mission</span>
          <h1 className={styles.gameTitle}>{game?.name || '이름 없는 게임'}</h1>
          {game?.description && <p className={styles.description}>{game.description}</p>}
          <div className={styles.metaBadges}>
            <span className={styles.badge}>필요 슬롯 {requiredSlots}</span>
            <span className={styles.badge}>참여 인원 {participants.length}</span>
            {hasRules && <span className={styles.badge}>룰 안내 있음</span>}
            {game?.realtime_match && <span className={styles.badge}>실시간 매치</span>}
          </div>
        </header>

        {roleStatus.length > 0 && (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>역할 배치</h2>
              <span className={styles.cardHint}>정원 상황을 확인하고 역할을 골라보세요.</span>
            </div>
            <ul className={styles.roleList}>
              {roleStatus.map((role) => {
                const { filled, capacity } = role
                const limit = typeof capacity === 'number' ? capacity : Math.max(filled, 1)
                const percent = Math.min(100, Math.round((filled / limit) * 100))
                const counterLabel =
                  typeof capacity === 'number'
                    ? `${filled}/${capacity}`
                    : filled > 0
                    ? `${filled}명`
                    : '비어 있음'
                return (
                  <li key={role.key} className={cx(styles.roleItem, role.locked && styles.roleItemFull)}>
                    <div className={styles.roleRow}>
                      <span className={styles.roleName}>{role.name}</span>
                      <span className={styles.roleCount}>{counterLabel}</span>
                    </div>
                    <div className={styles.roleMeter}>
                      <div className={styles.roleMeterFill} style={{ width: `${percent}%` }} />
                    </div>
                    {role.locked && <div className={styles.roleLockLabel}>정원이 가득 찼어요</div>}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className={cx(styles.card, styles.prepCard)}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>내 준비</h2>
            <span className={styles.cardHint}>참여할 캐릭터와 역할을 정해주세요.</span>
          </div>
          <div className={styles.heroStripWrapper}>
            <MyHeroStrip hero={myHero} roleLabel={myEntry?.role} />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="rank-role-select">
              역할 선택
            </label>
            <select
              id="rank-role-select"
              value={selectValue}
              onChange={(event) => onChangeRole?.(event.target.value)}
              disabled={alreadyJoined}
              className={styles.select}
            >
              <option value="">{alreadyJoined ? '이미 참가했습니다' : '역할을 골라주세요'}</option>
              {roleStatus.map((role) => (
                <option key={role.key} value={role.name} disabled={!alreadyJoined && role.locked}>
                  {typeof role.capacity === 'number'
                    ? `${role.name} · ${role.filled}/${role.capacity}`
                    : `${role.name} · ${role.filled}명`}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.ctaStack}>
            <button type="button" onClick={onOpenHeroPicker} className={styles.secondaryButton}>
              캐릭터 선택
            </button>
            <button
              type="button"
              onClick={handleJoinClick}
              disabled={joinDisabled}
              className={styles.primaryButton}
              title={joinTitle}
            >
              {joinLabel}
            </button>
            <button
              type="button"
              onClick={handleStartClick}
              disabled={startButtonDisabled}
              className={styles.ghostButton}
            >
              {startLabel}
            </button>
          </div>
          {startHelper && <div className={styles.helperText}>{startHelper}</div>}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>참여 중 파티</h2>
            <span className={styles.cardHint}>현재 로비에 모인 플레이어입니다.</span>
          </div>
          <div className={styles.rosterGrid}>
            {participants.map((participant) => (
              <ParticipantCard key={participant.id} p={participant} />
            ))}
            {participants.length === 0 && (
              <div className={styles.emptyState}>아직 참여자가 없습니다. 먼저 참여해보세요.</div>
            )}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>최근 히스토리</h2>
            <span className={styles.cardHint}>지난 턴 기록과 AI 응답을 확인하세요.</span>
          </div>
          <HistoryPanel text={historyText} />
        </section>

        {hasRules && (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>룰 안내</h2>
              {game?.rules_prefix && <span className={styles.cardHint}>{game.rules_prefix}</span>}
            </div>
            {renderRules()}
          </section>
        )}

        {isOwner && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className={styles.dangerButton}
          >
            {deleting ? '삭제 중…' : '방 삭제 (방장 전용)'}
          </button>
        )}

        <div className={styles.chatDock}>
          <div className={styles.chatDockInner}>
            <SharedChatDock
              height={240}
              heroId={chatHeroId}
              viewerHero={
                myHero
                  ? {
                      heroId: myHero.id,
                      heroName: myHero.name,
                      avatarUrl: myHero.image_url,
                      ownerId: myHero.owner_id,
                    }
                  : null
              }
              onUserSend={onChatSend}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
