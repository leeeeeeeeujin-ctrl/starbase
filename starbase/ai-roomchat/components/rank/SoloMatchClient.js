import MatchQueueClient from './MatchQueueClient'

export default function SoloMatchClient({ gameId }) {
  return (
    <MatchQueueClient
      gameId={gameId}
      mode="solo"
      title="솔로 랭크 매칭"
      description="비슷한 점수대의 참가자들이 역할별로 매칭될 때까지 잠시만 기다려 주세요."
      emptyHint="아직 대기 중인 참가자가 없습니다. 가장 먼저 대기열에 들어가 보세요!"
    />
  )
}
