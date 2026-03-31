'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';

import CharacterRouteLayout from '@/components/character/routes/CharacterRouteLayout';
import CharacterAgentScreen from '@/components/character/routes/CharacterAgentScreen';
import { useCharacterDetail } from '@/hooks/character/useCharacterDetail';
import { persistHeroSelection } from '@/lib/heroes/selectedHeroStorage';
import { FullScreenState } from '../[id]';

export default function CharacterAgentPage() {
  const router = useRouter();
  const { id } = router.query;
  const heroId = useMemo(() => (Array.isArray(id) ? id[0] || '' : id || ''), [id]);
  const { loading, error, unauthorized, missingHero, hero, reload } = useCharacterDetail(heroId);

  useEffect(() => {
    if (!hero?.id) return;
    try {
      persistHeroSelection(hero);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hero-overlay:refresh'));
      }
    } catch {}
  }, [hero?.id, hero?.owner_id]);

  if (loading) {
    return <FullScreenState title="캐릭터 정보를 불러오는 중" message="잠시만 기다려 주세요." />;
  }
  if (unauthorized) {
    return <FullScreenState title="로그인이 필요합니다." message="먼저 로그인해 주세요." actionLabel="홈으로 이동" onAction={() => router.replace('/')} />;
  }
  if (missingHero) {
    return <FullScreenState title="캐릭터를 찾을 수 없습니다." message="목록에서 다시 선택해 주세요." actionLabel="로스터로 이동" onAction={() => router.replace('/roster')} />;
  }
  if (error) {
    return <FullScreenState title="캐릭터 정보를 불러오지 못했습니다." message={error} actionLabel="다시 시도" onAction={reload} />;
  }
  if (!hero) {
    return <FullScreenState title="캐릭터를 찾을 수 없습니다." message="목록에서 다시 선택해 주세요." actionLabel="로스터로 이동" onAction={() => router.replace('/roster')} />;
  }

  return (
    <CharacterRouteLayout
      hero={hero}
      activeTab="agent"
      title={`${hero.name} AI`}
      subtitle="캐릭터 AI를 만들고 다듬는 전용 공간입니다."
    >
      <CharacterAgentScreen hero={hero} />
    </CharacterRouteLayout>
  );
}
