import React, { useEffect, useMemo, useState } from 'react'

import { createOpponentCards } from '../../../utils/characterStats'

export default function StartBattleOverlay({
  open,
  hero,
  selectedEntry,
  selectedGame,
  selectedGameId,
  scoreboardRows,
  heroLookup,
  onClose,
  onNavigate,
}) {
  const [step, setStep] = useState('preview')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!open) {
      setStep('preview')
      setProgress(0)
    }
  }, [open])

  useEffect(() => {
    if (!open || step !== 'matching') return
    setProgress(0)
    let cancelled = false
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (cancelled) return prev
        if (prev >= 100) return prev
        const next = Math.min(100, prev + 8)
        if (next === 100) {
          setTimeout(() => {
            if (!cancelled) setStep('ready')
          }, 350)
        }
        return next
      })
    }, 280)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [open, step])

  const opponentCards = useMemo(
    () => createOpponentCards(scoreboardRows, heroLookup, hero?.id),
    [scoreboardRows, heroLookup, hero?.id],
  )

  if (!open) return null

  const gameName = selectedGame?.name || selectedEntry?.game?.name || '참여 게임'

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <header style={styles.header}>
          <div>
            <h2 style={styles.title}>
              {step === 'preview' ? '매칭 준비' : step === 'matching' ? '참가자 매칭 중' : '모두 준비 완료'}
            </h2>
            <p style={styles.subtitle}>{gameName}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose()
              setStep('preview')
              setProgress(0)
            }}
            style={styles.closeButton}
          >
            닫기
          </button>
        </header>

        {step === 'preview' ? (
          <>
            <section style={styles.previewCard}>
              <div style={styles.heroSummary}>
                <div style={styles.heroPortrait}>
                  {hero?.image_url ? (
                    <img src={hero.image_url} alt={hero?.name || '내 캐릭터'} style={styles.heroImage} />
                  ) : (
                    <div style={styles.heroPlaceholder}>YOU</div>
                  )}
                </div>
                <div style={styles.heroCopy}>
                  <strong style={styles.heroName}>{hero?.name || '이름 없는 캐릭터'}</strong>
                  <span style={styles.heroRole}>
                    {selectedEntry?.role ? `${selectedEntry.role} 역할` : '참여자'}
                  </span>
                </div>
              </div>
              <p style={styles.heroHelp}>
                선택한 게임에서 함께 싸울 다른 참가자들을 확인하세요. 능력과 역할을 검토한 뒤 다시 한번
                “게임 시작”을 눌러 매칭을 진행합니다.
              </p>
            </section>

            <section style={styles.opponentList}>
              {opponentCards.length ? (
                opponentCards.map((opponent) => (
                  <article key={opponent.id} style={styles.opponentCard}>
                    <div style={styles.opponentHeader}>
                      <div style={styles.opponentPortrait}>
                        {opponent.portrait ? (
                          <img src={opponent.portrait} alt={opponent.name} style={styles.opponentImage} />
                        ) : (
                          <div style={styles.opponentPlaceholder}>VS</div>
                        )}
                      </div>
                      <div style={styles.opponentCopy}>
                        <strong style={styles.opponentName}>{opponent.name}</strong>
                        <span style={styles.opponentRole}>
                          {opponent.role ? `${opponent.role} 역할` : '참가자'}
                        </span>
                      </div>
                    </div>
                    {opponent.abilities.length ? (
                      <div style={styles.abilityList}>
                        {opponent.abilities.map((ability, index) => (
                          <div key={`${opponent.id}-ability-${index}`} style={styles.abilityChip}>
                            {ability}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div style={styles.emptyOpponents}>
                  아직 다른 참가자가 없습니다. 잠시 후 다시 시도하거나 게임 로비에서 새 전투를 만들어 보세요.
                </div>
              )}
            </section>

            <div style={styles.actionRow}>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  setStep('preview')
                  setProgress(0)
                }}
                style={styles.secondaryButton}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedGameId) {
                    alert('먼저 게임을 선택하세요.')
                    return
                  }
                  setStep('matching')
                }}
                style={styles.primaryButton}
              >
                게임 시작
              </button>
            </div>
          </>
        ) : null}

        {step === 'matching' ? (
          <section style={styles.matchingSection}>
            <div style={styles.matchingCard}>
              <strong style={styles.matchingTitle}>상대 준비 중…</strong>
              <p style={styles.matchingCopy}>
                참가자들의 전투 준비 상태를 확인하는 중입니다. 모두 준비되면 자동으로 전투 대기 화면으로 이동합니다.
              </p>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressIndicator, width: `${progress}%` }} />
              </div>
              <span style={styles.progressValue}>{progress}%</span>
            </div>
            <div style={styles.matchingList}>
              {[hero, ...opponentCards].map((entry, index) => {
                const isSelf = index === 0
                const readyThreshold = isSelf ? 20 : 60 + index * 10
                const ready = progress >= Math.min(readyThreshold, 95)
                const portrait = isSelf ? hero?.image_url : entry?.portrait
                const displayName = isSelf ? hero?.name || '이름 없는 캐릭터' : entry?.name || `참가자 ${index}`
                return (
                  <div key={isSelf ? hero?.id || 'self' : entry?.id || index} style={styles.matchingRow}>
                    <div style={styles.matchingIdentity}>
                      <div style={styles.matchingPortrait}>
                        {portrait ? (
                          <img src={portrait} alt={displayName} style={styles.matchingImage} />
                        ) : (
                          <div style={styles.matchingPlaceholder}>{isSelf ? 'YOU' : 'VS'}</div>
                        )}
                      </div>
                      <div>
                        <strong style={styles.matchingName}>{displayName}</strong>
                        <span style={styles.matchingRole}>
                          {isSelf ? '내 캐릭터' : entry?.role ? `${entry.role} 역할` : '상대방'}
                        </span>
                      </div>
                    </div>
                    <span style={{ ...styles.matchingStatus, color: ready ? '#4ade80' : '#cbd5f5' }}>
                      {ready ? '준비 완료' : '대기 중…'}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        {step === 'ready' ? (
          <section style={styles.readySection}>
            <div style={styles.readyCard}>
              <strong style={styles.readyTitle}>모든 참가자가 준비되었습니다!</strong>
              <p style={styles.readyCopy}>
                전투 준비가 끝났습니다. 아래 버튼을 눌러 게임 방으로 이동하세요. 로딩 화면에서는 각 참가자의 초상화가 표시되며 게임이 곧 시작됩니다.
              </p>
            </div>
            <div style={styles.actionRow}>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  setStep('preview')
                  setProgress(0)
                }}
                style={styles.secondaryButton}
              >
                뒤로
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate()
                  setStep('preview')
                  setProgress(0)
                }}
                style={styles.primaryButton}
              >
                전투 대기실로 이동
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2, 6, 23, 0.88)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    zIndex: 1200,
  },
  modal: {
    width: '100%',
    maxWidth: 720,
    borderRadius: 28,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'linear-gradient(180deg, rgba(15, 118, 110, 0.38) 0%, rgba(2, 6, 23, 0.94) 100%)',
    color: '#e2e8f0',
    padding: '28px 24px',
    display: 'grid',
    gap: 20,
    boxShadow: '0 50px 120px -60px rgba(56, 189, 248, 0.85)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 24,
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: 13,
    color: '#bae6fd',
  },
  closeButton: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.75)',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  previewCard: {
    borderRadius: 22,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.75)',
    padding: 18,
    display: 'grid',
    gap: 12,
  },
  heroSummary: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  heroPortrait: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: 'hidden',
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(2, 6, 23, 0.9)',
    flexShrink: 0,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#38bdf8',
    fontWeight: 700,
  },
  heroCopy: {
    display: 'grid',
    gap: 6,
  },
  heroName: {
    fontSize: 20,
  },
  heroRole: {
    fontSize: 13,
    color: '#94a3b8',
  },
  heroHelp: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
    lineHeight: 1.6,
  },
  opponentList: {
    display: 'grid',
    gap: 14,
  },
  opponentCard: {
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.7)',
    padding: 16,
    display: 'grid',
    gap: 10,
  },
  opponentHeader: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  opponentPortrait: {
    width: 60,
    height: 60,
    borderRadius: 18,
    overflow: 'hidden',
    border: '1px solid rgba(56, 189, 248, 0.25)',
    background: 'rgba(15, 23, 42, 0.9)',
    flexShrink: 0,
  },
  opponentImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  opponentPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#38bdf8',
    fontWeight: 700,
  },
  opponentCopy: {
    display: 'grid',
    gap: 4,
  },
  opponentName: {
    fontSize: 18,
  },
  opponentRole: {
    fontSize: 12,
    color: '#94a3b8',
  },
  abilityList: {
    display: 'grid',
    gap: 6,
  },
  abilityChip: {
    borderRadius: 14,
    border: '1px solid rgba(56, 189, 248, 0.25)',
    background: 'rgba(8, 47, 73, 0.65)',
    padding: '10px 12px',
    fontSize: 13,
    color: '#e0f2fe',
    lineHeight: 1.6,
  },
  emptyOpponents: {
    borderRadius: 20,
    border: '1px dashed rgba(148, 163, 184, 0.3)',
    background: 'rgba(15, 23, 42, 0.65)',
    padding: 20,
    textAlign: 'center',
    color: '#94a3b8',
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    padding: '12px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.7)',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  primaryButton: {
    padding: '12px 22px',
    borderRadius: 999,
    border: 'none',
    background: '#38bdf8',
    color: '#020617',
    fontWeight: 800,
  },
  matchingSection: {
    display: 'grid',
    gap: 18,
  },
  matchingCard: {
    borderRadius: 20,
    padding: 18,
    border: '1px solid rgba(56, 189, 248, 0.35)',
    background: 'rgba(8, 47, 73, 0.7)',
    display: 'grid',
    gap: 12,
  },
  matchingTitle: {
    fontSize: 18,
  },
  matchingCopy: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
    lineHeight: 1.6,
  },
  progressBar: {
    height: 12,
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.85)',
    overflow: 'hidden',
  },
  progressIndicator: {
    height: '100%',
    background: 'linear-gradient(90deg, rgba(14, 165, 233, 0.9), rgba(59, 130, 246, 0.9))',
    transition: 'width 0.28s ease',
  },
  progressValue: {
    fontSize: 12,
    color: '#bae6fd',
    textAlign: 'right',
  },
  matchingList: {
    display: 'grid',
    gap: 12,
  },
  matchingRow: {
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.7)',
    padding: 14,
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchingIdentity: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  matchingPortrait: {
    width: 54,
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    background: 'rgba(2, 6, 23, 0.9)',
  },
  matchingImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  matchingPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#38bdf8',
    fontWeight: 700,
  },
  matchingName: {
    fontSize: 16,
  },
  matchingRole: {
    fontSize: 12,
    color: '#94a3b8',
  },
  matchingStatus: {
    fontSize: 12,
    fontWeight: 700,
  },
  readySection: {
    display: 'grid',
    gap: 18,
  },
  readyCard: {
    borderRadius: 22,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(8, 47, 73, 0.75)',
    padding: 20,
    display: 'grid',
    gap: 12,
  },
  readyTitle: {
    fontSize: 20,
  },
  readyCopy: {
    margin: 0,
    fontSize: 13,
    color: '#bae6fd',
    lineHeight: 1.6,
  },
}

//
