'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'

import CharacterBasicView from '@/components/character/CharacterBasicView'
import { useCharacterDetail } from '@/hooks/character/useCharacterDetail'

function FullScreenState({ title, message, actionLabel, onAction }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        padding: '0 24px',
        background: '#020617',
        color: '#e2e8f0',
        textAlign: 'center',
      }}
    >
      {title ? <h1 style={{ margin: 0, fontSize: 24 }}>{title}</h1> : null}
      {message ? (
        <p style={{ margin: 0, fontSize: 15, color: '#94a3b8', lineHeight: 1.6 }}>{message}</p>
      ) : null}
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          style={{
            padding: '10px 20px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.7)',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export default function CharacterDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const heroId = useMemo(() => {
    if (Array.isArray(id)) return id[0] || ''
    return id || ''
  }, [id])

  const { loading, error, unauthorized, missingHero, hero, reload } = useCharacterDetail(heroId)

  useEffect(() => {
    if (!router.isReady) return
    router.prefetch('/roster').catch(() => {})
  }, [router])

  useEffect(() => {
    if (!hero?.id) return
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('selectedHeroId', hero.id)
      if (hero.owner_id) {
        window.localStorage.setItem('selectedHeroOwnerId', hero.owner_id)
      }
    } catch (storageError) {
      console.error('Failed to persist selected hero metadata:', storageError)
    }
  }, [hero?.id, hero?.owner_id])

  if (loading) {
    return <FullScreenState title="캐릭터 정보를 불러오는 중" message="잠시만 기다려 주세요." />
  }

  if (unauthorized) {
    return (
      <FullScreenState
        title="로그인이 필요합니다."
        message="이 캐릭터 정보를 보려면 먼저 로그인해 주세요."
        actionLabel="홈으로 이동"
        onAction={() => router.replace('/')}
      />
    )
  }

  if (missingHero) {
    return (
      <FullScreenState
        title="캐릭터를 찾을 수 없습니다."
        message="연결된 영웅 정보를 확인할 수 없어요. 목록으로 돌아가 다시 선택해 주세요."
        actionLabel="로스터로 이동"
        onAction={() => router.replace('/roster')}
      />
    )
  }

  if (error) {
    return (
      <FullScreenState
        title="캐릭터 정보를 불러오지 못했습니다."
        message={error}
        actionLabel="다시 시도"
        onAction={reload}
      />
    )
  }

  if (!hero) {
    return (
      <FullScreenState
        title="캐릭터를 찾을 수 없습니다."
        message="연결된 영웅 정보를 확인할 수 없어요. 목록으로 돌아가 다시 선택해 주세요."
        actionLabel="로스터로 이동"
        onAction={() => router.replace('/roster')}
      />
    )
  }

  return <CharacterBasicView hero={hero} onHeroUpdated={reload} />
}
