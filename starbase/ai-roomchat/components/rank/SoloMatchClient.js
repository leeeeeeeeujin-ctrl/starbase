import AutoMatchProgress from './AutoMatchProgress'

export default function SoloMatchClient({ gameId, initialHeroId }) {
  return (
    <AutoMatchProgress
      gameId={gameId}
      mode="rank_solo"
      initialHeroId={initialHeroId}
    />
  )
}
