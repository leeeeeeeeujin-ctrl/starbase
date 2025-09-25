import React, { useEffect, useMemo, useState } from 'react'

export default function CharacterDashboard({
  hero,
  heroName,
  edit,
  onChangeEdit,
  saving,
  onSave,
  onDelete,
  backgroundPreview,
  backgroundError,
  onBackgroundUpload,
  onClearBackground,
  backgroundInputRef,
  bgmBlob,
  bgmLabel,
  bgmDuration,
  bgmError,
  onBgmUpload,
  onClearBgm,
  bgmInputRef,
  abilityCards,
  onAddAbility,
  onReverseAbilities,
  onClearAbility,
  statSlides,
  selectedGameId,
  onSelectGame,
  participations,
  selectedGame,
  selectedEntry,
  selectedScoreboard,
  heroLookup,
  battleSummary,
  battleDetails,
  visibleBattles,
  onShowMoreBattles,
  battleLoading,
  battleError,
  onStartBattle,
  onBack,
  onGoLobby,
}) {
  const [statPageIndex, setStatPageIndex] = useState(0)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState('')

  useEffect(() => {
    if (!bgmBlob) {
      setAudioPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(bgmBlob)
    setAudioPreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [bgmBlob])

  const statPages = useMemo(() => {
    if (!statSlides?.length) return []
    const pages = []
    for (let index = 0; index < statSlides.length; index += 6) {
      pages.push(statSlides.slice(index, index + 6))
    }
    return pages
  }, [statSlides])

  useEffect(() => {
    if (!statPages.length) {
      if (statPageIndex !== 0) setStatPageIndex(0)
      return
    }
    if (statPageIndex >= statPages.length) {
      setStatPageIndex(statPages.length - 1)
    }
  }, [statPageIndex, statPages])

  useEffect(() => {
    if (!statSlides?.length) return
    if (!selectedGameId) {
      onSelectGame(statSlides[0].key)
      return
    }
    const targetIndex = statPages.findIndex((page) => page.some((slide) => slide.key === selectedGameId))
    if (targetIndex >= 0 && targetIndex !== statPageIndex) {
      setStatPageIndex(targetIndex)
    }
  }, [statSlides, statPages, selectedGameId, statPageIndex, onSelectGame])

  const visibleStatSlides = statPages.length
    ? statPages[Math.min(statPageIndex, statPages.length - 1)]
    : statSlides
  const audioSource = audioPreviewUrl || edit.bgm_url || ''
  const hasParticipations = Boolean(statSlides?.length)
  const participatingCount = participations?.length || 0
  const scoreboardRows = selectedScoreboard || []
  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: '#020617',
        color: '#e2e8f0',
        fontFamily: '"Noto Sans CJK KR", sans-serif',
      }}
    >
      {hero?.background_url || backgroundPreview ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundImage: `url(${backgroundPreview || hero?.background_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(28px)',
            opacity: 0.5,
            zIndex: 0,
          }}
        />
      ) : null}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '32px 24px 120px',
          maxWidth: 1320,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 380px) 1fr',
            gap: 28,
            alignItems: 'start',
          }}
        >
          <aside style={{ display: 'grid', gap: 24 }}>
            <div
              style={{
                position: 'relative',
                borderRadius: 32,
                overflow: 'hidden',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(15, 23, 42, 0.82)',
                boxShadow: '0 35px 120px -60px rgba(15, 118, 110, 0.65)',
              }}
            >
              {hero?.background_url || backgroundPreview ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `url(${backgroundPreview || hero?.background_url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: 0.45,
                  }}
                />
              ) : null}
              <div
                style={{
                  position: 'relative',
                  padding: 28,
                  display: 'grid',
                  gap: 18,
                  background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.8) 0%, rgba(2, 6, 23, 0.95) 100%)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>영웅 정보</span>
                    <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.3 }}>{heroName}</h1>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setShowEditPanel(true)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 999,
                        border: '1px solid rgba(56, 189, 248, 0.6)',
                        background: 'rgba(56, 189, 248, 0.18)',
                        color: '#38bdf8',
                        fontWeight: 700,
                      }}
                    >
                      프로필 편집
                    </button>
                    <button
                      type="button"
                      onClick={onSave}
                      disabled={saving}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 999,
                        border: 'none',
                        background: saving ? 'rgba(59, 130, 246, 0.35)' : '#3b82f6',
                        color: '#e0f2fe',
                        fontWeight: 700,
                        minWidth: 96,
                      }}
                    >
                      {saving ? '저장 중…' : '저장'}
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 999,
                        border: '1px solid rgba(248, 113, 113, 0.45)',
                        background: 'rgba(248, 113, 113, 0.15)',
                        color: '#fecaca',
                        fontWeight: 700,
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    position: 'relative',
                    borderRadius: 28,
                    overflow: 'hidden',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    background: 'rgba(15, 23, 42, 0.65)',
                    minHeight: 360,
                  }}
                >
                  {hero?.image_url ? (
                    <img
                      src={hero.image_url}
                      alt={heroName}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#38bdf8',
                        fontWeight: 700,
                      }}
                    >
                      이미지 없음
                    </div>
                  )}
                </div>
                {audioSource ? (
                  <div
                    style={{
                      borderRadius: 22,
                      padding: '12px 16px',
                      background: 'rgba(15, 23, 42, 0.75)',
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>배경 음악</div>
                    <audio controls src={audioSource} style={{ width: '100%' }} />
                    {bgmDuration != null ? (
                      <span style={{ fontSize: 12, color: '#bae6fd' }}>재생 시간: {bgmDuration}초</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {statPages.length > 1 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {statPages.map((_, index) => {
                  const active = index === statPageIndex
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setStatPageIndex(index)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        border: active ? 'none' : '1px solid rgba(148, 163, 184, 0.4)',
                        background: active ? '#38bdf8' : 'rgba(15, 23, 42, 0.65)',
                        color: active ? '#020617' : '#e2e8f0',
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {index + 1}
                    </button>
                  )
                })}
              </div>
            ) : null}

            <div
              style={{
                borderRadius: 28,
                border: '1px solid rgba(148, 163, 184, 0.25)',
                background: 'rgba(15, 23, 42, 0.75)',
                padding: 18,
                display: 'grid',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>게임별 지표</h2>
                {hasParticipations && selectedEntry ? (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{selectedEntry.game?.name || '—'}</span>
                ) : null}
              </div>
              {hasParticipations ? (
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    overflowX: 'auto',
                    paddingBottom: 6,
                  }}
                >
                  {visibleStatSlides.map((slide) => {
                    const active = slide.key === selectedGameId
                    return (
                      <button
                        key={slide.key}
                        type="button"
                        onClick={() => onSelectGame(slide.key)}
                        style={{
                          minWidth: 240,
                          borderRadius: 24,
                          padding: 18,
                          border: active
                            ? '1px solid rgba(56, 189, 248, 0.65)'
                            : '1px solid rgba(148, 163, 184, 0.3)',
                          background: active
                            ? 'linear-gradient(180deg, rgba(14, 165, 233, 0.35) 0%, rgba(15, 23, 42, 0.95) 100%)'
                            : 'rgba(15, 23, 42, 0.6)',
                          color: '#f8fafc',
                          textAlign: 'left',
                          display: 'grid',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'grid', gap: 4 }}>
                          <strong style={{ fontSize: 16 }}>{slide.name}</strong>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{slide.role ? `${slide.role} 역할` : '참여 게임'}</span>
                        </div>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {slide.stats.map((stat) => (
                            <div
                              key={stat.key}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: 14,
                              }}
                            >
                              <span style={{ color: '#94a3b8' }}>{stat.label}</span>
                              <strong style={{ fontSize: 16 }}>{stat.value}</strong>
                            </div>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: 20,
                    textAlign: 'center',
                    color: '#94a3b8',
                    borderRadius: 18,
                    border: '1px dashed rgba(148, 163, 184, 0.35)',
                  }}
                >
                  아직 참가한 게임이 없습니다.
                </div>
              )}
            </div>
          </aside>
          <main style={{ display: 'grid', gap: 24 }}>
            <section
              style={{
                borderRadius: 28,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(15, 23, 42, 0.78)',
                padding: 24,
                display: 'grid',
                gap: 18,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 22 }}>즉시 전투</h2>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>선택한 게임에서 바로 전투를 시작합니다.</span>
                </div>
                {selectedEntry ? (
                  <div style={{ textAlign: 'right', fontSize: 13, color: '#bae6fd' }}>
                    {selectedEntry.game?.name || selectedEntry.role || selectedEntry.game_id}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                <div style={{ borderRadius: 20, padding: 14, background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(148, 163, 184, 0.25)' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>최근 전투</span>
                  <strong style={{ display: 'block', marginTop: 6, fontSize: 18 }}>{battleSummary.total}</strong>
                </div>
                <div style={{ borderRadius: 20, padding: 14, background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(148, 163, 184, 0.25)' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>승률</span>
                  <strong style={{ display: 'block', marginTop: 6, fontSize: 18 }}>
                    {battleSummary.rate != null ? `${battleSummary.rate}%` : '—'}
                  </strong>
                </div>
                <div style={{ borderRadius: 20, padding: 14, background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(148, 163, 184, 0.25)' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>승 / 패 / 무</span>
                  <strong style={{ display: 'block', marginTop: 6, fontSize: 18 }}>
                    {`${battleSummary.wins}/${battleSummary.losses}/${battleSummary.draws}`}
                  </strong>
                </div>
              </div>
              <button
                type="button"
                onClick={onStartBattle}
                disabled={!selectedGameId}
                style={{
                  marginTop: 4,
                  padding: '16px 20px',
                  borderRadius: 999,
                  border: 'none',
                  background: selectedGameId ? '#22d3ee' : 'rgba(148, 163, 184, 0.35)',
                  color: selectedGameId ? '#0f172a' : '#1e293b',
                  fontWeight: 800,
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  cursor: selectedGameId ? 'pointer' : 'not-allowed',
                }}
              >
                <span role="img" aria-label="battle">⚔️</span> 게임 시작
              </button>
            </section>

            <section
              style={{
                borderRadius: 28,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(15, 23, 42, 0.78)',
                padding: 24,
                display: 'grid',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>게임 목록</h2>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{participatingCount}개 참여</span>
              </div>
              {participatingCount ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {participations.map((row) => {
                    const active = row.game_id === selectedGameId
                    const gameName = row.game?.name || '이름 없는 게임'
                    return (
                      <button
                        key={`${row.game_id}:${row.owner_id}`}
                        type="button"
                        onClick={() => onSelectGame(row.game_id)}
                        style={{
                          display: 'grid',
                          gap: 6,
                          textAlign: 'left',
                          borderRadius: 20,
                          padding: 16,
                          border: active
                            ? '1px solid rgba(56, 189, 248, 0.65)'
                            : '1px solid rgba(148, 163, 184, 0.25)',
                          background: active ? 'rgba(8, 47, 73, 0.85)' : 'rgba(30, 41, 59, 0.6)',
                          color: '#e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: 18 }}>{gameName}</strong>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            {new Date(row.updated_at || row.created_at || 0).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#bae6fd' }}>
                          <span>{row.role || '역할 미정'}</span>
                          <span>레이팅 {row.rating ?? row.score ?? '—'}</span>
                          <span>전투 {row.battles ?? 0}회</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: 20,
                    textAlign: 'center',
                    color: '#94a3b8',
                    borderRadius: 18,
                    border: '1px dashed rgba(148, 163, 184, 0.35)',
                  }}
                >
                  참가한 게임이 없습니다.
                </div>
              )}
            </section>
            <section
              style={{
                borderRadius: 28,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(15, 23, 42, 0.78)',
                padding: 24,
                display: 'grid',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>랭킹</h2>
                {selectedEntry ? (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{selectedEntry.game?.name || '—'}</span>
                ) : null}
              </div>
              {scoreboardRows.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {scoreboardRows.map((row, index) => {
                    const highlight = row.hero_id === hero?.id
                    const displayName = heroLookup[row.hero_id]?.name || row.role || `참가자 ${index + 1}`
                    return (
                      <div
                        key={row.id || `${row.hero_id}-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'auto 1fr auto',
                          alignItems: 'center',
                          gap: 14,
                          borderRadius: 20,
                          padding: 14,
                          background: highlight ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                          border: highlight
                            ? '1px solid rgba(56, 189, 248, 0.55)'
                            : '1px solid rgba(148, 163, 184, 0.25)',
                        }}
                      >
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: '50%',
                            background: 'rgba(8, 47, 73, 0.85)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                          }}
                        >
                          #{index + 1}
                        </div>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <strong>{displayName}</strong>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{row.role || '—'}</span>
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 700 }}>{row.rating ?? row.score ?? '—'}</div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: 20,
                    textAlign: 'center',
                    color: '#94a3b8',
                    borderRadius: 18,
                    border: '1px dashed rgba(148, 163, 184, 0.35)',
                  }}
                >
                  선택한 게임의 랭킹 데이터가 없습니다.
                </div>
              )}
            </section>

            <section
              style={{
                borderRadius: 28,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(15, 23, 42, 0.78)',
                padding: 24,
                display: 'grid',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>베틀로그</h2>
                {battleDetails.length ? (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{battleDetails.length}회 기록</span>
                ) : null}
              </div>
              {battleLoading ? (
                <div style={{ padding: 20, color: '#94a3b8' }}>전투 로그를 불러오는 중…</div>
              ) : battleDetails.length ? (
                <div style={{ display: 'grid', gap: 16 }}>
                  {battleDetails.slice(0, visibleBattles).map((battle) => (
                    <div
                      key={battle.id}
                      style={{
                        borderRadius: 20,
                        padding: 16,
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        background: 'rgba(30, 41, 59, 0.6)',
                        display: 'grid',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{new Date(battle.created_at || 0).toLocaleString()}</strong>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{(battle.result || '').toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#cbd5f5' }}>점수 변화: {battle.score_delta ?? 0}</div>
                      {battle.logs?.length ? (
                        <div style={{ display: 'grid', gap: 8, fontSize: 12, color: '#e2e8f0' }}>
                          {battle.logs.map((log) => (
                            <div key={`${log.battle_id}-${log.turn_no}`} style={{ display: 'grid', gap: 4 }}>
                              <strong style={{ color: '#38bdf8' }}>턴 {log.turn_no}</strong>
                              <div>프롬프트: {log.prompt}</div>
                              <div>응답: {log.ai_response}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {visibleBattles < battleDetails.length ? (
                    <button
                      type="button"
                      onClick={onShowMoreBattles}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 999,
                        border: '1px solid rgba(56, 189, 248, 0.45)',
                        background: 'rgba(56, 189, 248, 0.12)',
                        color: '#38bdf8',
                        fontWeight: 700,
                        justifySelf: 'center',
                      }}
                    >
                      더 보기
                    </button>
                  ) : null}
                </div>
              ) : (
                <div
                  style={{
                    padding: 20,
                    textAlign: 'center',
                    color: '#94a3b8',
                    borderRadius: 18,
                    border: '1px dashed rgba(148, 163, 184, 0.35)',
                  }}
                >
                  아직 전투 기록이 없습니다.
                </div>
              )}
              {battleError && <div style={{ color: '#f87171', fontSize: 12 }}>{battleError}</div>}
            </section>
          </main>
        </div>
      </div>
      <footer
        style={{
          position: 'fixed',
          left: 0,
          bottom: 0,
          width: '100%',
          background: 'rgba(2, 6, 23, 0.92)',
          borderTop: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          backdropFilter: 'blur(6px)',
          zIndex: 5,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '10px 18px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.75)',
            color: '#e2e8f0',
            fontWeight: 600,
          }}
        >
          ← 뒤로가기
        </button>
        <button
          type="button"
          onClick={onGoLobby}
          style={{
            padding: '10px 24px',
            borderRadius: 999,
            border: 'none',
            background: '#38bdf8',
            color: '#020617',
            fontWeight: 800,
          }}
        >
          로비로 이동
        </button>
      </footer>

      {showEditPanel ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.88)',
            zIndex: 10,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '32px 16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 960,
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 32,
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'rgba(2, 6, 23, 0.96)',
              padding: 28,
              display: 'grid',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 24 }}>프로필 편집</h2>
              <button
                type="button"
                onClick={() => setShowEditPanel(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: '#e2e8f0',
                  fontWeight: 600,
                }}
              >
                닫기
              </button>
            </div>
            <div style={{ display: 'grid', gap: 18 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>캐릭터 이름</span>
                <input
                  value={edit.name}
                  onChange={(event) => onChangeEdit('name', event.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>설명</span>
                <textarea
                  value={edit.description}
                  onChange={(event) => onChangeEdit('description', event.target.value)}
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 160 }}
                  placeholder="캐릭터의 배경과 개성을 소개해 주세요."
                />
              </label>
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  borderRadius: 24,
                  padding: 18,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.6)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>배경 이미지</div>
                <div
                  style={{
                    width: '100%',
                    minHeight: 140,
                    borderRadius: 16,
                    border: '1px dashed rgba(148, 163, 184, 0.35)',
                    background: 'rgba(15, 23, 42, 0.45)',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {backgroundPreview ? (
                    <img
                      src={backgroundPreview}
                      alt="배경 미리보기"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>등록된 배경이 없습니다.</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => backgroundInputRef.current?.click()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: '#38bdf8',
                      color: '#0f172a',
                      fontWeight: 700,
                    }}
                  >
                    배경 업로드
                  </button>
                  <button
                    type="button"
                    onClick={onClearBackground}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: 'rgba(148, 163, 184, 0.25)',
                      color: '#e2e8f0',
                      fontWeight: 600,
                    }}
                  >
                    배경 제거
                  </button>
                </div>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => onBackgroundUpload(event.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                {backgroundError && <div style={{ color: '#fca5a5', fontSize: 12 }}>{backgroundError}</div>}
              </div>
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  borderRadius: 24,
                  padding: 18,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.6)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>배경 음악</div>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                  {bgmLabel || (edit.bgm_url ? edit.bgm_url.split('/').pop() : '등록된 BGM이 없습니다.')}
                </div>
                {bgmDuration != null && (
                  <div style={{ fontSize: 12, color: '#38bdf8' }}>재생 시간: {bgmDuration}초</div>
                )}
                <div style={{ fontSize: 12, color: '#cbd5f5' }}>
                  MP3 등 스트리밍형 오디오만 지원하며 WAV 형식과 4분을 초과하는 곡은 사용할 수 없습니다.
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => bgmInputRef.current?.click()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: '#fb7185',
                      color: '#0f172a',
                      fontWeight: 700,
                    }}
                  >
                    음악 업로드
                  </button>
                  <button
                    type="button"
                    onClick={onClearBgm}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: 'rgba(148, 163, 184, 0.25)',
                      color: '#e2e8f0',
                      fontWeight: 600,
                    }}
                  >
                    음악 제거
                  </button>
                </div>
                <input
                  ref={bgmInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(event) => onBgmUpload(event.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                {bgmError && <div style={{ color: '#fca5a5', fontSize: 12 }}>{bgmError}</div>}
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                {abilityCards.map((ability, index) => (
                  <div
                    key={ability.key}
                    style={{
                      borderRadius: 24,
                      padding: 18,
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      background: 'linear-gradient(180deg, rgba(30, 64, 175, 0.28) 0%, rgba(15, 23, 42, 0.92) 100%)',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700 }}>능력 {index + 1}</span>
                      {ability.value ? (
                        <button
                          type="button"
                          onClick={() => onClearAbility(ability.key)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: '1px solid rgba(248, 113, 113, 0.4)',
                            background: 'rgba(248, 113, 113, 0.16)',
                            color: '#fecaca',
                            fontWeight: 600,
                          }}
                        >
                          삭제
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      value={ability.value}
                      onChange={(event) => onChangeEdit(ability.key, event.target.value)}
                      rows={4}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 140 }}
                      placeholder="능력 설명을 입력하세요."
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={onAddAbility}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 999,
                      border: '1px solid rgba(56, 189, 248, 0.55)',
                      background: 'rgba(56, 189, 248, 0.18)',
                      color: '#38bdf8',
                      fontWeight: 700,
                    }}
                  >
                    능력 생성
                  </button>
                  <button
                    type="button"
                    onClick={onReverseAbilities}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 999,
                      border: '1px solid rgba(148, 163, 184, 0.4)',
                      background: 'rgba(15, 23, 42, 0.65)',
                      color: '#e2e8f0',
                      fontWeight: 700,
                    }}
                  >
                    능력 순서 수정
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 18,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#e2e8f0',
  fontSize: 15,
  lineHeight: 1.6,
}

//
