import { useEffect, useMemo, useState } from 'react'

export const DEFAULT_HERO_NAME = '이름 없는 영웅'
export const DEFAULT_DESCRIPTION =
  '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 전투 통계를 확인할 수 있어요.'

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '')

export default function useHeroProfileInfo(initialHero) {
  const [currentHero, setCurrentHero] = useState(initialHero || null)

  useEffect(() => {
    setCurrentHero(initialHero || null)
  }, [initialHero])

  const heroName = useMemo(() => {
    if (!currentHero) return DEFAULT_HERO_NAME
    const trimmed = normalizeText(currentHero.name)
    return trimmed || DEFAULT_HERO_NAME
  }, [currentHero])

  const description = useMemo(() => {
    if (!currentHero) return DEFAULT_DESCRIPTION
    const text = normalizeText(currentHero.description)
    return text || DEFAULT_DESCRIPTION
  }, [currentHero])

  const abilityEntries = useMemo(() => {
    if (!currentHero) return []

    return [
      { label: '능력 1', description: normalizeText(currentHero.ability1) },
      { label: '능력 2', description: normalizeText(currentHero.ability2) },
      { label: '능력 3', description: normalizeText(currentHero.ability3) },
      { label: '능력 4', description: normalizeText(currentHero.ability4) },
    ].filter((entry) => entry.description)
  }, [currentHero])

  return {
    currentHero,
    setCurrentHero,
    heroName,
    description,
    abilityEntries,
  }
}
