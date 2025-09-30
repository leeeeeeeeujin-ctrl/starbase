import MatchQueueClient from './MatchQueueClient'

export default function DuoMatchClient({ gameId }) {
  return (
    <MatchQueueClient
      gameId={gameId}
      mode="rank_duo"
      title="듀오 랭크 매칭"
      description={
        '팀 평균 점수 ±200 안에서 다른 파티와 매칭을 기다리는 중입니다. ' +
        '모든 인원이 준비되면 자동으로 전투 화면으로 이동합니다.'
      }
      emptyHint="아직 대기 중인 듀오 파티가 없습니다. 가장 먼저 대기열에 합류해 보세요!"
      autoJoin
    />
  )
}
