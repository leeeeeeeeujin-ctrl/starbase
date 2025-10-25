import AutoMatchProgress from './AutoMatchProgress';

export default function CasualMatchClient({ gameId, initialHeroId }) {
  return <AutoMatchProgress gameId={gameId} mode="casual_match" initialHeroId={initialHeroId} />;
}
