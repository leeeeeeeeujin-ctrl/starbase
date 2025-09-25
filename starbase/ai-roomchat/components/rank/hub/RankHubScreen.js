import RankHubGuestNotice from './RankHubGuestNotice'
import RankHubHeader from './RankHubHeader'
import RegisterGamePanel from './RegisterGamePanel'
import JoinGamePanel from './JoinGamePanel'
import PlayTestPanel from './PlayTestPanel'
import ParticipantLeaderboard from './ParticipantLeaderboard'
import { useRankHub } from '../../../hooks/rank/useRankHub'

const containerStyle = {
  maxWidth: 1100,
  margin: '24px auto',
  padding: 12,
  display: 'grid',
  gap: 16,
}

const loadingStyle = {
  maxWidth: 980,
  margin: '40px auto',
  padding: 16,
}

export default function RankHubScreen() {
  const hub = useRankHub()

  if (!hub.initialized) {
    return (
      <div style={loadingStyle}>
        <h2>랭킹 허브</h2>
        <p>정보를 불러오는 중입니다…</p>
      </div>
    )
  }

  if (!hub.user) {
    return <RankHubGuestNotice />
  }

  return (
    <div style={containerStyle}>
      <RankHubHeader />
      <RegisterGamePanel
        gName={hub.gName}
        setGName={hub.setGName}
        gDesc={hub.gDesc}
        setGDesc={hub.setGDesc}
        gImage={hub.gImage}
        setGImage={hub.setGImage}
        gPromptSetId={hub.gPromptSetId}
        setGPromptSetId={hub.setGPromptSetId}
        roles={hub.roles}
        setRoles={hub.setRoles}
        totalSlots={hub.totalSlots}
        onCreateGame={hub.onCreateGame}
      />
      <JoinGamePanel
        games={hub.games}
        selGameId={hub.selGameId}
        setSelGameId={hub.setSelGameId}
        heroIdsCSV={hub.heroIdsCSV}
        setHeroIdsCSV={hub.setHeroIdsCSV}
        onJoin={hub.onJoin}
      />
      <PlayTestPanel
        games={hub.games}
        playGameId={hub.playGameId}
        setPlayGameId={hub.setPlayGameId}
        playHeroIdsCSV={hub.playHeroIdsCSV}
        setPlayHeroIdsCSV={hub.setPlayHeroIdsCSV}
        userApiKey={hub.userApiKey}
        setUserApiKey={hub.setUserApiKey}
        onPlay={hub.onPlay}
        playResult={hub.playResult}
      />
      <ParticipantLeaderboard participants={hub.participants} onRefresh={hub.refreshLists} />
    </div>
  )
}
