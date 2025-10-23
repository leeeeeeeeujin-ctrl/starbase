"use client"

import Link from 'next/link'import { useCallback, useEffect, useMemo, useRef, useState } from 'react'import { createPortal } from 'react-dom'import { supabase } from '@/lib/supabase'import { withTable } from '@/lib/supabaseTables'import { getHeroAudioManager } from '@/lib/audio/heroAudioManager'import { sanitizeFileName } from '@/utils/characterAssets'
import CharacterPlayPanel from './CharacterPlayPanel'
import useHeroParticipations from '@/hooks/character/useHeroParticipations'
import useHeroBattles from '@/hooks/character/useHeroBattles'import { formatPlayNumber, formatPlayWinRate, formatWinRateValue } from '@/utils/characterPlayFormatting'import { clearSharedBackgroundUrl, writeSharedBackgroundUrl } from '@/hooks/shared/useSharedPromptSetStorage'import useHeroProfileInfo, { DEFAULT_HERO_NAME } from '@/hooks/character/useHeroProfileInfo'
import useParticipationCarousel from '@/hooks/character/useParticipationCarousel'
import useInfoSlider from '@/hooks/character/useInfoSlider'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_BACKGROUND_SIZE = 8 * 1024 * 1024
const MAX_AUDIO_SIZE = 12 * 1024 * 1024
const MAX_AUDIO_DURATION = 5 * 60
const AUDIO_SETTINGS_COOKIE = 'hero-audio-settings'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

const readCookie = (name) => {
  if (typeof document === 'undefined') return null
  const cookies = document.cookie.split(';').map((entry) => entry.trim())
  const target = cookies.find((entry) => entry.startsWith(`${name}=`))
  if (!target) return null
  try {
    return decodeURIComponent(target.split('=').slice(1).join('='))
  } catch (error) {
    console.error(error)
    return null
  }
}

const writeCookie = (name, value) => {
  if (typeof document === 'undefined') return
  const expires = `max-age=${COOKIE_MAX_AGE}`
  document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/`
}

const pageStyles = {
  base: {
    minHeight: '100dvh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 12px 168px',
    boxSizing: 'border-box',
    background:
      'linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.82) 45%, rgba(15,23,42,0.92) 100%)',
    color: '#f8fafc',
  },
  withBackground: (imageUrl) => ({
    minHeight: '100dvh',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 12px 168px',
    boxSizing: 'border-box',
    color: '#f8fafc',
    backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.78) 60%, rgba(15,23,42,0.9) 100%), url(${imageUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }),
}

const overlayTabs = [
  { key: 'create', label: '게임 제작' },
  { key: 'register', label: '게임 등록' },
  { key: 'ranking', label: '랭킹' },
  { key: 'settings', label: '설정' },
]

const styles = {
  stage: {
    width: '100%',
    maxWidth: 560,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 18,
  },
  heroCardShell: {
    width: '100%',
    maxWidth: 500,
    position: 'relative',
  },
  heroCard: {
    position: 'relative',
    width: '100%',
    paddingTop: '146%',
    borderRadius: 30,
    overflow: 'hidden',
    border: '1px solid rgba(96,165,250,0.32)',
    background: 'rgba(15,23,42,0.62)',
    boxShadow: '0 46px 120px -60px rgba(37,99,235,0.4)',
    cursor: 'pointer',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
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
    padding: '24px 26px 30px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,0.65) 68%, rgba(15,23,42,0.82) 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  heroNameBadge: {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  tapHint: {
    position: 'absolute',
    top: 18,
    right: 18,
    padding: '10px 16px',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.72)',
    color: '#bae6fd',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    boxShadow: '0 18px 40px -32px rgba(15,23,42,0.9)',
  },
  overlaySurface: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '18%',
    bottom: '14%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    pointerEvents: 'auto',
  },
  overlayContent: {
    width: '100%',
    maxHeight: '100%',
    padding: '12px 10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    overflowY: 'auto',
  },
  overlayHeading: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: '#e0f2fe',
    textShadow: '0 2px 12px rgba(15,23,42,0.72)',
  },
  overlayTextBlock: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.7,
    color: '#f8fafc',
    textShadow: '0 2px 12px rgba(15,23,42,0.72)',
    whiteSpace: 'pre-line',
    textAlign: 'center',
  },
  overlayStatsGrid: {
    width: '100%',
    display: 'grid',
    gap: 12,
  },
  overlayStatsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 12,
  },
  overlayStatCard: {
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.65)',
    padding: 16,
    display: 'grid',
    gap: 6,
    textAlign: 'center',
  },
  overlayStatLabel: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  overlayStatValue: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: '-0.01em',
  },
  cornerIcon: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 32,
    height: 32,
    borderRadius: 14,
    background: 'rgba(15,23,42,0.58)',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    gap: 3,
    padding: 6,
    boxShadow: '0 14px 30px -22px rgba(15,23,42,0.8)',
  },
  cornerDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: 'rgba(226,232,240,0.78)',
  },
  playCarouselSection: {
    width: '100%',
    display: 'grid',
    gap: 14,
  },
  playCarouselHeader: {
    display: 'grid',
    gap: 4,
  },
  playCarouselTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
  },
  playCarouselSubtitle: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
  },
  playCarouselFrame: {
    width: '100%',
    display: 'flex',
    overflow: 'hidden',
    padding: '0 0 2px',
  },
  playCarouselTrack: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    gap: 12,
    overflowX: 'auto',
    padding: '2px 0 6px 0',
    width: '100%',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    scrollBehavior: 'smooth',
  },
  playCarouselCard: (active) => ({
    position: 'relative',
    flex: '0 0 min(78%, 300px)',
    minWidth: 232,
    borderRadius: 22,
    border: active ? '1px solid rgba(56,189,248,0.65)' : '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.72)',
    minHeight: 120,
    padding: '10px 16px',
    overflow: 'hidden',
    display: 'grid',
    gap: 6,
    cursor: 'pointer',
    boxShadow: active
      ? '0 28px 80px -40px rgba(56,189,248,0.65)'
      : '0 18px 60px -48px rgba(15,23,42,0.78)',
    transition: 'transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
    scrollSnapAlign: 'center',
    scrollSnapStop: 'always',
    transform: active ? 'translateY(-8px)' : 'translateY(0)',
    willChange: 'transform',
  }),
  playCarouselBackdrop: (imageUrl) => ({
    position: 'absolute',
    inset: 0,
    borderRadius: 20,
    backgroundImage: imageUrl
      ? `linear-gradient(135deg, rgba(2,6,23,0.16) 0%, rgba(2,6,23,0.78) 100%), url(${imageUrl})`
      : 'linear-gradient(135deg, rgba(2,6,23,0.32) 0%, rgba(2,6,23,0.78) 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: imageUrl ? 'saturate(1.08)' : 'none',
    opacity: 0.92,
  }),
  playCarouselContent: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gap: 8,
  },
  playCarouselCardTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 1.35,
    letterSpacing: '-0.015em',
  },
  playCarouselCardMeta: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  playCarouselCardMetaEmphasis: {
    fontSize: 18,
    fontWeight: 800,
    color: '#f8fafc',
  },
  playCarouselBadgeRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  playCarouselBadge: {
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.35)',
    fontSize: 11,
    fontWeight: 600,
    color: '#e2e8f0',
    background: 'rgba(15,23,42,0.58)',
  },
  playCarouselHint: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  playCarouselIndicators: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
  },
  playCarouselIndicator: (active) => ({
    width: active ? 32 : 12,
    height: 12,
    borderRadius: 999,
    border: 'none',
    background: active ? 'rgba(56,189,248,0.85)' : 'rgba(148,163,184,0.4)',
    cursor: 'pointer',
    transition: 'all 160ms ease',
  }),
  playRetryRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: 8,
  },
  playRetryButton: {
    padding: '8px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.72)',
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  playSliderEmpty: {
    padding: '16px 14px',
    borderRadius: 16,
    border: '1px dashed rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.55)',
    textAlign: 'center',
    fontSize: 13,
    color: '#cbd5f5',
  },
  playDetailScrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    padding: '24px 18px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(2,6,23,0.86)',
    backdropFilter: 'blur(12px)',
  },
  playDetailBackdrop: (imageUrl) => ({
    position: 'absolute',
    inset: 0,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundImage: imageUrl
      ? `linear-gradient(160deg, rgba(15,23,42,0.58) 0%, rgba(15,23,42,0.9) 70%), url(${imageUrl})`
      : 'linear-gradient(160deg, rgba(15,23,42,0.75) 0%, rgba(15,23,42,0.92) 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: 'saturate(1.05)',
  }),
  playDetailPanel: {
    position: 'relative',
    width: 'min(960px, 100%)',
    maxHeight: '90dvh',
    borderRadius: 36,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.78)',
    boxShadow: '0 60px 140px -80px rgba(15,23,42,0.9)',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    overflow: 'hidden',
  },
  playDetailHeader: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '22px 28px 0',
    gap: 18,
  },
  playDetailTitleBlock: {
    display: 'grid',
    gap: 6,
  },
  playDetailTitleLabel: {
    margin: 0,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(226,232,240,0.72)',
  },
  playDetailTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  playDetailClose: {
    border: '1px solid rgba(148,163,184,0.4)',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.72)',
    color: '#e2e8f0',
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  playDetailHeroSection: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gap: 18,
    justifyItems: 'center',
    textAlign: 'center',
    flex: '0 0 auto',
  },
  playDetailHeroBadge: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    color: 'rgba(226,232,240,0.8)',
  },
  playDetailHeroName: {
    margin: 0,
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: '-0.03em',
    textShadow: '0 28px 60px rgba(15,23,42,0.8)',
  },
  playDetailHeroCard: {
    position: 'relative',
    width: 'min(360px, 80%)',
    maxWidth: '100%',
    paddingTop: '140%',
    borderRadius: 32,
    overflow: 'hidden',
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.7)',
    boxShadow: '0 40px 120px -70px rgba(15,23,42,0.9)',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  playDetailHeroImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'filter 240ms ease',
  },
  playDetailHeroOverlay: (active) => ({
    position: 'absolute',
    inset: 0,
    background: active
      ? 'linear-gradient(180deg, rgba(2,6,23,0.2) 0%, rgba(2,6,23,0.82) 100%)'
      : 'linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.78) 100%)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: '28px 26px',
    gap: 12,
    color: '#f8fafc',
    transition: 'background 240ms ease',
  }),
  playDetailHeroOverlayHeading: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  playDetailHeroOverlayText: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.6,
    whiteSpace: 'pre-line',
  },
  playDetailHeroHint: {
    margin: 0,
    fontSize: 12,
    color: 'rgba(226,232,240,0.7)',
  },
  playDetailBody: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    padding: '22px 28px 28px',
    overflowY: 'auto',
    height: '100%',
  },
  playDetailGameFigure: {
    flex: '0 0 auto',
    borderRadius: 24,
    overflow: 'hidden',
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.58)',
    margin: '0 auto',
    width: 'min(100%, 480px)',
  },
  playDetailGameImage: {
    width: '100%',
    height: 'min(280px, 45vh)',
    objectFit: 'cover',
    display: 'block',
  },
  playRankingFilterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    flex: '0 0 auto',
  },
  playRankingFilterLabel: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
    fontWeight: 600,
  },
  playRankingFilterSelect: {
    flex: '0 0 auto',
    minWidth: 140,
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.65)',
    color: '#e2e8f0',
    fontSize: 13,
  },
  playRankingList: {
    display: 'grid',
    gap: 12,
    width: '100%',
    flex: '0 0 auto',
    paddingRight: 4,
  },
  playRankingRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.28)',
    background: 'rgba(15,23,42,0.62)',
  },
  playRankingIndex: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'rgba(30,64,175,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
  },
  playRankingHeroInfo: {
    display: 'grid',
    gap: 4,
  },
  playRankingHeroName: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
  },
  playRankingHeroRole: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  playRankingScore: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
  },
  playRankingEmpty: {
    padding: 18,
    borderRadius: 16,
    border: '1px dashed rgba(148,163,184,0.35)',
    textAlign: 'center',
    color: '#cbd5f5',
  },
  playDetailHint: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
    flex: '0 0 auto',
  },
  playStatsSection: {
    width: '100%',
    display: 'grid',
    gap: 12,
  },
  playStatsHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  playStatsTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
  },
  playStatsSubtitle: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
  playStatsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 14,
  },
  playStatCard: {
    borderRadius: 18,
    border: '1px solid rgba(59,130,246,0.28)',
    background: 'rgba(15,23,42,0.68)',
    padding: 16,
    display: 'grid',
    gap: 6,
  },
  playStatLabel: {
    margin: 0,
    fontSize: 12,
    color: '#cbd5f5',
  },
  playStatValue: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
  },
  playStatMeta: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  playDetailsSection: {
    width: '100%',
    display: 'grid',
    gap: 18,
    padding: '20px 20px 22px',
    borderRadius: 26,
    border: '1px solid rgba(148,163,184,0.32)',
    background: 'rgba(15,23,42,0.7)',
    boxShadow: '0 36px 80px -60px rgba(15,23,42,0.9)',
  },
  dock: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 28,
    padding: '18px 18px 20px',
    boxSizing: 'border-box',
    background: 'rgba(15,23,42,0.82)',
    border: '1px solid rgba(96,165,250,0.28)',
    boxShadow: '0 44px 120px -70px rgba(37,99,235,0.55)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxHeight: 'min(58dvh, 460px)',
    overflowY: 'auto',
  },
  dockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  dockActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  battleButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 18,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.6,
    background: 'linear-gradient(135deg, #f97316 0%, #facc15 100%)',
    color: '#0f172a',
    cursor: 'pointer',
    boxShadow: '0 18px 42px -24px rgba(250,204,21,0.7)',
  },
  rosterButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    padding: '9px 16px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: '#e2e8f0',
    background: 'rgba(30,64,175,0.32)',
    border: '1px solid rgba(148,163,184,0.45)',
    textDecoration: 'none',
    transition: 'background 0.24s ease, color 0.24s ease',
  },
  lobbyButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    padding: '9px 16px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: '#0f172a',
    background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
    border: '1px solid rgba(56,189,248,0.6)',
    textDecoration: 'none',
    transition: 'transform 0.24s ease, box-shadow 0.24s ease',
    boxShadow: '0 18px 36px -24px rgba(56,189,248,0.7)',
  },
  dockTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  dockTabButton: (active) => ({
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: active ? '#0f172a' : '#e2e8f0',
    background: active ? '#38bdf8' : 'rgba(51,65,85,0.62)',
    cursor: 'pointer',
    transition: 'all 0.24s ease',
  }),
  tabContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  infoBlock: {
    background: 'rgba(15,23,42,0.62)',
    borderRadius: 20,
    padding: '16px 18px',
    border: '1px solid rgba(94, 234, 212, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  infoTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#bae6fd',
  },
  infoText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.7,
    color: '#e2e8f0',
    whiteSpace: 'pre-line',
  },
  sectionHint: {
    margin: '2px 0 0',
    fontSize: 12,
    color: 'rgba(148,163,184,0.75)',
  },
  buttonRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  ghostButton: {
    appearance: 'none',
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.45)',
    color: '#e2e8f0',
    borderRadius: 14,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 16,
    padding: '9px 18px',
    background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  dangerButton: {
    appearance: 'none',
    border: '1px solid rgba(248,113,113,0.4)',
    borderRadius: 14,
    padding: '8px 14px',
    background: 'rgba(127,29,29,0.35)',
    color: '#fecaca',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  playerShell: {
    background: 'rgba(8,47,73,0.68)',
    borderRadius: 20,
    padding: '12px 14px',
    border: '1px solid rgba(56,189,248,0.32)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    pointerEvents: 'auto',
    transition: 'background 180ms ease, border-color 180ms ease, opacity 180ms ease',
  },
  playerShellCollapsed: {
    background: 'rgba(8,47,73,0.32)',
    border: '1px solid rgba(45,212,191,0.22)',
    opacity: 0.55,
  },
  playerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  playerHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  collapseButton: {
    appearance: 'none',
    border: 'none',
    background: 'rgba(15,23,42,0.65)',
    color: '#bae6fd',
    borderRadius: 14,
    width: 28,
    height: 28,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
  },
  collapseButtonCollapsed: {
    background: 'rgba(15,23,42,0.4)',
    color: '#7dd3fc',
  },
  playerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e0f2fe',
  },
  playerTitleCollapsed: {
    color: 'rgba(148,163,184,0.68)',
  },
  progressBar: {
    position: 'relative',
    flex: 1,
    height: 6,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.35)',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  progressFill: (ratio) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: `${Math.min(Math.max(ratio * 100, 0), 100)}%`,
    background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
  }),
  playerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  playerButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '7px 14px',
    background: 'rgba(15,23,42,0.68)',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  playerMessage: {
    margin: 0,
    fontSize: 13,
    color: '#e2e8f0',
  },
  infoSliderSection: {
    display: 'grid',
    gap: 12,
  },
  infoSliderShell: {
    borderRadius: 26,
    border: '1px solid rgba(94,234,212,0.22)',
    background: 'rgba(15,23,42,0.7)',
    overflow: 'hidden',
    position: 'relative',
    touchAction: 'pan-y',
    minHeight: 340,
    maxHeight: '70vh',
  },
  infoSliderTrack: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 100%)',
    width: '200%',
    height: '100%',
    transition: 'transform 220ms ease',
    justifyItems: 'start',
  },
  infoSliderSlide: {
    boxSizing: 'border-box',
    padding: 20,
    display: 'grid',
    gap: 16,
    alignContent: 'start',
    minHeight: '100%',
    overflowY: 'auto',
    justifyItems: 'start',
  },
  infoSliderPlaySlide: {
    justifySelf: 'start',
    width: '100%',
    maxWidth: 360,
    margin: '0',
  },
  infoSliderInfoSlide: {
    justifySelf: 'start',
    width: '100%',
    maxWidth: 360,
    margin: '0',
  },
  infoSliderIndicators: {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: 8,
    paddingLeft: 4,
  },
  infoSliderIndicator: (active) => ({
    width: active ? 28 : 12,
    height: 10,
    borderRadius: 999,
    border: 'none',
    background: active ? 'rgba(94,234,212,0.85)' : 'rgba(148,163,184,0.4)',
    cursor: 'pointer',
    transition: 'all 160ms ease',
  }),
  infoSliderHint: {
    margin: 0,
    fontSize: 12,
    color: 'rgba(148,163,184,0.75)',
    textAlign: 'left',
  },
  hudContainer: {
    position: 'fixed',
    left: '50%',
    bottom: 12,
    transform: 'translateX(-50%)',
    width: 'min(560px, calc(100% - 24px))',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    zIndex: 40,
    pointerEvents: 'none',
    maxHeight: 'calc(100dvh - 24px)',
    justifyContent: 'flex-end',
  },
  hudSection: {
    pointerEvents: 'auto',
  },
  dockContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  dockToggleRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  dockToggleButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 14,
    padding: '6px 12px',
    background: 'rgba(15,23,42,0.65)',
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 10px 26px -20px rgba(14,116,144,0.75)',
  },
  sliderRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sliderLabel: {
    fontSize: 13,
    color: '#cbd5f5',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rangeInput: {
    width: '100%',
  },
  advancedPanel: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    marginTop: 8,
  },
  eqColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  eqSlider: {
    writingMode: 'bt-lr',
    WebkitAppearance: 'slider-vertical',
    height: 120,
  },
  searchGrid: {
    display: 'grid',
    gap: 16,
  },
  listEmpty: {
    margin: '8px 0 0',
    fontSize: 13,
    color: 'rgba(148,163,184,0.85)',
  },
  sortRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  sortButton: (active) => ({
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '8px 14px',
    background: active ? 'rgba(59,130,246,0.5)' : 'rgba(15,23,42,0.6)',
    color: active ? '#0f172a' : '#e0f2fe',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: active ? '0 14px 32px -24px rgba(59,130,246,0.9)' : 'none',
  }),
  quickLinkRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryLinkButton: {
    appearance: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 18px',
    borderRadius: 16,
    background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 800,
    textDecoration: 'none',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 16px 40px -28px rgba(14,116,144,0.9)',
  },
  creationGrid: {
    display: 'grid',
    gap: 12,
  },
  creationCard: {
    borderRadius: 18,
    padding: '16px 18px',
    background: 'rgba(30,41,59,0.72)',
    border: '1px solid rgba(96,165,250,0.25)',
    display: 'grid',
    gap: 10,
  },
  creationBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    background: 'rgba(56,189,248,0.2)',
    color: '#f0f9ff',
    width: 'fit-content',
  },
  creationCardTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  creationCardText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: '#cbd5f5',
    whiteSpace: 'pre-line',
  },
  registerBackdrop: (imageUrl) => ({
    borderRadius: 24,
    padding: '18px 20px 22px',
    background: imageUrl
      ? `linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.9) 72%, rgba(15,23,42,0.94) 100%), url(${imageUrl})`
      : 'rgba(15,23,42,0.72)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    border: '1px solid rgba(96,165,250,0.3)',
    boxShadow: '0 38px 120px -70px rgba(14,116,144,0.55)',
    display: 'grid',
    gap: 18,
  }),
  registerIntroTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: '#e0f2fe',
    textShadow: '0 10px 32px rgba(8,47,73,0.8)',
  },
  registerIntroText: {
    margin: '6px 0 0',
    fontSize: 13,
    lineHeight: 1.7,
    color: 'rgba(224,242,254,0.84)',
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  listItem: {
    padding: '12px 16px',
    borderRadius: 16,
    background: 'rgba(30,41,59,0.76)',
    border: '1px solid rgba(71,85,105,0.6)',
  },
  listTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  listMeta: {
    margin: '6px 0 0',
    fontSize: 12,
    color: 'rgba(148,163,184,0.85)',
  },
  settingsGroup: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid rgba(148,163,184,0.16)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  effectToggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  effectTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  togglePill: (active) => ({
    appearance: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    background: active ? 'rgba(56,189,248,0.28)' : 'rgba(51,65,85,0.6)',
    color: active ? '#0f172a' : '#e2e8f0',
    cursor: 'pointer',
  }),
  eqGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
  },
  eqSliderLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  sliderLabelSmall: {
    fontSize: 12,
    color: '#e2e8f0',
  },
  smallRange: {
    width: '100%',
    height: 4,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.35)',
    appearance: 'none',
  },
  smallValue: {
    fontSize: 11,
    color: 'rgba(148,163,184,0.8)',
  },
  rankingList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  settingsForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  textField: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  textareaField: {
    width: '100%',
    minHeight: 120,
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'rgba(15,23,42,0.6)',
    color: '#e2e8f0',
    fontSize: 14,
  },
  formActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  uploadSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  previewFrame: {
    width: '100%',
    maxWidth: 180,
    minHeight: 120,
    borderRadius: 16,
    background: 'rgba(30,41,59,0.7)',
    border: '1px solid rgba(71,85,105,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  previewFallback: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.85)',
  },
  uploadButton: {
    appearance: 'none',
    border: '1px solid rgba(148,163,184,0.45)',
    borderRadius: 14,
    padding: '8px 14px',
    background: 'rgba(15,23,42,0.55)',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  inlineActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  errorText: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#fda4af',
  },
}

export default function CharacterBasicView({ hero }) {
  const { currentHero, setCurrentHero, heroName, description, abilityEntries } =
    useHeroProfileInfo(hero)

  const heroIdKey = useMemo(() => {
    const id = currentHero?.id
    return id ? String(id) : null
  }, [currentHero])

  const [viewMode, setViewMode] = useState(0)
  const [activeTab, setActiveTab] = useState(0)
  const [playerCollapsed, setPlayerCollapsed] = useState(true)
  const [dockCollapsed, setDockCollapsed] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [overlayHeroStep, setOverlayHeroStep] = useState(0)
  const [rankingAudioSnapshot, setRankingAudioSnapshot] = useState(null)
  const [overlayAudioHeroId, setOverlayAudioHeroId] = useState(null)
  const [portalTarget, setPortalTarget] = useState(null)
  const [rankingFilter, setRankingFilter] = useState('all')
  const [selectedBgmName, setSelectedBgmName] = useState('')
  const [customBgmUrl, setCustomBgmUrl] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draftHero, setDraftHero] = useState(null)
  const [imagePreview, setImagePreview] = useState(hero?.image_url || '')
  const [backgroundPreview, setBackgroundPreview] = useState(hero?.background_url || '')
  const [imageFile, setImageFile] = useState(null)
  const [backgroundFile, setBackgroundFile] = useState(null)
  const [bgmFile, setBgmFile] = useState(null)
  const [bgmDurationSeconds, setBgmDurationSeconds] = useState(hero?.bgm_duration_seconds || null)
  const [bgmMime, setBgmMime] = useState(hero?.bgm_mime || null)
  const [bgmError, setBgmError] = useState('')
  const [bgmCleared, setBgmCleared] = useState(false)
  const [saving, setSaving] = useState(false)

  const participationState = useHeroParticipations({ hero: currentHero })
  const battleState = useHeroBattles({ hero: currentHero, selectedGameId: participationState.selectedGameId })

  const {
    loading: participationLoading,
    error: participationError,
    participations,
    selectedEntry,
    selectedGame,
    selectedGameId,
    selectedScoreboard,
    scoreboardMap,
    heroLookup,
    setSelectedGameId,
    refresh: refreshParticipations,
  } = participationState

  const {
    battleDetails,
    battleSummary,
    visibleBattles,
    loading: battleLoading,
    error: battleError,
    showMore: showMoreBattles,
  } = battleState

  const carouselEntries = useMemo(() => participations, [participations])

  const handleCarouselSelection = useCallback(
    (gameId) => {
      if (!gameId) return
      setSelectedGameId(gameId)
      setOverlayHeroStep(0)
    },
    [setSelectedGameId],
  )

  const {
    trackRef: carouselTrackRef,
    registerItem: registerCarouselItem,
    handleCardClick: baseCarouselCardClick,
    handleIndicatorClick: handleCarouselIndicatorClick,
  } = useParticipationCarousel({
    entries: carouselEntries,
    selectedGameId,
    onSelect: handleCarouselSelection,
  })

  const handleCarouselCardClick = useCallback(
    (gameId) => {
      if (!gameId) return
      baseCarouselCardClick(gameId)
      setDetailOpen(true)
    },
    [baseCarouselCardClick],
  )

  const heroRankByGame = useMemo(() => {
    const map = new Map()
    if (!currentHero?.id || !scoreboardMap) return map
    Object.entries(scoreboardMap).forEach(([gameId, rows]) => {
      if (!gameId || !Array.isArray(rows)) return
      const index = rows.findIndex((row) => row?.hero_id === currentHero.id)
      if (index >= 0) {
        map.set(gameId, index + 1)
      }
    })
    return map
  }, [currentHero?.id, scoreboardMap])

  const rankingRows = useMemo(() => {
    if (!Array.isArray(selectedScoreboard)) return []
    const enriched = selectedScoreboard.map((row, index) => {
      const heroEntry = row?.hero_id ? heroLookup?.[row.hero_id] : null
      const heroName =
        (heroEntry?.name && heroEntry.name.trim()) ||
        (row?.role && row.role.trim()) ||
        (row?.slot_no != null ? `슬롯 ${row.slot_no + 1}` : `참가자 ${index + 1}`)

      const scoreValue = Number.isFinite(Number(row?.score)) ? Number(row.score) : null
      const ratingValue = Number.isFinite(Number(row?.rating)) ? Number(row.rating) : null
      const battlesValue = Number.isFinite(Number(row?.battles)) ? Number(row.battles) : null
      const value = scoreValue != null ? scoreValue : ratingValue

      return {
        key:
          row?.id ||
          (row?.hero_id ? `hero-${row.hero_id}` : row?.slot_no != null ? `slot-${row.slot_no}` : `row-${index}`),
        heroId: row?.hero_id || null,
        heroName,
        heroImage: heroEntry?.image_url || null,
        roleLabel: row?.role && row.role.trim() ? row.role.trim() : null,
        value,
        valueLabel: scoreValue != null ? '점' : ratingValue != null ? '레이팅' : null,
        battles: battlesValue,
      }
    })

    const resolveValue = (entry) => {
      if (entry.value != null) return entry.value
      return Number.NEGATIVE_INFINITY
    }

    return enriched
      .sort((a, b) => {
        const diff = resolveValue(b) - resolveValue(a)
        if (diff !== 0) return diff
        const battleDiff = (b.battles ?? -Infinity) - (a.battles ?? -Infinity)
        if (battleDiff !== 0) return battleDiff
        return (a.heroName || '').localeCompare(b.heroName || '')
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }))
  }, [heroLookup, selectedScoreboard])

  const rankingRoleOptions = useMemo(() => {
    const options = [{ value: 'all', label: '전체' }]
    const seen = new Set()
    rankingRows.forEach((row) => {
      const normalized = row.roleLabel && row.roleLabel.trim()
      const key = normalized || '__none__'
      if (seen.has(key)) return
      seen.add(key)
      options.push({ value: key, label: normalized || '역할 없음' })
    })
    return options
  }, [rankingRows])

  const filteredRankingRows = useMemo(() => {
    if (rankingFilter === 'all') return rankingRows
    if (rankingFilter === '__none__') {
      return rankingRows.filter((row) => !row.roleLabel)
    }
    return rankingRows.filter((row) => row.roleLabel === rankingFilter)
  }, [rankingFilter, rankingRows])

  const topRankingRow = useMemo(() => {
    if (!detailOpen) return null
    return filteredRankingRows.length ? filteredRankingRows[0] : null
  }, [detailOpen, filteredRankingRows])

  const topRankingHero = useMemo(() => {
    const heroId = topRankingRow?.heroId
    if (!heroId) return null
    return heroLookup?.[heroId] || null
  }, [heroLookup, topRankingRow])

  const overlayHeroSlides = useMemo(() => {
    if (!topRankingHero) return []
    const slides = []
    const descriptionText = typeof topRankingHero.description === 'string' ? topRankingHero.description.trim() : ''
    if (descriptionText) {
      slides.push({ label: '설명', text: descriptionText })
    }
    ;[
      { key: 'ability1', label: '능력 1' },
      { key: 'ability2', label: '능력 2' },
      { key: 'ability3', label: '능력 3' },
      { key: 'ability4', label: '능력 4' },
    ].forEach(({ key, label }) => {
      const value = typeof topRankingHero[key] === 'string' ? topRankingHero[key].trim() : ''
      if (value) {
        slides.push({ label, text: value })
      }
    })
    return slides
  }, [topRankingHero])

  const overlayHeroContent = useMemo(() => {
    if (!overlayHeroSlides.length || overlayHeroStep === 0) return null
    const index = (overlayHeroStep - 1) % overlayHeroSlides.length
    return overlayHeroSlides[index]
  }, [overlayHeroSlides, overlayHeroStep])

  const overlayBackdropImage = useMemo(() => {
    if (topRankingHero?.background_url) return topRankingHero.background_url
    if (topRankingHero?.image_url) return topRankingHero.image_url
    const selectedGameImage = selectedEntry?.game?.image_url
    if (selectedGameImage) return selectedGameImage
    return null
  }, [selectedEntry, topRankingHero])

  const overlaySlideCount = overlayHeroSlides.length

  const overlayHeroName = useMemo(() => {
    const name = typeof topRankingHero?.name === 'string' ? topRankingHero.name.trim() : ''
    return name || DEFAULT_HERO_NAME
  }, [topRankingHero])

  const overlayHeroHintText = overlaySlideCount
    ? '이미지를 탭하면 설명과 능력을 확인할 수 있어요.'
    : '등록된 설명과 능력이 없습니다.'

  const audioManager = useMemo(() => getHeroAudioManager(), [])
  const [audioState, setAudioState] = useState(() => audioManager.getState())
  const {
    enabled: bgmEnabled,
    isPlaying,
    progress,
    duration,
    volume: bgmVolume,
    eqEnabled,
    equalizer,
    reverbEnabled,
    reverbDetail,
    compressorEnabled,
    compressorDetail,
  } = audioState

  useEffect(() => {
    if (!detailOpen) return
    setOverlayHeroStep(0)
  }, [detailOpen, topRankingRow])

  useEffect(() => {
    if (!detailOpen) return
    if (rankingAudioSnapshot) return
    const snapshot = audioManager.getState()
    setRankingAudioSnapshot({
      heroId: snapshot.heroId,
      heroName: snapshot.heroName,
      trackUrl: snapshot.trackUrl,
      progress: snapshot.progress,
      enabled: snapshot.enabled,
      wasPlaying: snapshot.isPlaying,
      loop: snapshot.loop,
      duration: snapshot.duration,
    })
    audioManager.stop()
    audioManager.setEnabled(false)
  }, [audioManager, detailOpen, rankingAudioSnapshot])

  useEffect(() => {
    if (detailOpen) return
    if (!rankingAudioSnapshot) return
    let cancelled = false
    const snapshot = rankingAudioSnapshot
    const restore = async () => {
      audioManager.stop()
      audioManager.setEnabled(false)
      if (snapshot.trackUrl && snapshot.heroId) {
        await audioManager.loadHeroTrack({
          heroId: snapshot.heroId,
          heroName: snapshot.heroName,
          trackUrl: snapshot.trackUrl,
          duration: snapshot.duration || 0,
          autoPlay: false,
          loop: snapshot.loop !== undefined ? snapshot.loop : true,
        })
        if (cancelled) return
        audioManager.setEnabled(snapshot.enabled, { resume: false })
        if (Number.isFinite(snapshot.progress)) {
          audioManager.seek(snapshot.progress)
        }
        if (snapshot.wasPlaying && snapshot.enabled) {
          audioManager.play().catch(() => {})
        }
      } else {
        audioManager.setEnabled(snapshot.enabled, { resume: false })
      }
      setRankingAudioSnapshot(null)
      setOverlayAudioHeroId(null)
    }
    restore()
    return () => {
      cancelled = true
    }
  }, [audioManager, detailOpen, rankingAudioSnapshot])

  useEffect(() => {
    if (!detailOpen) return
    if (!rankingAudioSnapshot) return
    const topHero = topRankingHero
    if (!topHero?.bgm_url) {
      audioManager.stop()
      audioManager.setEnabled(false)
      setOverlayAudioHeroId(null)
      return
    }
    if (overlayAudioHeroId === topHero.id && audioState.trackUrl === topHero.bgm_url) {
      return
    }
    let cancelled = false
    const load = async () => {
      audioManager.stop()
      audioManager.setEnabled(false)
      await audioManager.loadHeroTrack({
        heroId: topHero.id,
        heroName: topHero.name || DEFAULT_HERO_NAME,
        trackUrl: topHero.bgm_url,
        duration: topHero.bgm_duration_seconds || 0,
        autoPlay: true,
        loop: true,
      })
      if (cancelled) return
      audioManager.setEnabled(true)
      setOverlayAudioHeroId(topHero.id)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [
    audioManager,
    audioState.trackUrl,
    detailOpen,
    overlayAudioHeroId,
    rankingAudioSnapshot,
    topRankingHero,
  ])

  const heroRank = useMemo(() => {
    if (!rankingRows.length || !currentHero?.id) return null
    const entry = rankingRows.find((row) => row.heroId === currentHero.id)
    return entry?.rank ?? null
  }, [rankingRows, currentHero])

  const heroScore = useMemo(() => {
    if (selectedEntry?.score != null) return selectedEntry.score
    if (!currentHero?.id) return null
    const row = rankingRows.find((item) => item.heroId === currentHero.id)
    return row?.value ?? null
  }, [selectedEntry, rankingRows, currentHero])

  const matchCount = useMemo(() => {
    if (battleSummary?.total != null) return battleSummary.total
    if (selectedEntry?.sessionCount != null) return selectedEntry.sessionCount
    return null
  }, [battleSummary, selectedEntry])

  const overallHeroStats = useMemo(() => {
    if (!currentHero?.id || !scoreboardMap) {
      return {
        bestRank: null,
        bestScore: null,
        averageWinRate: null,
        totalBattles: null,
      }
    }

    let bestRank = null
    let bestScore = null
    let totalBattles = 0
    let winRateSum = 0
    let winRateSamples = 0
    let eligibleGames = 0

    const rowsByGame = Object.values(scoreboardMap)

    const resolveValue = (row) => {
      if (row?.score != null && Number.isFinite(Number(row.score))) return Number(row.score)
      if (row?.rating != null && Number.isFinite(Number(row.rating))) return Number(row.rating)
      if (row?.battles != null && Number.isFinite(Number(row.battles))) return Number(row.battles)
      return Number.NEGATIVE_INFINITY
    }

    rowsByGame.forEach((rows) => {
      if (!Array.isArray(rows) || rows.length < 10) return
      const sorted = [...rows].sort((a, b) => {
        const valueDiff = resolveValue(b) - resolveValue(a)
        if (valueDiff !== 0) return valueDiff
        const battleDiff = (b?.battles ?? -Infinity) - (a?.battles ?? -Infinity)
        if (battleDiff !== 0) return battleDiff
        const left = typeof a?.role === 'string' ? a.role : ''
        const right = typeof b?.role === 'string' ? b.role : ''
        return left.localeCompare(right)
      })
      const heroIndex = sorted.findIndex((row) => row?.hero_id === currentHero.id)
      if (heroIndex < 0) return

      eligibleGames += 1
      const heroRow = sorted[heroIndex]
      const rankValue = heroIndex + 1
      bestRank = bestRank == null ? rankValue : Math.min(bestRank, rankValue)

      const scoreValue = Number.isFinite(Number(heroRow?.score)) ? Number(heroRow.score) : null
      if (scoreValue != null) {
        bestScore = bestScore == null ? scoreValue : Math.max(bestScore, scoreValue)
      }

      const battlesValue = Number.isFinite(Number(heroRow?.battles)) ? Number(heroRow.battles) : null
      if (battlesValue != null) {
        totalBattles += battlesValue
      }

      const winRateRaw = Number.isFinite(Number(heroRow?.win_rate)) ? Number(heroRow.win_rate) : null
      if (winRateRaw != null) {
        const normalized = winRateRaw <= 1 ? winRateRaw * 100 : winRateRaw
        winRateSum += normalized
        winRateSamples += 1
      }
    })

    return {
      bestRank,
      bestScore,
      averageWinRate: winRateSamples ? winRateSum / winRateSamples : null,
      totalBattles: eligibleGames ? totalBattles : null,
    }
  }, [currentHero?.id, scoreboardMap])

  const formatParticipationMeta = useCallback((entry) => {
    if (!entry) {
      return {
        text: '이름 없는 게임',
        emphasize: true,
      }
    }

    const parts = []
    if (entry.sessionCount) {
      parts.push(`${entry.sessionCount.toLocaleString('ko-KR')}회 참여`)
    }
    if (entry.primaryMode) {
      parts.push(`주 모드 ${entry.primaryMode}`)
    }
    if (entry.latestSessionAt) {
      parts.push(`최근 ${entry.latestSessionAt}`)
    }

    if (!parts.length) {
      return {
        text: entry.game?.name || '이름 없는 게임',
        emphasize: true,
      }
    }

    return {
      text: parts.join(' · '),
      emphasize: false,
    }
  }, [])

  const {
    index: infoPanelIndex,
    setIndex: setInfoPanelIndex,
    handleTouchStart: handleInfoSliderTouchStart,
    handleTouchEnd: handleInfoSliderTouchEnd,
    handlePointerDown: handleInfoSliderPointerDown,
    handlePointerUp: handleInfoSliderPointerUp,
    handleIndicatorClick: handleInfoIndicatorClick,
  } = useInfoSlider({ maxIndex: 1 })

  const handleDetailClose = useCallback(() => {
    setDetailOpen(false)
    setOverlayHeroStep(0)
    setRankingFilter('all')
  }, [])

  const handleRankingFilterChange = useCallback((event) => {
    const value = event?.target?.value ?? 'all'
    setRankingFilter(value)
    setOverlayHeroStep(0)
  }, [])

  const handleTopHeroCardClick = useCallback(() => {
    if (!overlaySlideCount) return
    setOverlayHeroStep((prev) => (prev + 1) % (overlaySlideCount + 1))
  }, [overlaySlideCount])

  const handleTopHeroCardKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      handleTopHeroCardClick()
    },
    [handleTopHeroCardClick],
  )

  const imageInputRef = useRef(null)
  const backgroundInputRef = useRef(null)
  const bgmInputRef = useRef(null)
  const previousCustomUrl = useRef(null)
  const imageObjectUrlRef = useRef(null)
  const backgroundObjectUrlRef = useRef(null)
  const lastLoadedHeroKeyRef = useRef(null)

  useEffect(() => audioManager.subscribe(setAudioState), [audioManager])

  useEffect(() => {
    if (typeof document === 'undefined') return
    setPortalTarget(document.body)
  }, [])

  useEffect(() => {
    const raw = readCookie(AUDIO_SETTINGS_COOKIE)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed.eqEnabled === 'boolean') {
        audioManager.setEqEnabled(parsed.eqEnabled)
      }
      if (parsed.equalizer) {
        audioManager.setEqualizer({
          low: Number.isFinite(parsed.equalizer.low) ? parsed.equalizer.low : undefined,
          mid: Number.isFinite(parsed.equalizer.mid) ? parsed.equalizer.mid : undefined,
          high: Number.isFinite(parsed.equalizer.high) ? parsed.equalizer.high : undefined,
        })
      }
      if (typeof parsed.reverbEnabled === 'boolean') {
        audioManager.setReverbEnabled(parsed.reverbEnabled)
      }
      if (parsed.reverbDetail) {
        audioManager.setReverbDetail({
          mix: Number.isFinite(parsed.reverbDetail.mix) ? parsed.reverbDetail.mix : undefined,
          decay: Number.isFinite(parsed.reverbDetail.decay) ? parsed.reverbDetail.decay : undefined,
        })
      }
      if (typeof parsed.compressorEnabled === 'boolean') {
        audioManager.setCompressorEnabled(parsed.compressorEnabled)
      }
      if (parsed.compressorDetail) {
        audioManager.setCompressorDetail({
          threshold: Number.isFinite(parsed.compressorDetail.threshold)
            ? parsed.compressorDetail.threshold
            : undefined,
          ratio: Number.isFinite(parsed.compressorDetail.ratio) ? parsed.compressorDetail.ratio : undefined,
          release: Number.isFinite(parsed.compressorDetail.release)
            ? parsed.compressorDetail.release
            : undefined,
        })
      }
    } catch (error) {
      console.error(error)
    }
  }, [audioManager])


  useEffect(() => {
    const payload = {
      eqEnabled: audioState.eqEnabled,
      equalizer: audioState.equalizer,
      reverbEnabled: audioState.reverbEnabled,
      reverbDetail: audioState.reverbDetail,
      compressorEnabled: audioState.compressorEnabled,
      compressorDetail: audioState.compressorDetail,
    }
    writeCookie(AUDIO_SETTINGS_COOKIE, JSON.stringify(payload))
  }, [
    audioState.eqEnabled,
    audioState.equalizer.low,
    audioState.equalizer.mid,
    audioState.equalizer.high,
    audioState.reverbEnabled,
    audioState.reverbDetail.mix,
    audioState.reverbDetail.decay,
    audioState.compressorEnabled,
// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
    audioState.compressorDetail.threshold,
    audioState.compressorDetail.ratio,
    audioState.compressorDetail.release,
  ])

  useEffect(() => {
    setViewMode(0)
    setActiveTab(0)
    setPlayerCollapsed(false)
    setSelectedBgmName('')
    setCustomBgmUrl(null)
    setIsEditing(false)
    setInfoPanelIndex(0)
    setDraftHero(
      hero
        ? {
            name: hero.name || '',
            description: hero.description || '',
            ability1: hero.ability1 || '',
            ability2: hero.ability2 || '',
            ability3: hero.ability3 || '',
            ability4: hero.ability4 || '',
          }
        : null,
    )
    setImagePreview(hero?.image_url || '')
    setBackgroundPreview(hero?.background_url || '')
    if (imageObjectUrlRef.current) {
      URL.revokeObjectURL(imageObjectUrlRef.current)
      imageObjectUrlRef.current = null
    }
    if (backgroundObjectUrlRef.current) {
      URL.revokeObjectURL(backgroundObjectUrlRef.current)
      backgroundObjectUrlRef.current = null
    }
    setImageFile(null)
    setBackgroundFile(null)
    setBgmFile(null)
    setBgmDurationSeconds(hero?.bgm_duration_seconds || null)
    setBgmMime(hero?.bgm_mime || null)
    setBgmError('')
    setBgmCleared(false)
    if (imageInputRef.current) imageInputRef.current.value = ''
    if (backgroundInputRef.current) backgroundInputRef.current.value = ''
    if (bgmInputRef.current) bgmInputRef.current.value = ''
  }, [hero])

  useEffect(() => {
    if (!selectedEntry) {
      setDetailOpen(false)
    }
  }, [selectedEntry])

  useEffect(() => {
// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
    if (!carouselEntries.length) {
      setDetailOpen(false)
    }
  }, [carouselEntries.length])

  useEffect(() => {
    setRankingFilter('all')
  }, [selectedGameId])

  useEffect(() => {
    if (!detailOpen) {
      setRankingFilter('all')
    }
  }, [detailOpen])

  useEffect(() => {
    if (previousCustomUrl.current && previousCustomUrl.current !== customBgmUrl) {
      URL.revokeObjectURL(previousCustomUrl.current)
    }
    previousCustomUrl.current = customBgmUrl
    return () => {
      if (previousCustomUrl.current) {
        URL.revokeObjectURL(previousCustomUrl.current)
      }
      if (imageObjectUrlRef.current) {
        URL.revokeObjectURL(imageObjectUrlRef.current)
        imageObjectUrlRef.current = null
      }
      if (backgroundObjectUrlRef.current) {
        URL.revokeObjectURL(backgroundObjectUrlRef.current)
        backgroundObjectUrlRef.current = null
      }
    }
  }, [customBgmUrl])

  const activeBgmUrl = customBgmUrl || currentHero?.bgm_url || null

  useEffect(() => {
    const heroId = currentHero?.id || null
    const durationHint = customBgmUrl ? bgmDurationSeconds || 0 : currentHero?.bgm_duration_seconds || 0
    const snapshot = audioManager.getState()
    const heroTrackKey = `${heroId || 'none'}|${activeBgmUrl || 'none'}`
    const sameTrack = snapshot.heroId === heroId && snapshot.trackUrl === activeBgmUrl
    const shouldResume = snapshot.isPlaying || !sameTrack

    audioManager.loadHeroTrack({
      heroId,
      heroName,
      trackUrl: activeBgmUrl,
      duration: durationHint,
      autoPlay: shouldResume,
      loop: true,
    })

    if (lastLoadedHeroKeyRef.current !== heroTrackKey) {
      lastLoadedHeroKeyRef.current = heroTrackKey
      const desiredEnabled = Boolean(activeBgmUrl)
      if (desiredEnabled !== snapshot.enabled) {
        audioManager.setEnabled(desiredEnabled, { resume: shouldResume && desiredEnabled })
      }
      audioManager.setLoop(true)
    }
  }, [
    audioManager,
    activeBgmUrl,
    currentHero?.id,
    heroName,
    bgmDurationSeconds,
    customBgmUrl,
  ])

// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
  const backgroundStyle = currentHero?.background_url
    ? pageStyles.withBackground(currentHero.background_url)
    : pageStyles.base

  useEffect(() => {
    if (currentHero?.background_url) {
      writeSharedBackgroundUrl(currentHero.background_url)
    } else {
      clearSharedBackgroundUrl()
    }
  }, [currentHero])

  const overlayModes = useMemo(() => ['name', 'stats'], [])

  const currentOverlayMode = overlayModes[viewMode] || 'name'

  const imageStyle = {
    ...styles.heroImage,
    filter: currentOverlayMode === 'name' ? 'none' : 'brightness(0.72)',
  }

  const handleTap = () => {
    if (!overlayModes.length) return
    setViewMode((prev) => (prev + 1) % overlayModes.length)
  }

  const formatTime = (value) => {
    if (!value || Number.isNaN(value)) return '0:00'
    const minutes = Math.floor(value / 60)
    const seconds = Math.floor(value % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handleSeek = (event) => {
    if (!duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    const clamped = Math.min(Math.max(ratio, 0), 1)
    const nextTime = clamped * duration
    audioManager.seek(nextTime)
  }

  const togglePlayback = () => {
    if (!activeBgmUrl) return
    audioManager.toggle()
  }

  const stopPlayback = () => {
    audioManager.stop()
  }

  const handleBgmToggle = () => {
    audioManager.setEnabled(!bgmEnabled)
  }

  const handleImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.')
       
      event.target.value = ''
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      alert('이미지는 5MB를 넘을 수 없습니다.')
       
      event.target.value = ''
      return
    }
    if (imageObjectUrlRef.current) {
      URL.revokeObjectURL(imageObjectUrlRef.current)
    }
    const objectUrl = URL.createObjectURL(file)
    imageObjectUrlRef.current = objectUrl
    setImagePreview(objectUrl)
    setImageFile(file)
     
    event.target.value = ''
  }

  const handleBackgroundChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('배경은 이미지 파일만 업로드할 수 있습니다.')
       
      event.target.value = ''
      return
    }
    if (file.size > MAX_BACKGROUND_SIZE) {
      alert('배경 이미지는 8MB를 넘을 수 없습니다.')
       
      event.target.value = ''
      return
    }
    if (backgroundObjectUrlRef.current) {
      URL.revokeObjectURL(backgroundObjectUrlRef.current)
    }
    const objectUrl = URL.createObjectURL(file)
    backgroundObjectUrlRef.current = objectUrl
    setBackgroundPreview(objectUrl)
    setBackgroundFile(file)
     
    event.target.value = ''
  }

  const handleBgmFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setBgmError('')

    if (!file.type.startsWith('audio/')) {
      setBgmError('오디오 파일만 업로드할 수 있습니다.')
       
      event.target.value = ''
      return
    }
    if (file.size > MAX_AUDIO_SIZE) {
      setBgmError('오디오는 12MB 이하만 업로드할 수 있습니다.')
       
      event.target.value = ''
      return
    }

    const tempUrl = URL.createObjectURL(file)
    setCustomBgmUrl(tempUrl)
    setSelectedBgmName(file.name || '선택한 오디오')
    audioManager.setEnabled(true)
    setBgmCleared(false)

    try {
      const durationValue = await new Promise((resolve, reject) => {
        const probe = document.createElement('audio')
        probe.preload = 'metadata'
        probe.onloadedmetadata = () => {
          if (!Number.isFinite(probe.duration)) {
            reject(new Error('재생 시간을 확인할 수 없습니다.'))
            return
          }
          resolve(probe.duration)
        }
        probe.onerror = () => reject(new Error('오디오 정보를 불러올 수 없습니다.'))
        probe.src = tempUrl
      })

      if (durationValue > MAX_AUDIO_DURATION) {
        setBgmError('브금은 5분을 넘을 수 없습니다.')
        setCustomBgmUrl(currentHero?.bgm_url || null)
        setSelectedBgmName('')
        URL.revokeObjectURL(tempUrl)
        setBgmFile(null)
        setBgmDurationSeconds(currentHero?.bgm_duration_seconds || null)
        setBgmMime(currentHero?.bgm_mime || null)
        audioManager.setEnabled(Boolean(currentHero?.bgm_url))
      } else {
        setBgmFile(file)
        const roundedDuration = Math.round(durationValue)
        setBgmDurationSeconds(roundedDuration)
        setBgmMime(file.type || null)
      }
    } catch (error) {
      setBgmError(error.message || '오디오를 불러올 수 없습니다.')
      setCustomBgmUrl(currentHero?.bgm_url || null)
      setSelectedBgmName('')
      URL.revokeObjectURL(tempUrl)
      setBgmFile(null)
      setBgmDurationSeconds(currentHero?.bgm_duration_seconds || null)
      setBgmMime(currentHero?.bgm_mime || null)
      audioManager.setEnabled(Boolean(currentHero?.bgm_url))
    }

     
    event.target.value = ''
  }

  const uploadHeroAsset = useCallback(
    async (file, folder, fallbackName) => {
      if (!file) return null
      const extensionFromName = file.name ? file.name.split('.').pop() : ''
      const extension = (extensionFromName || file.type?.split('/')[1] || 'bin').toLowerCase()
      const safeBase = sanitizeFileName(fallbackName || heroName || 'hero-asset')
      const path = `${folder}/${Date.now()}-${safeBase}.${extension}`
      const { error } = await supabase.storage
        .from('heroes')
        .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' })
      if (error) throw error
      const { data } = supabase.storage.from('heroes').getPublicUrl(path)
      return data?.publicUrl || null
    },
    [heroName],
  )

  const handleDraftChange = (field, value) => {
    setDraftHero((prev) => ({
      name: prev?.name || currentHero?.name || '',
      description: prev?.description || currentHero?.description || '',
      ability1: prev?.ability1 || currentHero?.ability1 || '',
      ability2: prev?.ability2 || currentHero?.ability2 || '',
      ability3: prev?.ability3 || currentHero?.ability3 || '',
      ability4: prev?.ability4 || currentHero?.ability4 || '',
      [field]: value,
    }))
  }

  const resetDraftToHero = useCallback(() => {
    setDraftHero(
      currentHero
        ? {
            name: currentHero.name || '',
            description: currentHero.description || '',
            ability1: currentHero.ability1 || '',
            ability2: currentHero.ability2 || '',
            ability3: currentHero.ability3 || '',
            ability4: currentHero.ability4 || '',
          }
        : null,
    )
  }, [currentHero])

  const handleSaveDraft = async () => {
    if (!currentHero?.id || !draftHero) {
      alert('저장할 캐릭터 정보를 찾을 수 없습니다.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: draftHero.name?.trim() || DEFAULT_HERO_NAME,
        description: draftHero.description || '',
        ability1: draftHero.ability1 || '',
        ability2: draftHero.ability2 || '',
        ability3: draftHero.ability3 || '',
        ability4: draftHero.ability4 || '',
      }

      let imageUrl = currentHero.image_url || null
      if (imageFile) {
        imageUrl = await uploadHeroAsset(imageFile, 'hero-image', payload.name)
      }

      let backgroundUrl = currentHero.background_url || null
      if (backgroundFile) {
        backgroundUrl = await uploadHeroAsset(backgroundFile, 'hero-background', payload.name)
      }

      let bgmUrl = currentHero.bgm_url || null
      let nextDuration = bgmDurationSeconds
      let nextMime = bgmMime
      if (bgmFile) {
        bgmUrl = await uploadHeroAsset(bgmFile, 'hero-bgm', payload.name)
      }
      if (bgmCleared && !bgmFile) {
        bgmUrl = null
      }
      if (!bgmUrl) {
        nextDuration = null
        nextMime = null
      }

      const fullPayload = {
        ...payload,
        image_url: imageUrl,
        background_url: backgroundUrl,
        bgm_url: bgmUrl,
        bgm_duration_seconds: nextDuration,
        bgm_mime: nextMime,
      }

      const { error } = await withTable(supabase, 'heroes', (table) =>
        supabase.from(table).update(fullPayload).eq('id', currentHero.id)
      )
      if (error) throw error

      const nextHero = {
        ...currentHero,
        ...fullPayload,
      }

      setCurrentHero(nextHero)
      setDraftHero({
        name: fullPayload.name,
        description: fullPayload.description,
        ability1: fullPayload.ability1,
        ability2: fullPayload.ability2,
        ability3: fullPayload.ability3,
        ability4: fullPayload.ability4,
      })
      setImagePreview(imageUrl || '')
      setBackgroundPreview(backgroundUrl || '')
      if (imageObjectUrlRef.current) {
        URL.revokeObjectURL(imageObjectUrlRef.current)
        imageObjectUrlRef.current = null
      }
      if (backgroundObjectUrlRef.current) {
        URL.revokeObjectURL(backgroundObjectUrlRef.current)
        backgroundObjectUrlRef.current = null
      }
      setImageFile(null)
      setBackgroundFile(null)
      setBgmFile(null)
      setCustomBgmUrl(null)
      setBgmDurationSeconds(nextDuration)
      setBgmMime(nextMime)
      setSelectedBgmName('')
      setBgmCleared(false)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hero-overlay:refresh'))
      }
      alert('저장 완료')
      setIsEditing(false)
      audioManager.loadHeroTrack({
        heroId: nextHero.id,
        heroName: fullPayload.name,
        trackUrl: bgmUrl,
        duration: nextDuration || 0,
        autoPlay: Boolean(bgmUrl),
        loop: true,
      })
      audioManager.setEnabled(Boolean(bgmUrl))
    } catch (error) {
      console.error(error)
      alert(error.message || '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    resetDraftToHero()
    setBgmError('')
    setCustomBgmUrl(null)
    setSelectedBgmName('')
    setBgmFile(null)
    setBgmDurationSeconds(currentHero?.bgm_duration_seconds || null)
    setBgmMime(currentHero?.bgm_mime || null)
    setBgmCleared(false)
    audioManager.setEnabled(Boolean(currentHero?.bgm_url))
    setImagePreview(currentHero?.image_url || '')
    setBackgroundPreview(currentHero?.background_url || '')
    if (imageObjectUrlRef.current) {
      URL.revokeObjectURL(imageObjectUrlRef.current)
      imageObjectUrlRef.current = null
    }
    if (backgroundObjectUrlRef.current) {
      URL.revokeObjectURL(backgroundObjectUrlRef.current)
      backgroundObjectUrlRef.current = null
    }
    if (imageInputRef.current) imageInputRef.current.value = ''
    if (backgroundInputRef.current) backgroundInputRef.current.value = ''
    if (bgmInputRef.current) bgmInputRef.current.value = ''
    setIsEditing(false)
  }

  const handleDeleteHero = async () => {
    if (!currentHero?.id) {
      alert('삭제할 캐릭터를 찾을 수 없습니다.')
      return
    }
    if (!confirm('정말 캐릭터를 삭제할까요?')) return
    if (!confirm('삭제 후에는 복구할 수 없습니다. 계속하시겠어요?')) return

    setSaving(true)
    try {
      const { error } = await withTable(supabase, 'heroes', (table) =>
        supabase.from(table).delete().eq('id', currentHero.id)
      )
      if (error) throw error
      alert('캐릭터가 삭제되었습니다.')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('hero-overlay:refresh'))
        window.location.href = '/roster'
      }
    } catch (error) {
      console.error(error)
      alert(error.message || '캐릭터 삭제에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const rankingEntries = useMemo(
    () => [
      { id: 'r-1', name: '아크메이지', score: 9820 },
      { id: 'r-2', name: '용맹한 기사', score: 9350 },
      { id: 'r-3', name: '그림자 추적자', score: 8890 },
      { id: 'r-4', name: '별빛 수호자', score: 8520 },
    ],
    [],
  )

  const creationHighlights = useMemo(
    () => [
      {
        id: 'prompt',
        badge: 'STEP 1',
        title: '프롬프트 세트 준비',
        description:
          '게임 세계관과 상황별 응답을 한곳에 정리하세요. Maker 홈에서 새 세트를 만들고 카드·브릿지를 편집할 수 있습니다.',
      },
      {
        id: 'rules',
        badge: 'STEP 2',
        title: '룰 & 슬롯 구성',
        description:
          '역할에 맞는 슬롯 수와 밸런스 규칙을 구상해 두면 등록 단계에서 바로 적용할 수 있습니다. 팀원과 함께 협업할 수 있도록 메모를 남겨 두세요.',
      },
      {
        id: 'playtest',
        badge: 'STEP 3',
        title: '플레이 테스트',
        description:
          '제작한 세트를 기반으로 시범 게임을 돌려 보며 서사를 다듬고 버그를 잡습니다. 완료 후 등록 탭에서 정식으로 공개하세요.',
      },
    ],
    [],
  )

  const activeTabKey = overlayTabs[activeTab]?.key ?? overlayTabs[0]?.key ?? 'create'
  const progressRatio = duration ? progress / duration : 0

  const playPanelData = useMemo(
    () => ({
      selectedEntry,
      selectedGame,
      selectedGameId,
      battleDetails,
      battleSummary,
      visibleBattles,
      battleLoading,
      battleError,
      showMoreBattles,
      refreshParticipations,
    }),
    [
      selectedEntry,
      selectedGame,
      selectedGameId,
      battleDetails,
      battleSummary,
      visibleBattles,
      battleLoading,
      battleError,
      showMoreBattles,
      refreshParticipations,
    ],
  )

  const overlayBody = (() => {
    if (activeTabKey === 'create') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>게임 제작 허브</p>
            <p style={styles.infoText}>
              프롬프트 세트부터 플레이 테스트까지, 제작 과정 전반을 한눈에 살펴볼 수 있습니다. 아래 단계를 확인하고 Maker로
              이동해 세트를 정비하세요.
            </p>
            <div style={styles.quickLinkRow}>
              <Link href="/maker" style={styles.primaryLinkButton}>
                Maker 열기
              </Link>
            </div>
          </div>

          <div style={styles.creationGrid}>
            {creationHighlights.map((item) => (
              <div key={item.id} style={styles.creationCard}>
                <span style={styles.creationBadge}>{item.badge}</span>
                <p style={styles.creationCardTitle}>{item.title}</p>
                <p style={styles.creationCardText}>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (activeTabKey === 'register') {
      const registerBackdropStyle = styles.registerBackdrop(
        backgroundPreview || currentHero?.background_url || ''
      )

      return (
        <div style={styles.tabContent}>
          <div style={registerBackdropStyle}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <p style={styles.registerIntroTitle}>게임 등록 허브</p>
                <p style={styles.registerIntroText}>
                  다양한 제작 흐름을 정리했어요. 세트를 다듬은 뒤 등록 화면으로 이동하면 난투 옵션과 체크리스트를 한 번에 확인할 수 있습니다.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link href="/rank/new" style={styles.primaryLinkButton}>
                  게임 등록 화면 열기
                </Link>
              </div>
            </div>
          </div>
        </div>
      )
    }
    if (activeTabKey === 'ranking') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>시즌 랭킹</p>
            <div style={styles.rankingList}>
              {rankingEntries.map((entry, index) => (
                <div key={entry.id} style={styles.listItem}>
                  <p style={styles.listTitle}>{`${index + 1}위 · ${entry.name}`}</p>
                  <p style={styles.listMeta}>{`점수 ${entry.score.toLocaleString()}점`}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (activeTabKey === 'settings') {
      return (
        <div style={styles.tabContent}>
          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>브금 제어</p>
            <div style={styles.buttonRow}>
              <button type="button" style={styles.ghostButton} onClick={handleBgmToggle}>
                {bgmEnabled ? '브금 끄기' : '브금 켜기'}
              </button>
            </div>
            <div style={styles.sliderRow}>
              <label style={styles.sliderLabel}>
                볼륨
                <span>{`${Math.round(bgmVolume * 100)}%`}</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(bgmVolume * 100)}
                onChange={(event) => audioManager.setVolume(Number(event.target.value) / 100)}
                style={styles.rangeInput}
              />
            </div>

            <div style={styles.settingsGroup}>
              <div style={styles.effectToggleRow}>
                <p style={styles.effectTitle}>이퀄라이저</p>
                <button
                  type="button"
                  style={styles.togglePill(eqEnabled)}
                  onClick={() => audioManager.setEqEnabled(!eqEnabled)}
                >
                  {eqEnabled ? '켜짐' : '꺼짐'}
                </button>
              </div>
              <p style={styles.sectionHint}>저음·중음·고음을 직접 다듬어 원하는 사운드를 만들어 보세요.</p>
              <div style={styles.eqGrid}>
                {[
                  { key: 'low', label: '저음' },
                  { key: 'mid', label: '중음' },
                  { key: 'high', label: '고음' },
                ].map((band) => (
                  <label key={band.key} style={styles.eqSliderLabel}>
                    <span style={styles.sliderLabelSmall}>{band.label}</span>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      value={equalizer[band.key]}
                      onChange={(event) =>
                        audioManager.setEqualizer({
                          ...equalizer,
                          [band.key]: Number(event.target.value),
                        })
                      }
                      style={styles.smallRange}
                      disabled={!eqEnabled}
                    />
                    <span style={styles.smallValue}>{eqEnabled ? `${equalizer[band.key]} dB` : '비활성화'}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={styles.settingsGroup}>
              <div style={styles.effectToggleRow}>
                <p style={styles.effectTitle}>리버브</p>
                <button
                  type="button"
                  style={styles.togglePill(reverbEnabled)}
                  onClick={() => audioManager.setReverbEnabled(!reverbEnabled)}
                >
                  {reverbEnabled ? '켜짐' : '꺼짐'}
                </button>
              </div>
              <p style={styles.sectionHint}>잔향의 길이와 섞이는 비율을 조절해 공연장 같은 울림을 연출합니다.</p>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  믹스 비율
                  <span>{`${Math.round(reverbDetail.mix * 100)}%`}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(reverbDetail.mix * 100)}
                  onChange={(event) =>
                    audioManager.setReverbDetail({
                      ...reverbDetail,
                      mix: Number(event.target.value) / 100,
                    })
                  }
                  style={styles.rangeInput}
                  disabled={!reverbEnabled}
                />
              </div>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  잔향 길이
                  <span>{`${reverbDetail.decay.toFixed(1)}s`}</span>
                </label>
                <input
                  type="range"
                  min={20}
                  max={500}
                  value={Math.round(reverbDetail.decay * 100)}
                  onChange={(event) =>
                    audioManager.setReverbDetail({
                      ...reverbDetail,
                      decay: Number(event.target.value) / 100,
                    })
                  }
                  style={styles.rangeInput}
                  disabled={!reverbEnabled}
                />
              </div>
            </div>

            <div style={styles.settingsGroup}>
              <div style={styles.effectToggleRow}>
                <p style={styles.effectTitle}>컴프레서</p>
                <button
                  type="button"
                  style={styles.togglePill(compressorEnabled)}
                  onClick={() => audioManager.setCompressorEnabled(!compressorEnabled)}
                >
                  {compressorEnabled ? '켜짐' : '꺼짐'}
                </button>
              </div>
              <p style={styles.sectionHint}>소리의 폭을 좁혀 더욱 또렷한 음량을 유지하도록 도와줍니다.</p>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  임계값
                  <span>{`${compressorDetail.threshold} dB`}</span>
                </label>
                <input
                  type="range"
                  min={-60}
                  max={0}
                  value={compressorDetail.threshold}
                  onChange={(event) =>
                    audioManager.setCompressorDetail({
                      ...compressorDetail,
                      threshold: Number(event.target.value),
                    })
                  }
                  style={styles.rangeInput}
                  disabled={!compressorEnabled}
                />
              </div>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  비율
                  <span>{`${compressorDetail.ratio.toFixed(1)}:1`}</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={Math.round(compressorDetail.ratio * 10)}
                  onChange={(event) =>
                    audioManager.setCompressorDetail({
                      ...compressorDetail,
                      ratio: Number(event.target.value) / 10,
                    })
                  }
                  style={styles.rangeInput}
                  disabled={!compressorEnabled}
                />
              </div>
              <div style={styles.sliderRow}>
                <label style={styles.sliderLabel}>
                  릴리즈
                  <span>{`${Math.round(compressorDetail.release * 1000)}ms`}</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={1000}
                  value={Math.round(compressorDetail.release * 1000)}
                  onChange={(event) =>
                    audioManager.setCompressorDetail({
                      ...compressorDetail,
                      release: Number(event.target.value) / 1000,
                    })
                  }
                  style={styles.rangeInput}
                  disabled={!compressorEnabled}
                />
              </div>
            </div>
          </div>

          <div style={styles.infoBlock}>
            <p style={styles.infoTitle}>캐릭터 편집</p>
            <div style={styles.buttonRow}>
              <button
                type="button"
                style={styles.ghostButton}
                onClick={() => {
                  resetDraftToHero()
                  setIsEditing(true)
                }}
                disabled={saving}
              >
                편집 시작
              </button>
              <button type="button" style={styles.dangerButton} onClick={handleDeleteHero} disabled={saving}>
                캐릭터 삭제
              </button>
            </div>
            {isEditing && draftHero ? (
              <form
                style={styles.settingsForm}
                onSubmit={async (event) => {
                  event.preventDefault()
                  await handleSaveDraft()
                }}
              >
                <div style={styles.formRow}>
                  <label style={styles.sliderLabel}>이름</label>
                  <input
                    style={styles.textField}
                    value={draftHero.name}
                    onChange={(event) => handleDraftChange('name', event.target.value)}
                  />
                </div>
                <div style={styles.formRow}>
                  <label style={styles.sliderLabel}>설명</label>
                  <textarea
                    style={styles.textareaField}
                    value={draftHero.description}
                    onChange={(event) => handleDraftChange('description', event.target.value)}
                  />
                </div>
                {['ability1', 'ability2', 'ability3', 'ability4'].map((field, index) => (
                  <div key={field} style={styles.formRow}>
                    <label style={styles.sliderLabel}>{`능력 ${index + 1}`}</label>
                    <textarea
                      style={styles.textareaField}
                      value={draftHero[field]}
                      onChange={(event) => handleDraftChange(field, event.target.value)}
                    />
                  </div>
                ))}

                <div style={styles.uploadSection}>
                  <div style={styles.previewFrame}>
                    {imagePreview ? (
                       
                      <img src={imagePreview} alt="캐릭터 이미지 미리보기" style={styles.previewImage} />
                    ) : (
                      <div style={styles.previewFallback}>이미지 없음</div>
                    )}
                  </div>
                  <button type="button" style={styles.uploadButton} onClick={() => imageInputRef.current?.click()}>
                    이미지 선택
                  </button>
                </div>

                <div style={styles.uploadSection}>
                  <div style={styles.previewFrame}>
                    {backgroundPreview ? (
                       
                      <img src={backgroundPreview} alt="배경 미리보기" style={styles.previewImage} />
                    ) : (
                      <div style={styles.previewFallback}>배경 없음</div>
                    )}
                  </div>
                  <button type="button" style={styles.uploadButton} onClick={() => backgroundInputRef.current?.click()}>
                    배경 선택
                  </button>
                </div>

                <div style={styles.uploadSection}>
                  <div style={styles.previewFrame}>
                    <p style={styles.listMeta}>
                      {selectedBgmName
                        ? `선택한 브금: ${selectedBgmName}`
                        : bgmCleared
                          ? '브금이 제거될 예정입니다.'
                          : currentHero?.bgm_url
                            ? '기존 브금이 설정되어 있습니다.'
                            : '등록된 브금이 없습니다.'}
                    </p>
                  </div>
                  <div style={styles.inlineActions}>
                    <button type="button" style={styles.uploadButton} onClick={() => bgmInputRef.current?.click()}>
                      브금 불러오기
                    </button>
                    <button
                      type="button"
                      style={styles.ghostButton}
                      onClick={() => {
                        setBgmFile(null)
                        setCustomBgmUrl(null)
                        setSelectedBgmName('')
                        setBgmDurationSeconds(null)
                        setBgmMime(null)
                        setBgmError('')
                        if (bgmInputRef.current) bgmInputRef.current.value = ''
                        setBgmCleared(true)
                        audioManager.setEnabled(false)
                        audioManager.stop()
                      }}
                    >
                      브금 제거
                    </button>
                  </div>
                  {bgmError ? <p style={styles.errorText}>{bgmError}</p> : null}
                </div>

                <div style={styles.formActions}>
                  <button type="submit" style={styles.primaryButton} disabled={saving}>
                    {saving ? '저장 중...' : '저장'}
                  </button>
                  <button type="button" style={styles.ghostButton} onClick={handleCancelEdit} disabled={saving}>
                    취소
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )
    }

    return (
      <div style={styles.tabContent}>
        <div style={styles.infoBlock}>
          <p style={styles.infoTitle}>{heroName}</p>
          <p style={styles.infoText}>{description}</p>
          {abilityEntries.map((entry) => (
            <div key={entry.label}>
              <p style={{ ...styles.infoTitle, marginTop: 12 }}>{entry.label}</p>
              <p style={styles.infoText}>{entry.description}</p>
            </div>
          ))}
          {!abilityEntries.length ? (
            <p style={styles.listMeta}>등록된 능력이 없습니다.</p>
          ) : null}
        </div>
      </div>
    )
  })()

  const playSliderSection = (
    <section style={styles.playCarouselSection}>
      <div style={styles.playCarouselHeader}>
        <h3 style={styles.playCarouselTitle}>참여한 게임</h3>
        {!participationLoading && carouselEntries.length ? (
          <p style={styles.playCarouselSubtitle}>{`총 ${carouselEntries.length.toLocaleString('ko-KR')}개 참여`}</p>
        ) : null}
      </div>
      {participationLoading ? (
        <div style={styles.playSliderEmpty}>참여한 게임을 불러오는 중입니다…</div>
      ) : participationError ? (
        <div>
          <div style={styles.playSliderEmpty}>{participationError}</div>
          <div style={styles.playRetryRow}>
            <button type="button" style={styles.playRetryButton} onClick={refreshParticipations}>
              다시 시도
            </button>
          </div>
        </div>
      ) : carouselEntries.length ? (
        <>
          <div style={styles.playCarouselFrame}>
            <div ref={carouselTrackRef} style={styles.playCarouselTrack}>
              {carouselEntries.map((entry) => {
                const active = entry.game_id === selectedGameId
                const imageUrl = entry.game?.cover_url || entry.game?.image_url || null
                const roleLabel = entry.role && entry.role.trim() ? entry.role.trim() : null
                const heroRankForEntry = heroRankByGame.get(entry.game_id)
                const meta = formatParticipationMeta(entry)
                return (
                  <button
                    key={entry.game_id}
                    type="button"
                    ref={registerCarouselItem(entry.game_id)}
                    style={styles.playCarouselCard(active)}
                    onClick={() => handleCarouselCardClick(entry.game_id)}
                  >
                    <div style={styles.playCarouselBackdrop(imageUrl)} />
                    <div style={styles.playCarouselContent}>
                      <h4 style={styles.playCarouselCardTitle}>{entry.game?.name || '이름 없는 게임'}</h4>
                      <p
                        style={{
                          ...styles.playCarouselCardMeta,
                          ...(meta.emphasize ? styles.playCarouselCardMetaEmphasis : null),
                        }}
                      >
                        {meta.text}
                      </p>
                      <div style={styles.playCarouselBadgeRow}>
                        {roleLabel ? <span style={styles.playCarouselBadge}>{roleLabel}</span> : null}
                        {heroRankForEntry ? (
                          <span style={styles.playCarouselBadge}>{`현재 순위 #${heroRankForEntry}`}</span>
                        ) : null}
                      </div>
                      <p style={styles.playCarouselHint}>{active ? '탭해서 랭킹 보기' : '탭해서 이 게임 보기'}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          {carouselEntries.length > 1 ? (
            <div style={styles.playCarouselIndicators}>
              {carouselEntries.map((entry) => (
                <button
                  key={entry.game_id}
                  type="button"
                  style={styles.playCarouselIndicator(entry.game_id === selectedGameId)}
                  onClick={() => handleCarouselIndicatorClick(entry.game_id)}
                  aria-label={`${entry.game?.name || '게임'}로 이동`}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div style={styles.playSliderEmpty}>아직 이 캐릭터가 참여한 게임이 없습니다.</div>
      )}
    </section>
  )

  const playStatsSection = (
    <section style={styles.playStatsSection}>
      <div style={styles.playStatsHeader}>
        <h3 style={styles.playStatsTitle}>선택한 게임 통계</h3>
        {selectedGame ? <p style={styles.playStatsSubtitle}>{selectedGame.name}</p> : null}
      </div>
      <div style={styles.playStatsGrid}>
        <div style={styles.playStatCard}>
          <p style={styles.playStatLabel}>랭킹</p>
          <p style={styles.playStatValue}>{heroRank ? `#${heroRank}` : '—'}</p>
          <p style={styles.playStatMeta}>참가자 대비 현재 순위</p>
        </div>
        <div style={styles.playStatCard}>
          <p style={styles.playStatLabel}>스코어</p>
          <p style={styles.playStatValue}>{formatPlayNumber(heroScore)}</p>
          <p style={styles.playStatMeta}>최근 기록된 전투 점수</p>
        </div>
        <div style={styles.playStatCard}>
          <p style={styles.playStatLabel}>승률</p>
          <p style={styles.playStatValue}>{formatPlayWinRate(battleSummary)}</p>
          <p style={styles.playStatMeta}>최근 40판 기준</p>
        </div>
        <div style={styles.playStatCard}>
          <p style={styles.playStatLabel}>전투 수</p>
          <p style={styles.playStatValue}>{matchCount != null ? `${matchCount}` : '—'}</p>
          <p style={styles.playStatMeta}>집계된 총 전투 횟수</p>
        </div>
      </div>
    </section>
  )

  const heroInfoSlide = (
    <div style={styles.infoBlock}>
      <p style={styles.infoTitle}>{heroName}</p>
      <p style={styles.infoText}>{description}</p>
      {abilityEntries.map((entry) => (
        <div key={entry.label}>
          <p style={{ ...styles.infoTitle, marginTop: 12 }}>{entry.label}</p>
          <p style={styles.infoText}>{entry.description}</p>
        </div>
      ))}
      {!abilityEntries.length ? <p style={styles.listMeta}>등록된 능력이 없습니다.</p> : null}
    </div>
  )

  const playDetailsSection = (
    <section style={styles.playDetailsSection}>
      <div style={styles.infoSliderSection}>
        <div style={styles.infoSliderShell}>
          <div
            style={{
              ...styles.infoSliderTrack,
              transform: `translateX(-${infoPanelIndex * 100}%)`,
            }}
            onTouchStart={handleInfoSliderTouchStart}
            onTouchEnd={handleInfoSliderTouchEnd}
            onPointerDown={handleInfoSliderPointerDown}
            onPointerUp={handleInfoSliderPointerUp}
          >
            <div style={{ ...styles.infoSliderSlide, ...styles.infoSliderPlaySlide }}>
              <CharacterPlayPanel hero={currentHero} playData={playPanelData} />
            </div>
            <div style={{ ...styles.infoSliderSlide, ...styles.infoSliderInfoSlide }}>{heroInfoSlide}</div>
          </div>
        </div>
        <div style={styles.infoSliderIndicators}>
          {[0, 1].map((index) => (
            <button
              key={`info-indicator-${index}`}
              type="button"
              style={styles.infoSliderIndicator(infoPanelIndex === index)}
              onClick={() => handleInfoIndicatorClick(index)}
              aria-label={index === 0 ? '게임 시작 패널 보기' : '캐릭터 정보 보기'}
            />
          ))}
        </div>
        <p style={styles.infoSliderHint}>옆으로 밀어 게임 패널과 캐릭터 정보를 전환하세요.</p>
      </div>
    </section>
  )

  const rankingOverlay =
    detailOpen && selectedEntry && portalTarget
      ? createPortal(
          <div style={styles.playDetailScrim} role="dialog" aria-modal="true">
            <div style={styles.playDetailPanel}>
              <div style={styles.playDetailBackdrop(overlayBackdropImage)} />
              <div style={styles.playDetailHeader}>
                <div style={styles.playDetailTitleBlock}>
                  <p style={styles.playDetailTitleLabel}>참여한 게임</p>
                  <h3 style={styles.playDetailTitle}>{selectedEntry.game?.name || '게임 랭킹'}</h3>
                </div>
                <button type="button" style={styles.playDetailClose} onClick={handleDetailClose}>
                  닫기
                </button>
              </div>
              <div style={styles.playDetailBody}>
                <section style={styles.playDetailHeroSection}>
                  <p style={styles.playDetailHeroBadge}>현재 1위</p>
                  <h2 style={styles.playDetailHeroName}>{topRankingHero ? overlayHeroName : '랭킹 정보 없음'}</h2>
                  {topRankingHero ? (
                    <div
                      style={styles.playDetailHeroCard}
                      onClick={handleTopHeroCardClick}
                      onKeyDown={handleTopHeroCardKeyDown}
                      role="button"
                      tabIndex={0}
                      aria-label={`${overlayHeroName} 카드 전환`}
                    >
                      {topRankingHero.image_url ? (
                         
                        <img
                          src={topRankingHero.image_url}
                          alt={`${overlayHeroName} 이미지`}
                          style={styles.playDetailHeroImage}
                        />
                      ) : (
                        <div style={{ ...styles.heroFallback, fontSize: 64 }}>
                          {overlayHeroName.slice(0, 1)}
                        </div>
                      )}
                      <div style={styles.playDetailHeroOverlay(Boolean(overlayHeroContent))}>
                        <h3 style={styles.playDetailHeroOverlayHeading}>
                          {overlayHeroContent ? overlayHeroContent.label : overlayHeroName}
                        </h3>
                        {overlayHeroContent ? (
                          <p style={styles.playDetailHeroOverlayText}>{overlayHeroContent.text}</p>
                        ) : (
                          <p style={styles.playDetailHeroHint}>{overlayHeroHintText}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p style={styles.playDetailHeroHint}>랭킹 데이터가 없습니다.</p>
                  )}
                </section>
                {selectedEntry?.game?.image_url ? (
                  <figure style={styles.playDetailGameFigure}>
                    { }
                    <img
                      src={selectedEntry.game.image_url}
                      alt={`${selectedEntry.game?.name || '게임'} 이미지`}
                      style={styles.playDetailGameImage}
                    />
                  </figure>
                ) : null}
                <div style={styles.playRankingFilterRow}>
                  <p style={styles.playRankingFilterLabel}>역할 필터</p>
                  <select
                    style={styles.playRankingFilterSelect}
                    value={rankingFilter}
                    onChange={handleRankingFilterChange}
                    disabled={rankingRoleOptions.length <= 1}
                  >
                    {rankingRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {filteredRankingRows.length ? (
                  <div style={styles.playRankingList}>
                    {filteredRankingRows.map((row) => {
                      const highlight = row.heroId === currentHero?.id
                      return (
                        <div
                          key={row.key}
                          style={{
                            ...styles.playRankingRow,
                            background: highlight
                              ? 'rgba(56,189,248,0.22)'
                              : styles.playRankingRow.background,
                            border: highlight
                              ? '1px solid rgba(56,189,248,0.55)'
                              : styles.playRankingRow.border,
                          }}
                        >
                          <span style={styles.playRankingIndex}>{row.rank}</span>
                          <div style={styles.playRankingHeroInfo}>
                            <p style={styles.playRankingHeroName}>{row.heroName}</p>
                            <p style={styles.playRankingHeroRole}>{row.roleLabel || '역할 없음'}</p>
                          </div>
                          <p style={styles.playRankingScore}>
                            {row.value != null
                              ? `${row.value.toLocaleString('ko-KR')} ${row.valueLabel || ''}`.trim()
                              : '—'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={styles.playRankingEmpty}>선택한 조건의 랭킹 데이터가 없습니다.</div>
                )}
                <p style={styles.playDetailHint}>역할 전체 · 역할군별 랭킹을 전환하려면 드롭다운을 변경하세요.</p>
              </div>
            </div>
          </div>,
          portalTarget,
        )
      : null

  const resolveBattleOutcome = useCallback(
    (battle) => {
      if (!battle || !heroIdKey) return '기록 없음'
      const parseList = (value) => {
        if (!value) return []
        if (Array.isArray(value)) return value.map((entry) => String(entry))
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value)
            if (Array.isArray(parsed)) {
              return parsed.map((entry) => String(entry))
            }
          } catch (error) {
            return value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          }
        }
        return []
      }

      const attackerHeroes = parseList(battle.attacker_hero_ids)
      const defenderHeroes = parseList(battle.defender_hero_ids)
      const isAttacker = attackerHeroes.includes(heroIdKey)
      const isDefender = defenderHeroes.includes(heroIdKey)
      const normalized = String(battle.result || '').toLowerCase()

      if (normalized.includes('draw') || normalized.includes('tie')) {
        return '무승부'
      }

      if (normalized.includes('win')) {
        const attackerWon = normalized.includes('attacker')
        if (isAttacker) return attackerWon ? '승리' : '패배'
        if (isDefender) return attackerWon ? '패배' : '승리'
        return attackerWon ? '공격 승리' : '방어 승리'
      }

      if (normalized.includes('loss') || normalized.includes('lose')) {
        if (isAttacker) return '패배'
        if (isDefender) return '승리'
        return '패배'
      }

      return '기록 없음'
    },
    [heroIdKey],
  )

  const recentBattleEntries = useMemo(() => {
    if (!Array.isArray(battleDetails) || !battleDetails.length) return []
    return battleDetails.slice(0, 4).map((battle, index) => {
      const timestamp = (() => {
        if (!battle?.created_at) return '시간 정보 없음'
        const date = new Date(battle.created_at)
        if (Number.isNaN(date.getTime())) return '시간 정보 없음'
        return date.toLocaleString('ko-KR', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      })()

      const scoreDelta = Number.isFinite(Number(battle?.score_delta))
        ? Number(battle.score_delta)
        : null

      return {
        id: battle?.id || `${battle?.created_at || 'battle'}-${index}`,
        timestamp,
        outcome: resolveBattleOutcome(battle),
        scoreDelta,
      }
    })
  }, [battleDetails, resolveBattleOutcome])


  const heroSlide = (
    <div style={styles.heroCardShell}>
      <div
        role="button"
        tabIndex={0}
        style={styles.heroCard}
        onClick={handleTap}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleTap()
          }
        }}
      >
        <div style={styles.cornerIcon} aria-hidden="true">
          {Array.from({ length: 9 }).map((_, index) => (
            <span key={`dot-${index}`} style={styles.cornerDot} />
          ))}
        </div>

        {hero?.image_url ? (
           
          <img src={hero.image_url} alt={heroName} style={imageStyle} />
        ) : (
          <div style={styles.heroFallback}>{heroName.slice(0, 2)}</div>
        )}

        {currentOverlayMode === 'name' ? (
          <div style={styles.heroNameOverlay}>
            <p style={styles.heroNameBadge}>{heroName}</p>
          </div>
        ) : null}

        {currentOverlayMode === 'stats' ? (
          <div style={styles.overlaySurface}>
            <div style={styles.overlayContent}>
              <p style={styles.overlayHeading}>전투 통계</p>
              <div style={styles.overlayStatsGrid}>
                <div style={styles.overlayStatsRow}>
                  <div style={styles.overlayStatCard}>
                    <p style={styles.overlayStatLabel}>전체 최고 랭킹</p>
                    <p style={styles.overlayStatValue}>
                      {overallHeroStats.bestRank != null ? `#${overallHeroStats.bestRank}` : '—'}
                    </p>
                  </div>
                  <div style={styles.overlayStatCard}>
                    <p style={styles.overlayStatLabel}>전체 최고 점수</p>
                    <p style={styles.overlayStatValue}>
                      {overallHeroStats.bestScore != null
                        ? formatPlayNumber(overallHeroStats.bestScore)
                        : '—'}
                    </p>
                  </div>
                </div>
                <div style={styles.overlayStatsRow}>
                  <div style={styles.overlayStatCard}>
                    <p style={styles.overlayStatLabel}>전체 평균 승률</p>
                    <p style={styles.overlayStatValue}>
                      {overallHeroStats.averageWinRate != null
                        ? formatWinRateValue(overallHeroStats.averageWinRate)
                        : '—'}
                    </p>
                  </div>
                  <div style={styles.overlayStatCard}>
                    <p style={styles.overlayStatLabel}>전체 전투 수</p>
                    <p style={styles.overlayStatValue}>
                      {overallHeroStats.totalBattles != null
                        ? formatPlayNumber(overallHeroStats.totalBattles)
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div style={styles.tapHint} aria-hidden="true">
          {currentOverlayMode === 'name' ? '탭해서 통계 보기' : '탭해서 카드 보기'}
        </div>
      </div>
    </div>
  )

  const showBgmBar = bgmEnabled

  const bgmBar = !showBgmBar ? null : (
    <div style={{ ...styles.hudSection }}>
      <div
        style={{
          ...styles.playerShell,
          ...(playerCollapsed ? styles.playerShellCollapsed : {}),
        }}
      >
        <div style={styles.playerHeader}>
          <div style={styles.playerHeaderLeft}>
            <button
              type="button"
              style={{
                ...styles.collapseButton,
                ...(playerCollapsed ? styles.collapseButtonCollapsed : {}),
              }}
              onClick={() => setPlayerCollapsed((prev) => !prev)}
              aria-label={playerCollapsed ? '재생바 펼치기' : '재생바 접기'}
            >
              {playerCollapsed ? '▲' : '▼'}
            </button>
            <span
              style={{
                ...styles.playerTitle,
                ...(playerCollapsed ? styles.playerTitleCollapsed : {}),
              }}
            >
              캐릭터 브금
            </span>
          </div>
          {!playerCollapsed && activeBgmUrl ? (
            <>
              <div
                style={styles.progressBar}
                role="presentation"
                onClick={handleSeek}
              >
                <div style={styles.progressFill(progressRatio)} />
              </div>
              <span style={styles.listMeta}>
                {formatTime(progress)} / {formatTime(duration)}
              </span>
            </>
          ) : null}
        </div>

        {!playerCollapsed ? (
          activeBgmUrl ? (
            <div style={styles.playerControls}>
              <button type="button" style={styles.playerButton} onClick={togglePlayback}>
                {isPlaying ? '일시정지' : '재생'}
              </button>
              <button type="button" style={styles.playerButton} onClick={stopPlayback}>
                처음으로
              </button>
            </div>
          ) : (
            <p style={styles.playerMessage}>등록된 브금이 없습니다.</p>
          )
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      {rankingOverlay}
      <div style={backgroundStyle}>
        <div style={styles.stage}>
          {playSliderSection}
          {heroSlide}
          {playStatsSection}
          {playDetailsSection}
        </div>

        <div style={styles.hudContainer}>
          {bgmBar}
          <div style={{ ...styles.hudSection }}>
            <div style={styles.dockContainer}>
              <div style={styles.dockToggleRow}>
                <button
                  type="button"
                  style={styles.dockToggleButton}
                  onClick={() => setDockCollapsed((prev) => !prev)}
                  aria-label={dockCollapsed ? '오버레이 펼치기' : '오버레이 접기'}
                >
                  {dockCollapsed ? '▲ 패널 펼치기' : '▼ 패널 접기'}
                </button>
              </div>
              {!dockCollapsed ? (
                <div style={styles.dock}>
                  <div style={styles.dockHeader}>
                    <div style={styles.dockTabs}>
                      {overlayTabs.map((tab, index) => (
                        <button
                          key={tab.key}
                          type="button"
                          style={styles.dockTabButton(index === activeTab)}
                          onClick={() => setActiveTab(index)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <div style={styles.dockActions}>
                      <Link href="/lobby" style={styles.lobbyButton}>
                        로비로
                      </Link>
                      <Link href="/roster" style={styles.rosterButton}>
                        로스터로
                      </Link>
                    </div>
                  </div>

                  {overlayBody}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <input
          type="file"
          accept="image/*"
          ref={imageInputRef}
          style={{ display: 'none' }}
          onChange={handleImageChange}
        />
        <input
          type="file"
          accept="image/*"
          ref={backgroundInputRef}
          style={{ display: 'none' }}
          onChange={handleBackgroundChange}
        />
        <input
          type="file"
          accept="audio/*"
          ref={bgmInputRef}
          style={{ display: 'none' }}
          onChange={handleBgmFileChange}
        />
      </div>
    </>
  )
}
