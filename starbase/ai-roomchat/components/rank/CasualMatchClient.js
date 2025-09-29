import MatchQueueClient from './MatchQueueClient'

export default function CasualMatchClient({ gameId }) {
  return (
    <MatchQueueClient
      gameId={gameId}
      mode="casual_match"
      title="캐주얼 매칭"
      description="점수 제한 없이 캐주얼 대전을 찾고 있습니다. 준비가 되면 바로 전투를 시작할 수 있어요."
      emptyHint="대기열이 비어 있습니다. 친구들을 초대하거나 먼저 참여해 보세요."
    />
  )
}
