'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

import { useGameRoom } from '@/hooks/useGameRoom'
import { matchSoloRankParticipants } from '@/lib/rank/matching'

import styles from './SoloMatchClient.module.css'

const MATCH_DELAY_MS = 1200

function ensureString(value) {
  if (!value) return ''
  if (Array.isArray(value)) return value[0] ?? ''
  return String(value)
}

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return []
  return roles
    .map((role) => (typeof role === 'string' ? role : role?.name ?? role?.role))
    .filter(Boolean)
}

function formatScore(score) {
  const numeric = Number(score)
  if (!Number.isFinite(numeric)) return '점수 정보 없음'
  return `${numeric.toLocaleString()}점`
}

function describeWindow(windowSize) {
  if (!windowSize || windowSize <= 0) return '점수 제한 없이 매칭되었습니다.'
  return `허용 점수 차 ±${windowSize}`
}

export default function SoloMatchClient({ gameId: explicitGameId }) {
  const router = useRouter()
  const resolvedGameId = explicitGameId ?? ensureString(router.query?.id)

  const [authRequired, setAuthRequired] = useState(false)
  const [missingGame, setMissingGame] = useState(false)
  const [selectedRole, setSelectedRole] = useState('')
  const [stage, setStage] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [matchDetails, setMatchDetails] = useState(null)
  const [placeholderUsed, setPlaceholderUsed] = useState(false)
  const timerRef = useRef(null)
  const opponentPoolRef = useRef([])

  const {
    state: { loading, game, roles, participants, myHero },
    derived: { myEntry },
    actions: { refreshParticipants },
  } = useGameRoom(resolvedGameId, {
    onRequireLogin: () => setAuthRequired(true),
    onGameMissing: () => setMissingGame(true),
  })

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const normalizedRoles = useMemo(() => normalizeRoles(roles), [roles])

  useEffect(() => {
    if (!selectedRole && normalizedRoles.length) {
      setSelectedRole(normalizedRoles[0])
    }
  }, [normalizedRoles, selectedRole])

  const heroScore = useMemo(() => {
    if (!myEntry) return 1000
    const numeric = Number(myEntry.score ?? myEntry.rating)
    if (!Number.isFinite(numeric)) return 1000
    return numeric
  }, [myEntry])

  const heroCard = myHero
    ? {
        id: myHero.id,
        name: myHero.name,
        image: myHero.image_url || '',
        description: myHero.description || '설명이 아직 준비되지 않았습니다.',
      }
    : null

  const opponentPool = useMemo(() => {
    if (!participants || !participants.length) return []
    return participants
      .filter((participant) => {
        if (!participant) return false
        if (!participant.hero) return false
        if (participant.hero_id === myHero?.id) return false
        return true
      })
      .map((participant, index) => ({
        id: participant.id ?? `p-${index}`,
        role: selectedRole,
        score: Number(participant.score ?? participant.rating ?? 1000) || 1000,
        joined_at: participant.created_at || new Date(Date.now() - (index + 1) * 1000).toISOString(),
        hero: participant.hero,
        owner_id: participant.owner_id,
        displayName: participant.hero?.name || '이름 없는 참가자',
      }))
  }, [participants, myHero?.id, selectedRole])

  useEffect(() => {
    opponentPoolRef.current = opponentPool
  }, [opponentPool])

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handleCancel = useCallback(() => {
    resetTimer()
    setStage('idle')
    setErrorMessage('')
    setMatchDetails(null)
    setPlaceholderUsed(false)
  }, [resetTimer])

  const handleBackToRoom = useCallback(() => {
    if (resolvedGameId) {
      router.push(`/rank/${resolvedGameId}`)
    } else {
      router.back()
    }
  }, [resolvedGameId, router])

  const buildOpponentFallback = useCallback(() => {
    const name = heroCard?.name ? `${heroCard.name} (거울전)` : '연습 상대'
    return {
      id: 'placeholder-opponent',
      role: selectedRole,
      score: heroScore + 20,
      joined_at: new Date(Date.now() - 5000).toISOString(),
      hero: heroCard
        ? {
            ...heroCard,
            name,
          }
        : null,
      owner_id: null,
      displayName: name,
      placeholder: true,
    }
  }, [heroCard, heroScore, selectedRole])

  const runMatching = useCallback(
    (currentParticipants) => {
      const now = new Date().toISOString()
      const viewerEntry = {
        id: 'viewer',
        owner_id: 'viewer',
        hero_id: heroCard?.id || 'viewer-hero',
        role: selectedRole,
        score: heroScore,
        joined_at: now,
        hero: heroCard,
        displayName: heroCard?.name || '내 캐릭터',
      }

      const pool = currentParticipants.length ? currentParticipants : [buildOpponentFallback()]
      const opponents = pool.slice(0, 1)
      const usedPlaceholder = opponents.some((entry) => entry.placeholder)

      const queue = [viewerEntry, ...opponents]
      const result = matchSoloRankParticipants({
        roles: [{ name: selectedRole, slot_count: 2 }],
        queue,
      })

      if (!result.ready || !result.assignments.length) {
        return { ok: false, placeholder: usedPlaceholder }
      }

      const assignment = result.assignments[0]
      const mappedPlayers = assignment.members.map((member, index) => ({
        id: member.id ?? `member-${index}`,
        slotIndex: assignment.roleSlots[index] ?? index,
        name: member.displayName || member.hero?.name || `참가자 ${index + 1}`,
        hero: member.hero || null,
        score: member.score ?? member.rating ?? heroScore,
        isViewer: member.id === viewerEntry.id,
        placeholder: member.placeholder ?? false,
      }))

      return {
        ok: true,
        placeholder: usedPlaceholder,
        data: {
          role: assignment.role,
          window: result.maxWindow,
          players: mappedPlayers,
        },
      }
    },
    [buildOpponentFallback, heroCard, heroScore, selectedRole]
  )

  const handleStartMatch = useCallback(async () => {
    if (stage === 'matching') return
    if (!resolvedGameId) {
      setErrorMessage('게임 정보를 확인할 수 없습니다.')
      return
    }
    if (!selectedRole) {
      setErrorMessage('먼저 역할을 선택하세요.')
      return
    }
    if (!heroCard) {
      setErrorMessage('참여할 캐릭터를 먼저 선택하세요.')
      return
    }

    setErrorMessage('')
    setStage('matching')
    setMatchDetails(null)
    setPlaceholderUsed(false)

    try {
      await refreshParticipants()
    } catch (error) {
      console.warn('참가자 정보를 새로고침하지 못했습니다.', error)
    }

    resetTimer()
    timerRef.current = setTimeout(() => {
      const outcome = runMatching(opponentPoolRef.current || [])
      if (!outcome.ok) {
        setStage('idle')
        setPlaceholderUsed(outcome.placeholder)
        setErrorMessage('함께 매칭할 참가자가 부족합니다. 잠시 후 다시 시도해 주세요.')
        return
      }

      setMatchDetails(outcome.data)
      setPlaceholderUsed(outcome.placeholder)
      setStage('matched')
    }, MATCH_DELAY_MS)
  }, [heroCard, opponentPool, refreshParticipants, resetTimer, resolvedGameId, runMatching, selectedRole, stage])

  if (!resolvedGameId) {
    return <div className={styles.centered}>게임 ID가 필요합니다.</div>
  }

  if (authRequired) {
    return (
      <div className={styles.centered}>
        <p className={styles.errorText}>로그인이 필요합니다. 로그인 후 다시 시도해 주세요.</p>
        <button type="button" className={styles.secondaryButton} onClick={() => router.push('/auth/login')}>
          로그인으로 이동
        </button>
      </div>
    )
  }

  if (missingGame) {
    return (
      <div className={styles.centered}>
        <p className={styles.errorText}>게임 정보를 찾을 수 없습니다.</p>
        <button type="button" className={styles.secondaryButton} onClick={() => router.push('/lobby')}>
          로비로 돌아가기
        </button>
      </div>
    )
  }

  if (loading || !game) {
    return (
      <div className={styles.centered}>
        <div className={styles.spinner} />
        <p className={styles.muted}>게임 정보를 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.background}>
        {heroCard?.image ? (
          <img src={heroCard.image} alt={heroCard.name} />
        ) : game.image_url ? (
          <img src={game.image_url} alt={game.name} />
        ) : null}
      </div>
      <div className={styles.overlay} />
      <div className={styles.shell}>
        <header className={styles.header}>
          <span className={styles.badge}>솔로 랭크 매칭</span>
          <h1 className={styles.title}>{game.name}</h1>
          <p className={styles.subtitle}>{game.description || '게임 설명이 준비 중입니다.'}</p>
        </header>

        {heroCard ? (
          <section className={styles.heroCard}>
            <div className={styles.heroImageWrapper}>
              {heroCard.image ? (
                <img src={heroCard.image} alt={heroCard.name} />
              ) : (
                <div className={styles.heroImageFallback}>이미지가 없습니다.</div>
              )}
            </div>
            <div className={styles.heroInfo}>
              <h2 className={styles.heroName}>{heroCard.name}</h2>
              <p className={styles.heroDescription}>{heroCard.description}</p>
              <p className={styles.heroScore}>현재 점수: {formatScore(heroScore)}</p>
            </div>
          </section>
        ) : (
          <div className={styles.noticeCard}>
            캐릭터를 먼저 선택해 주세요. 로비나 캐릭터 화면에서 영웅을 선택하면 여기로 불러옵니다.
          </div>
        )}

        <section className={styles.roleCard}>
          <label htmlFor="solo-role" className={styles.roleLabel}>
            참여할 역할을 선택하세요
          </label>
          <select
            id="solo-role"
            className={styles.roleSelect}
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
          >
            {normalizedRoles.length ? (
              normalizedRoles.map((roleName) => (
                <option key={roleName} value={roleName}>
                  {roleName}
                </option>
              ))
            ) : (
              <option value="">역할 정보 없음</option>
            )}
          </select>
        </section>

        {errorMessage && <p className={styles.errorText}>{errorMessage}</p>}

        {stage === 'matching' ? (
          <section className={styles.matchingCard}>
            <div className={styles.spinnerLarge} />
            <p className={styles.matchingText}>비슷한 점수대의 플레이어를 찾는 중…</p>
            <button type="button" className={styles.secondaryButton} onClick={handleCancel}>
              취소하기
            </button>
          </section>
        ) : stage === 'matched' && matchDetails ? (
          <section className={styles.resultCard}>
            <h2 className={styles.resultTitle}>매칭이 완료되었습니다!</h2>
            <p className={styles.resultWindow}>{describeWindow(matchDetails.window)}</p>
            <div className={styles.resultGrid}>
              {matchDetails.players.map((player) => (
                <article
                  key={player.id}
                  className={`${styles.playerCard} ${player.isViewer ? styles.playerCardSelf : ''}`}
                >
                  {player.hero?.image ? (
                    <img src={player.hero.image} alt={player.name} className={styles.playerImage} />
                  ) : (
                    <div className={styles.playerImageFallback}>이미지 없음</div>
                  )}
                  <h3 className={styles.playerName}>{player.name}</h3>
                  <p className={styles.playerMeta}>{player.isViewer ? '나' : '상대'} · 슬롯 #{(player.slotIndex ?? 0) + 1}</p>
                  <p className={styles.playerScore}>{formatScore(player.score)}</p>
                  {player.placeholder && (
                    <p className={styles.playerPlaceholder}>연습 상대</p>
                  )}
                </article>
              ))}
            </div>
            {placeholderUsed && (
              <p className={styles.placeholderNotice}>
                아직 실제 참가자가 부족해 연습 상대와 매칭되었습니다. 다른 플레이어가 입장하면 다시 시도해 보세요.
              </p>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.primaryButton} onClick={handleBackToRoom}>
                게임룸으로 돌아가기
              </button>
              <button type="button" className={styles.secondaryButton} onClick={handleStartMatch}>
                다시 매칭하기
              </button>
            </div>
          </section>
        ) : (
          <section className={styles.ctaCard}>
            <p className={styles.ctaText}>
              {heroCard
                ? `${selectedRole || '역할'} 역할로 솔로 매칭을 시작해 보세요.`
                : '캐릭터를 선택하면 매칭을 시작할 수 있습니다.'}
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleStartMatch}
                disabled={!heroCard || !selectedRole}
              >
                매칭 시작
              </button>
              <Link href={`/rank/${resolvedGameId}`} className={styles.secondaryButton}>
                게임룸으로 돌아가기
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

