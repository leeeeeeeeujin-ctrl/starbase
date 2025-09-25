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
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '24px auto',
        padding: 12,
        display: 'grid',
        gridTemplateRows: 'auto auto auto 1fr auto',
        gap: 12,
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ padding: '6px 10px' }}>
            ← 목록
          </button>
          <h2 style={{ margin: 0 }}>{game?.name}</h2>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
            필요 슬롯 {requiredSlots} · 참여 {participants.length}
          </span>
        </div>
        {game?.description && <div style={{ color: '#475569' }}>{game.description}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onOpenHeroPicker} style={{ padding: '8px 12px', borderRadius: 8 }}>
          캐릭터 선택
        </button>

        <select
          value={alreadyJoined ? myEntry?.role || '' : pickRole || ''}
          onChange={(event) => onChangeRole?.(event.target.value)}
          disabled={alreadyJoined}
          style={{ padding: '8px 10px', opacity: alreadyJoined ? 0.6 : 1 }}
        >
          <option value="">{alreadyJoined ? '이미 참가됨' : '역할 선택'}</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

        <button
          onClick={onJoin}
          disabled={!myHero || alreadyJoined}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: !myHero || alreadyJoined ? '#cbd5e1' : '#2563eb',
            color: '#fff',
            fontWeight: 700,
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
            padding: '8px 12px',
            borderRadius: 8,
            background: !startDisabled ? '#111827' : '#cbd5e1',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          {startLabel}
        </button>

        <button onClick={onOpenLeaderboard} style={{ padding: '8px 12px', borderRadius: 8 }}>
          리더보드
        </button>

        {isOwner && (
          <button
            onClick={onDelete}
            disabled={deleting}
            style={{ padding: '8px 12px', borderRadius: 8, background: '#ef4444', color: '#fff', marginLeft: 'auto' }}
          >
            {deleting ? '삭제 중…' : '방 삭제(방장)'}
          </button>
        )}
      </div>

      <MyHeroStrip hero={myHero} roleLabel={myEntry?.role} />

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, minHeight: 240 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {participants.map((participant) => (
            <ParticipantCard key={participant.id} p={participant} />
          ))}
          {participants.length === 0 && (
            <div style={{ color: '#64748b' }}>아직 참여자가 없습니다. 먼저 참여해보세요.</div>
          )}
        </div>
      </div>

      <HistoryPanel text={historyText} />

      <SharedChatDock
        height={260}
        heroId={chatHeroId}
        onUserSend={onChatSend}
      />
    </div>
  )
}

// 
