import AutoMatchProgress from './AutoMatchProgress'

export default function DuoMatchClient({ gameId }) {
  return <AutoMatchProgress gameId={gameId} mode="rank_duo" />
}
