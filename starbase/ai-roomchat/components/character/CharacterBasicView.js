'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'
import { updateHero } from '@/services/heroes'

const DEFAULT_HERO_NAME = '이름 없는 영웅'
const DEFAULT_DESCRIPTION =
  '소개가 아직 준비되지 않았습니다. 이미지를 한 번 더 탭하면 능력을 볼 수 있어요.'

const menuItems = [
  { key: 'character', label: '캐릭터' },
  { key: 'ranking', label: '랭킹', description: '랭킹 기능이 준비되는 대로 이곳에서 확인할 수 있어요.' },
  { key: 'search', label: '게임 검색', description: '게임 검색과 추천이 곧 추가됩니다.' },
  { key: 'friends', label: '친구', description: '친구와 길드를 관리할 수 있는 메뉴가 준비 중이에요.' },
  { key: 'guild', label: '길드', description: '길드 관리 기능이 곧 찾아옵니다.' },
  { key: 'settings', label: '설정', description: '환경 설정과 맞춤 기능이 준비되고 있어요.' },
]

const TOTAL_VIEW_STEPS = 4

function buildFormState(hero) {
  return {
    name: hero?.name || '',
    description: hero?.description || '',
    ability1: hero?.ability1 || '',
    ability2: hero?.ability2 || '',
    ability3: hero?.ability3 || '',
    ability4: hero?.ability4 || '',
    image_url: hero?.image_url || '',
    background_url: hero?.background_url || '',
    bgm_url: hero?.bgm_url || '',
  }
}

const pageStyles = {
  base: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 18px 72px',
    boxSizing: 'border-box',
    background:
      'linear-gradient(180deg, rgba(191,219,254,0.22) 0%, rgba(96,165,250,0.38) 40%, rgba(15,23,42,0.9) 100%)',
    color: '#f8fafc',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 18px 72px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    backgroundImage: `linear-gradient(180deg, rgba(191,219,254,0.24) 0%, rgba(30,58,138,0.55) 46%, rgba(15,23,42,0.82) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
}

const styles = {
  stage: {
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 28,
  },
  topMessage: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: 'rgba(190, 227, 248, 0.9)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  heroCardShell: {
    width: '100%',
    maxWidth: 520,
    position: 'relative',
  },
  heroCard: {
    position: 'relative',
    width: '100%',
    paddingTop: '160%',
    borderRadius: 36,
    overflow: 'hidden',
    border: '1px solid rgba(96,165,250,0.32)',
    background: 'rgba(15,23,42,0.62)',
    boxShadow: '0 46px 120px -60px rgba(37,99,235,0.4)',
    cursor: 'pointer',
  },
  heroImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'filter 0.3s ease',
  },
  heroFallback: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 72,
    fontWeight: 800,
    background: 'linear-gradient(135deg, rgba(30,64,175,0.45) 0%, rgba(30,41,59,0.92) 100%)',
  },
  heroNameOverlay: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '100%',
    padding: '30px 32px 36px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.65) 68%, rgba(15,23,42,0.82) 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  heroNameBadge: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  tapHint: {
    position: 'absolute',
    top: 18,
    left: 18,
    padding: '10px 16px',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.72)',
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    boxShadow: '0 18px 40px -32px rgba(15,23,42,0.9)',
  },
  overlayShade: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(2,6,23,0.12) 0%, rgba(2,6,23,0.68) 82%)',
    pointerEvents: 'none',
  },
  overlaySurface: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: '10%',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    pointerEvents: 'none',
  },
  overlayTextBlock: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.7,
    color: '#f8fafc',
    textShadow: '0 2px 12px rgba(15,23,42,0.72)',
    whiteSpace: 'pre-line',
  },
  abilityGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '12px 16px',
    borderRadius: 16,
    background: 'rgba(15,23,42,0.45)',
    border: '1px solid rgba(148,163,184,0.25)',
  },
  abilityLabel: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.12em',
    color: '#bae6fd',
  },
  abilityText: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.6,
    color: '#f8fafc',
    textShadow: '0 2px 12px rgba(15,23,42,0.72)',
    whiteSpace: 'pre-line',
  },
  cornerButton: (enabled) => ({
    position: 'absolute',
    top: 18,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.35)',
    background: enabled ? 'rgba(15,23,42,0.72)' : 'rgba(15,23,42,0.38)',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    gap: 3,
    padding: 6,
    boxShadow: '0 14px 30px -22px rgba(15,23,42,0.8)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    pointerEvents: 'auto',
  }),
  cornerDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: 'rgba(226,232,240,0.78)',
  },
  placeholderCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 28,
    padding: '36px 28px',
    background: 'rgba(15,23,42,0.72)',
    border: '1px solid rgba(96,165,250,0.24)',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    boxShadow: '0 44px 120px -60px rgba(37,99,235,0.5)',
  },
  placeholderLabel: {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
    color: '#e2e8f0',
    letterSpacing: '-0.02em',
  },
  placeholderCopy: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.7,
    color: '#cbd5f5',
  },
  menuList: {
    width: '100%',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  menuButton: (active) => ({
    flex: '1 0 120px',
    minWidth: 120,
    padding: '12px 18px',
    borderRadius: 999,
    border: '1px solid ' + (active ? 'rgba(96,165,250,0.85)' : 'rgba(148,163,184,0.35)'),
    background: active ? 'rgba(30,64,175,0.55)' : 'rgba(15,23,42,0.55)',
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0.4,
    cursor: 'pointer',
  }),
  pagination: {
    display: 'flex',
    gap: 8,
  },
  paginationDot: (active) => ({
    width: active ? 14 : 8,
    height: 8,
    borderRadius: 999,
    background: active ? '#38bdf8' : 'rgba(148,163,184,0.45)',
    transition: 'all 0.25s ease',
  }),
  editBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2,6,23,0.72)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 20,
  },
  editDialog: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 28,
    background: 'rgba(15,23,42,0.95)',
    border: '1px solid rgba(96,165,250,0.24)',
    padding: '28px 26px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    color: '#f8fafc',
    boxShadow: '0 48px 140px -60px rgba(37,99,235,0.6)',
  },
  editTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.01em',
  },
  editField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#bae6fd',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  editInput: {
    width: '100%',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.35)',
    padding: '10px 14px',
    fontSize: 15,
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
  },
  editTextarea: {
    width: '100%',
    minHeight: 96,
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.35)',
    padding: '12px 14px',
    fontSize: 15,
    lineHeight: 1.6,
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    resize: 'vertical',
  },
  editActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 6,
  },
  secondaryButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryButton: {
    padding: '10px 20px',
    borderRadius: 999,
    border: '1px solid rgba(56,189,248,0.55)',
    background: 'linear-gradient(135deg, rgba(59,130,246,0.85) 0%, rgba(56,189,248,0.85) 100%)',
    color: '#0f172a',
    fontWeight: 700,
    cursor: 'pointer',
  },
}

export default function CharacterBasicView({ hero, onHeroUpdated }) {
  const heroName = useMemo(() => {
    if (!hero) return DEFAULT_HERO_NAME
    const trimmed = typeof hero.name === 'string' ? hero.name.trim() : ''
    return trimmed || DEFAULT_HERO_NAME
  }, [hero])

  const description = useMemo(() => {
    if (!hero) return DEFAULT_DESCRIPTION
    const text = typeof hero.description === 'string' ? hero.description.trim() : ''
    return text || DEFAULT_DESCRIPTION
  }, [hero])

  const abilities = useMemo(() => {
    const normalise = (value) => (typeof value === 'string' ? value.trim() : '')
    return {
      one: normalise(hero?.ability1),
      two: normalise(hero?.ability2),
      three: normalise(hero?.ability3),
      four: normalise(hero?.ability4),
    }
  }, [hero])

  const [viewMode, setViewMode] = useState(0)
  const [activeMenu, setActiveMenu] = useState('character')
  const [isEditing, setIsEditing] = useState(false)
  const [formState, setFormState] = useState(() => buildFormState(hero))
  const [saving, setSaving] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)

  useEffect(() => {
    setViewMode(0)
    setActiveMenu('character')
    setIsEditing(false)
    setFormState(buildFormState(hero))
  }, [hero])

  useEffect(() => {
    let mounted = true
    const resolveUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) {
          console.error('Failed to resolve authenticated user:', error)
          return
        }
        if (!mounted) return
        setCurrentUserId(data?.user?.id || null)
      } catch (error) {
        console.error('Unexpected error while resolving user:', error)
      }
    }

    resolveUser()

    return () => {
      mounted = false
    }
  }, [])

  const audioRef = useRef(null)
  useEffect(() => {
    if (!hero?.bgm_url) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
      return
    }

    const audio = new Audio(hero.bgm_url)
    audio.loop = true
    audioRef.current = audio

    const tryPlay = async () => {
      try {
        await audio.play()
      } catch (error) {
        console.warn('Failed to autoplay character BGM', error)
      }
    }

    tryPlay()

    return () => {
      audio.pause()
      audio.currentTime = 0
      audioRef.current = null
    }
  }, [hero?.bgm_url])

  const backgroundStyle = hero?.background_url
    ? pageStyles.withBackground(hero.background_url)
    : pageStyles.base

  const isOverlayActive = viewMode > 0

  const imageStyle = {
    ...styles.heroImage,
    filter: isOverlayActive ? 'brightness(0.55)' : 'none',
  }

  const cycleViewMode = useCallback(() => {
    setViewMode((prev) => (prev + 1) % TOTAL_VIEW_STEPS)
  }, [])

  const handleTap = useCallback(() => {
    cycleViewMode()
  }, [cycleViewMode])

  const handleMenuSelect = useCallback((key) => {
    setActiveMenu(key)
  }, [])

  const canEdit = Boolean(hero?.owner_id && currentUserId && hero.owner_id === currentUserId)

  const handleOpenEdit = useCallback(
    (event) => {
      event?.stopPropagation?.()
      if (!canEdit) {
        alert('이 캐릭터를 수정할 수 있는 권한이 없습니다.')
        return
      }
      setFormState(buildFormState(hero))
      setIsEditing(true)
    },
    [canEdit, hero],
  )

  const handleChangeField = useCallback((key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleCloseEdit = useCallback(() => {
    setIsEditing(false)
    setFormState(buildFormState(hero))
  }, [hero])

  const handleSubmitEdit = useCallback(
    async (event) => {
      event.preventDefault()
      if (!hero?.id) return
      if (!canEdit) {
        alert('이 캐릭터를 수정할 수 있는 권한이 없습니다.')
        return
      }

      const payload = {
        name: formState.name.trim() || DEFAULT_HERO_NAME,
        description: formState.description.trim(),
        ability1: formState.ability1.trim(),
        ability2: formState.ability2.trim(),
        ability3: formState.ability3.trim(),
        ability4: formState.ability4.trim(),
        image_url: formState.image_url.trim() || null,
        background_url: formState.background_url.trim() || null,
        bgm_url: formState.bgm_url.trim() || null,
      }

      setSaving(true)
      try {
        await updateHero(hero.id, payload)
        setSaving(false)
        setIsEditing(false)
        if (typeof onHeroUpdated === 'function') {
          onHeroUpdated()
        }
      } catch (error) {
        console.error('Failed to update hero:', error)
        alert('캐릭터 정보를 저장하는 중 문제가 발생했습니다. 다시 시도해 주세요.')
        setSaving(false)
      }
    },
    [canEdit, formState, hero, onHeroUpdated],
  )

  const placeholder = useMemo(() => {
    if (activeMenu === 'character') return null
    return menuItems.find((item) => item.key === activeMenu) || null
  }, [activeMenu])

  return (
    <div style={backgroundStyle}>
      <div style={styles.stage}>
        <p style={styles.topMessage}>아래 메뉴를 눌러 원하는 화면으로 이동할 수 있어요.</p>

        <div style={styles.heroCardShell}>
          <div
            role="button"
            tabIndex={0}
            style={styles.heroCard}
            onClick={handleTap}
            onKeyUp={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                handleTap()
              }
            }}
          >
            <button
              type="button"
              onClick={handleOpenEdit}
              style={styles.cornerButton(canEdit)}
              aria-label="캐릭터 정보 수정"
              disabled={!canEdit}
            >
              {Array.from({ length: 9 }).map((_, index) => (
                <span key={`dot-${index}`} style={styles.cornerDot} />
              ))}
            </button>

            {hero?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero.image_url} alt={heroName} style={imageStyle} />
            ) : (
              <div style={styles.heroFallback}>{heroName.slice(0, 2)}</div>
            )}

            {isOverlayActive ? <div style={styles.overlayShade} aria-hidden="true" /> : null}

            {viewMode === 0 ? (
              <div style={styles.heroNameOverlay}>
                <p style={styles.heroNameBadge}>{heroName}</p>
              </div>
            ) : null}

            {viewMode === 1 ? (
              <div style={{ ...styles.overlaySurface, pointerEvents: 'none' }}>
                <p style={styles.overlayTextBlock}>{description}</p>
              </div>
            ) : null}

            {viewMode === 2 ? (
              <div style={{ ...styles.overlaySurface, gap: 18 }}>
                {abilities.one || abilities.two ? (
                  <>
                    <div style={styles.abilityGroup}>
                      <span style={styles.abilityLabel}>능력 1</span>
                      <p style={styles.abilityText}>
                        {abilities.one || '능력 1 정보가 등록되지 않았습니다.'}
                      </p>
                    </div>
                    <div style={styles.abilityGroup}>
                      <span style={styles.abilityLabel}>능력 2</span>
                      <p style={styles.abilityText}>
                        {abilities.two || '능력 2 정보가 등록되지 않았습니다.'}
                      </p>
                    </div>
                  </>
                ) : (
                  <p style={styles.overlayTextBlock}>능력 1과 2 정보가 등록되지 않았습니다.</p>
                )}
              </div>
            ) : null}

            {viewMode === 3 ? (
              <div style={{ ...styles.overlaySurface, gap: 18 }}>
                {abilities.three || abilities.four ? (
                  <>
                    <div style={styles.abilityGroup}>
                      <span style={styles.abilityLabel}>능력 3</span>
                      <p style={styles.abilityText}>
                        {abilities.three || '능력 3 정보가 등록되지 않았습니다.'}
                      </p>
                    </div>
                    <div style={styles.abilityGroup}>
                      <span style={styles.abilityLabel}>능력 4</span>
                      <p style={styles.abilityText}>
                        {abilities.four || '능력 4 정보가 등록되지 않았습니다.'}
                      </p>
                    </div>
                  </>
                ) : (
                  <p style={styles.overlayTextBlock}>능력 3과 4 정보가 등록되지 않았습니다.</p>
                )}
              </div>
            ) : null}

            <div style={styles.tapHint} aria-hidden="true">
              탭해서 정보 보기
            </div>
          </div>
        </div>

        {placeholder ? (
          <div style={styles.placeholderCard}>
            <p style={styles.placeholderLabel}>{placeholder.label}</p>
            <p style={styles.placeholderCopy}>{placeholder.description}</p>
          </div>
        ) : null}

        <div style={styles.menuList}>
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              style={styles.menuButton(activeMenu === item.key)}
              onClick={() => handleMenuSelect(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={styles.pagination} aria-hidden="true">
          {menuItems.map((item) => (
            <span key={item.key} style={styles.paginationDot(activeMenu === item.key)} />
          ))}
        </div>
      </div>

      {isEditing ? (
        <div style={styles.editBackdrop} role="dialog" aria-modal="true">
          <form style={styles.editDialog} onSubmit={handleSubmitEdit}>
            <h2 style={styles.editTitle}>캐릭터 정보 수정</h2>

            <div style={styles.editField}>
              <label style={styles.editLabel} htmlFor="hero-edit-name">
                이름
              </label>
              <input
                id="hero-edit-name"
                type="text"
                style={styles.editInput}
                value={formState.name}
                onChange={(event) => handleChangeField('name', event.target.value)}
                required
              />
            </div>

            <div style={styles.editField}>
              <label style={styles.editLabel} htmlFor="hero-edit-description">
                설명
              </label>
              <textarea
                id="hero-edit-description"
                style={styles.editTextarea}
                value={formState.description}
                onChange={(event) => handleChangeField('description', event.target.value)}
              />
            </div>

            <div style={styles.editField}>
              <label style={styles.editLabel} htmlFor="hero-edit-ability1">
                능력 1
              </label>
              <textarea
                id="hero-edit-ability1"
                style={styles.editTextarea}
                value={formState.ability1}
                onChange={(event) => handleChangeField('ability1', event.target.value)}
              />
            </div>

            <div style={styles.editField}>
              <label style={styles.editLabel} htmlFor="hero-edit-ability2">
                능력 2
              </label>
              <textarea
                id="hero-edit-ability2"
                style={styles.editTextarea}
                value={formState.ability2}
                onChange={(event) => handleChangeField('ability2', event.target.value)}
              />
            </div>

            <div style={styles.editField}>
              <label style={styles.editLabel} htmlFor="hero-edit-ability3">
                능력 3
              </label>
              <textarea
                id="hero-edit-ability3"
                style={styles.editTextarea}
                value={formState.ability3}
                onChange={(event) => handleChangeField('ability3', event.target.value)}
              />
            </div>

            <div style={styles.editField}>
              <label style={styles.editLabel} htmlFor="hero-edit-ability4">
                능력 4
              </label>
              <textarea
                id="hero-edit-ability4"
                style={styles.editTextarea}
                value={formState.ability4}
                onChange={(event) => handleChangeField('ability4', event.target.value)}
              />
            </div>

            <div style={styles.editField}>
              <label style={styles.editLabel} htmlFor="hero-edit-image">
                캐릭터 이미지 URL
              </label>
              <input
                id="hero-edit-image"
                type="url"
                style={styles.editInput}
                value={formState.image_url}
                onChange={(event) => handleChangeField('image_url', event.target.value)}
              />
            </div>

            <div style={styles.editField}>
              <label style={styles.editLabel} htmlFor="hero-edit-background">
                배경 이미지 URL
              </label>
              <input
                id="hero-edit-background"
                type="url"
                style={styles.editInput}
                value={formState.background_url}
                onChange={(event) => handleChangeField('background_url', event.target.value)}
              />
            </div>

            <div style={styles.editField}>
              <label style={styles.editLabel} htmlFor="hero-edit-bgm">
                브금 URL
              </label>
              <input
                id="hero-edit-bgm"
                type="url"
                style={styles.editInput}
                value={formState.bgm_url}
                onChange={(event) => handleChangeField('bgm_url', event.target.value)}
              />
            </div>

            <div style={styles.editActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={handleCloseEdit}
                disabled={saving}
              >
                취소
              </button>
              <button type="submit" style={styles.primaryButton} disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
