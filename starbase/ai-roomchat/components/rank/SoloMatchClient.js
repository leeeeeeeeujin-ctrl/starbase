import AutoMatchProgress from './AutoMatchProgress'

export default function SoloMatchClient({ gameId }) {
  return <AutoMatchProgress gameId={gameId} mode="rank_solo" />
}
