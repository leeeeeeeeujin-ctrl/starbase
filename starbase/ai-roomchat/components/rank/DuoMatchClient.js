import MatchQueueClient from './MatchQueueClient'

export default function DuoMatchClient({ gameId }) {
  return (
    <MatchQueueClient
      gameId={gameId}
      mode="rank_duo"
      title="듀오 랭크 매칭"
      description="같은 역할군의 팀원이 모두 준비되면 자동으로 대기열에 합류하고 매칭을 진행합니다."
      emptyHint="아직 준비된 듀오 팀이 없습니다. 방을 만들거나 기존 팀에 합류해 보세요."
      autoJoin
    />
  )
}
