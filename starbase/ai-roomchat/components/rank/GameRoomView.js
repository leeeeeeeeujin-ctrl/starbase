// components/rank/GameRoomView.js
import dynamic from 'next/dynamic'
import MyHeroStrip from './MyHeroStrip'
import ParticipantCard from './ParticipantCard'
import HistoryPanel from './HistoryPanel'

const SharedChatDock = dynamic(() => import('../common/SharedChatDock'), { ssr: false })

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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: backgroundImage ? `url(${backgroundImage}) center/cover no-repeat` : '#0f172a',
        display: 'flex',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.78)',
            filter: 'blur(0px)',
            borderRadius: 24,
          }}
        />

        <div
          style={{
            position: 'relative',
            padding: 20,
            borderRadius: 24,
            backdropFilter: 'blur(10px)',
            background: 'rgba(15, 23, 42, 0.78)',
            color: '#e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.45)',
          }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={onBack}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(148, 163, 184, 0.18)',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                color: '#e2e8f0',
              }}
            >
              ← 목록
            </button>
            <div style={{ display: 'grid', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 12, color: '#cbd5f5', textTransform: 'uppercase', letterSpacing: 1 }}>
                Rank Game
              </span>
              <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.3 }}>{game?.name}</h1>
            </div>
            <button
              onClick={onOpenLeaderboard}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#bfdbfe',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              리더보드
            </button>
          </header>

          <section style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#cbd5f5' }}>{game?.description}</p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#94a3b8',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <span>필요 슬롯 {requiredSlots}</span>
              <span>참여 인원 {participants.length}</span>
            </div>
          </section>

          <section style={{ display: 'grid', gap: 12 }}>
            <MyHeroStrip hero={myHero} roleLabel={myEntry?.role} />

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#94a3b8' }}>역할 선택</label>
              <select
                value={alreadyJoined ? myEntry?.role || '' : pickRole || ''}
                onChange={(event) => onChangeRole?.(event.target.value)}
                disabled={alreadyJoined}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.6)',
                  color: '#e2e8f0',
                  fontSize: 15,
                  appearance: 'none',
                }}
              >
                <option value="">{alreadyJoined ? '이미 참가했습니다' : '역할을 고르세요'}</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <button
                onClick={onOpenHeroPicker}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: 'rgba(148, 163, 184, 0.16)',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  color: '#f8fafc',
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                캐릭터 선택
              </button>

              <button
                onClick={onJoin}
                disabled={!myHero || alreadyJoined}
                style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: !myHero || alreadyJoined ? 'rgba(148, 163, 184, 0.24)' : '#2563eb',
                  color: '#f8fafc',
                  fontWeight: 700,
                  fontSize: 16,
                  border: 'none',
                  transition: 'transform 0.2s ease',
                }}
                title={alreadyJoined ? '이미 이 캐릭터로 참가했습니다' : '참여하기'}
              >
                {alreadyJoined ? '참여 완료' : '참여하기'}
              </button>

              <button
                onClick={onStart}
                disabled={startDisabled}
                title={
                  !canStart
                    ? '최소 인원이 모여야 시작할 수 있습니다.'
                    : !myHero
                    ? '캐릭터가 필요합니다.'
                    : '게임 시작'
                }
                style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: startDisabled ? 'rgba(148, 163, 184, 0.24)' : '#0f172a',
                  color: '#f8fafc',
                  fontWeight: 700,
                  fontSize: 16,
                  border: startDisabled ? 'none' : '1px solid rgba(148, 163, 184, 0.4)',
                }}
              >
                {startLabel}
              </button>
            </div>
          </section>

          <section
            style={{
              borderRadius: 18,
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15, 23, 42, 0.6)',
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, color: '#94a3b8' }}>참여 중 파티</span>
            <div style={{ display: 'grid', gap: 12 }}>
              {participants.map((participant) => (
                <ParticipantCard key={participant.id} p={participant} />
              ))}
              {participants.length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: 14 }}>
                  아직 참여자가 없습니다. 먼저 참여해보세요.
                </div>
              )}
            </div>
          </section>

          <section
            style={{
              borderRadius: 18,
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15, 23, 42, 0.6)',
              padding: 16,
            }}
          >
            <HistoryPanel text={historyText} />
          </section>

          {isOwner && (
            <button
              onClick={onDelete}
              disabled={deleting}
              style={{
                padding: '12px 16px',
                borderRadius: 14,
                background: '#ef4444',
                color: '#fff',
                fontWeight: 600,
                border: 'none',
              }}
            >
              {deleting ? '삭제 중…' : '방 삭제 (방장 전용)'}
            </button>
          )}
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
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
  )
}

// 
