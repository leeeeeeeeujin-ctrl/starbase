'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import CharacterDashboard from '@/components/character/CharacterDashboard'
import StartBattleOverlay from '@/components/character/CharacterDashboard/StartBattleOverlay'
import useCharacterDashboard from '@/hooks/useCharacterDashboard'

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

  const [battleOverlayOpen, setBattleOverlayOpen] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const reloadTimerRef = useRef(null)
  const reloadAttemptedRef = useRef(
    typeof window !== 'undefined' && window.sessionStorage.getItem('characterReloadAttempted') === '1'
  )
  const dashboard = useCharacterDashboard(heroId)
  const profileSection = dashboard.profile || { hero: null }
  const participationSection =
    dashboard.participation || {
      selectedEntry: null,
      selectedGame: null,
      selectedGameId: null,
      scoreboard: [],
      heroLookup: {},
    }

  useEffect(() => {
    if (!router.isReady) return
    if (dashboard.status?.unauthorized) {
      router.replace('/')
    }
  }, [dashboard.status?.unauthorized, router])

  useEffect(() => {
    if (!router.isReady) return
    if (dashboard.status?.missingHero) {
      router.replace('/roster')
    }
  }, [dashboard.status?.missingHero, router])

  useEffect(() => {
    setInitialized(false)
  }, [heroId])

  useEffect(() => {
    if (!router.isReady) return
    if (!dashboard.status.loading) {
      setInitialized(true)
    }
  }, [router.isReady, dashboard.status.loading])

  const showInitialLoading = !router.isReady || (!initialized && dashboard.status.loading)
  const hero = profileSection.hero

  useEffect(() => {
    if (!hero?.id) {
      return
    }
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem('selectedHeroId', hero.id)
      if (hero.owner_id) {
        window.localStorage.setItem('selectedHeroOwnerId', hero.owner_id)
      }
    } catch (storageError) {
      console.error('Failed to persist selected hero metadata:', storageError)
    }
  }, [hero?.id, hero?.owner_id])

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!router.isReady) {
      return
    }

    if (!showInitialLoading) {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('characterReloadAttempted')
      }
      reloadAttemptedRef.current = false
      return
    }

    if (reloadAttemptedRef.current) {
      return
    }

    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current)
    }

    reloadTimerRef.current = setTimeout(() => {
      if (reloadAttemptedRef.current) {
        return
      }

      reloadAttemptedRef.current = true
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('characterReloadAttempted', '1')
        } catch (storageError) {
          console.error('Failed to record character reload attempt:', storageError)
        }
      }

      const navigateAndReload = async () => {
        try {
          await router.replace('/roster')
        } catch (navigationError) {
          console.error('Failed to navigate to roster before reload:', navigationError)
        } finally {
          if (typeof window !== 'undefined') {
            window.location.reload()
          }
        }
      }

      navigateAndReload()
    }, 2000)

    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
    }
  }, [router, router.isReady, showInitialLoading])

  if (showInitialLoading) {
    return <FullScreenState title="캐릭터 정보를 불러오는 중" message="잠시만 기다려 주세요." />
  }

  if (dashboard.status?.unauthorized) {
    return (
      <FullScreenState
        title="로그인이 필요합니다."
        message="이 캐릭터 정보를 보려면 먼저 로그인해 주세요."
        actionLabel="홈으로 이동"
        onAction={() => router.replace('/')}
      />
    )
  }

  if (dashboard.status?.missingHero) {
    return (
      <FullScreenState
        title="캐릭터를 찾을 수 없습니다."
        message="연결된 영웅 정보를 확인할 수 없어요. 목록으로 돌아가 다시 선택해 주세요."
        actionLabel="로스터로 이동"
        onAction={() => router.replace('/roster')}
      />
    )
  }

  if (dashboard.status?.error) {
    return (
      <FullScreenState
        title="캐릭터 정보를 불러오지 못했습니다."
        message={dashboard.status.error}
        actionLabel="다시 시도"
        onAction={() => dashboard.reload?.()}
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

  const handleStartBattle = () => {
    if (!participationSection.selectedGameId) {
      alert('먼저 게임을 선택하세요.')
      return
    }
    setBattleOverlayOpen(true)
  }

  const handleBeginSession = () => {
    const gameId = participationSection.selectedGameId
    if (!gameId) {
      setBattleOverlayOpen(false)
      return
    }
    setBattleOverlayOpen(false)
    router.push(`/rank/${gameId}/start`)
  }

  const handleBackNavigation = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }

    router.push('/roster').catch((error) => {
      console.error('Failed to navigate back to roster via router:', error)
      if (typeof window !== 'undefined') {
        window.location.href = '/roster'
      }
    })
  }, [router])

  useEffect(() => {
    router.prefetch('/roster').catch(() => {})
  }, [router])

  return (
    <>
      <CharacterDashboard
        dashboard={dashboard}
        heroId={heroId}
        heroName={dashboard.heroName}
        onBack={handleBackNavigation}
        onStartBattle={handleStartBattle}
      />
      <StartBattleOverlay
        open={battleOverlayOpen}
        hero={profileSection.hero}
        selectedEntry={participationSection.selectedEntry}
        selectedGame={participationSection.selectedGame}
        selectedGameId={participationSection.selectedGameId}
        scoreboardRows={participationSection.scoreboard}
        heroLookup={participationSection.heroLookup}
        onClose={() => setBattleOverlayOpen(false)}
        onBeginSession={handleBeginSession}
      />
    </>
  )
}
