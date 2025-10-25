import AutoMatchProgress from './AutoMatchProgress';

export default function DuoMatchClient({ gameId, initialHeroId }) {
  return <AutoMatchProgress gameId={gameId} mode="rank_shared" initialHeroId={initialHeroId} />;
}
