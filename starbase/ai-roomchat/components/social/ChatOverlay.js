'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import SurfaceOverlay from '@/components/common/SurfaceOverlay'
import FriendOverlay from '@/components/social/FriendOverlay'
import {
  createChatRoom,
  fetchChatDashboard,
  fetchChatRooms,
  fetchChatRoomAnnouncementDetail,
  fetchChatRoomAnnouncements,
  fetchChatRoomBans,
  fetchChatRoomStats,
  fetchChatMemberPreferences,
  joinChatRoom,
  leaveChatRoom,
  deleteChatRoom,
  manageChatRoomRole,
  createChatRoomAnnouncement,
  deleteChatRoomAnnouncement,
  toggleChatRoomAnnouncementReaction,
  createChatRoomAnnouncementComment,
  deleteChatRoomAnnouncementComment,
  markChatRoomRead,
  saveChatMemberPreferences,
  updateChatRoomSettings,
  updateChatRoomBan,
} from '@/lib/chat/rooms'
import {
  fetchRecentMessages,
  getCurrentUser,
  insertMessage,
  subscribeToMessages,
} from '@/lib/chat/messages'
import { supabase } from '@/lib/supabase'
import { useHeroSocialBootstrap } from '@/hooks/social/useHeroSocialBootstrap'
import { useFriendActions } from '@/hooks/social/useFriendActions'
import {
  fetchNativeMediaAsset,
  fetchNativeMediaTimeline,
  hasNativeMediaBridge,
  openNativeMediaSettings,
  requestNativeMediaPermission,
} from '@/lib/native/mediaLibrary'

const CHAT_ATTACHMENT_BUCKET = 'chat-attachments'
const ATTACHMENT_SIZE_LIMIT = 50 * 1024 * 1024
const MAX_VIDEO_DURATION = 4 * 60
const MAX_MESSAGE_PREVIEW_LENGTH = 240
const ANNOUNCEMENT_PREVIEW_LENGTH = 160
const MEDIA_LOAD_LIMIT = 120
const LONG_PRESS_THRESHOLD = 400
const MINI_OVERLAY_WIDTH = 320
const MINI_OVERLAY_HEIGHT = 420
const MINI_OVERLAY_MIN_HEIGHT = 240
const MINI_OVERLAY_MAX_HEIGHT = 640
const MINI_OVERLAY_BAR_HEIGHT = 56
const MINI_OVERLAY_MARGIN = 18
const MINI_OVERLAY_VISIBLE_MARGIN = 12
const PINCH_TRIGGER_RATIO = 0.7
const PINCH_MIN_DELTA = 28
const ROOM_BACKGROUND_FOLDER = 'room-backgrounds'
const MEMBER_BACKGROUND_FOLDER = 'member-backgrounds'
const ANNOUNCEMENT_MEDIA_FOLDER = 'room-announcements'
const ANNOUNCEMENT_IMAGE_SIZE_LIMIT = 20 * 1024 * 1024
const ANNOUNCEMENT_VIDEO_SIZE_LIMIT = 200 * 1024 * 1024
const ANNOUNCEMENT_TOOLBAR_COLORS = [
  '#f97316',
  '#facc15',
  '#10b981',
  '#0ea5e9',
  '#6366f1',
  '#ec4899',
  '#f8fafc',
  '#1e293b',
]
const ANNOUNCEMENT_TOOLBAR_SIZES = [
  { id: 'small', label: '작게', scale: 0.9, command: '3' },
  { id: 'normal', label: '보통', scale: 1, command: '4' },
  { id: 'large', label: '크게', scale: 1.15, command: '5' },
  { id: 'xlarge', label: '아주 크게', scale: 1.3, command: '6' },
]
const ANNOUNCEMENT_TOOLBAR_OVERLAY_SAFE_PADDING = 184
const ANNOUNCEMENT_SIZE_SCALE = ANNOUNCEMENT_TOOLBAR_SIZES.reduce((acc, item) => {
  acc[item.id] = item.scale
  return acc
}, {})
const ANNOUNCEMENT_FONT_SIZE_BY_COMMAND = ANNOUNCEMENT_TOOLBAR_SIZES.reduce((acc, item) => {
  acc[item.command] = item.id
  return acc
}, {})
const ANNOUNCEMENT_HIGHLIGHT_COLOR = '#facc15'
const ANNOUNCEMENT_POLL_MIN_OPTIONS = 2
const ANNOUNCEMENT_POLL_MAX_OPTIONS = 6
const ATTACHMENT_ICONS = {
  image: '🖼️',
  video: '🎬',
  file: '📄',
}

const AI_ASSISTANT_NAME = 'AI 어시스턴트'
const DEFAULT_VIEWPORT = { width: 1280, height: 800 }

function getAttachmentCacheKey(attachment) {
  if (!attachment) return ''
  const bucket = attachment.bucket || CHAT_ATTACHMENT_BUCKET
  const path = attachment.path || attachment.id || ''
  return `${bucket}/${path}`
}

function createLocalId(prefix = 'local') {
  if (typeof crypto !== 'undefined' && crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeFileName(name = '') {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '00:00'
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function normalizeColor(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const hexMatch = /^#([0-9a-f]{3,8})$/i
  const functionalMatch = /^(rgba?|hsla?)\(/i
  if (hexMatch.test(trimmed) || functionalMatch.test(trimmed)) {
    return trimmed
  }
  return null
}

function normalizeBackgroundUrl(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('/')) {
    return trimmed
  }
  return null
}

function isGradientValue(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return false
  return trimmed.startsWith('linear-gradient') || trimmed.startsWith('radial-gradient')
}

function isColorValue(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return false
  if (trimmed.startsWith('#')) {
    return /^#([0-9a-f]{3,8})$/i.test(trimmed)
  }
  return trimmed.startsWith('rgb(') || trimmed.startsWith('rgba(') || trimmed.startsWith('hsl(') || trimmed.startsWith('hsla(')
}

function normalizeThemeBackground(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isGradientValue(trimmed) || isColorValue(trimmed)) {
    return trimmed
  }
  return normalizeBackgroundUrl(trimmed)
}

function getColorPickerValue(input, fallback = '#1f2937') {
  const sanitize = (value) => {
    const normalized = normalizeColor(value)
    if (!normalized) return null
    const fullHex = normalized.match(/^#([0-9a-f]{6})$/i)
    if (fullHex) {
      return `#${fullHex[1].toLowerCase()}`
    }
    const shortHex = normalized.match(/^#([0-9a-f]{3})$/i)
    if (shortHex) {
      const [r, g, b] = shortHex[1].toLowerCase().split('')
      return `#${r}${r}${g}${g}${b}${b}`
    }
    const hexWithAlpha = normalized.match(/^#([0-9a-f]{8})$/i)
    if (hexWithAlpha) {
      return `#${hexWithAlpha[1].slice(0, 6).toLowerCase()}`
    }
    return null
  }

  return sanitize(input) || sanitize(fallback) || '#1f2937'
}

function classifyBackground(value, fallbackSample = '#1f2937') {
  const normalized = normalizeThemeBackground(value)
  if (!normalized) {
    return { type: 'none', value: '', sampleColor: fallbackSample }
  }
  if (isGradientValue(normalized)) {
    return { type: 'gradient', value: normalized, sampleColor: extractPrimaryColorFromGradient(normalized) || fallbackSample }
  }
  if (isColorValue(normalized)) {
    return { type: 'color', value: normalized, sampleColor: normalized }
  }
  return { type: 'image', value: normalized, sampleColor: fallbackSample }
}

function parseHexColor(input) {
  if (typeof input !== 'string') return null
  const hex = input.trim().replace(/^#/, '')
  if (!hex) return null
  if (hex.length === 3) {
    const [r, g, b] = hex.split('').map((char) => parseInt(char + char, 16))
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return null
    return { r, g, b, a: 1 }
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return null
    let a = 1
    if (hex.length === 8) {
      a = parseInt(hex.slice(6, 8), 16) / 255
    }
    return { r, g, b, a }
  }
  return null
}

function parseColor(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('#')) {
    return parseHexColor(trimmed)
  }
  const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i)
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length < 3) return null
    const r = parseFloat(parts[0])
    const g = parseFloat(parts[1])
    const b = parseFloat(parts[2])
    const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1
    if ([r, g, b, a].some((channel) => Number.isNaN(channel))) return null
    return { r, g, b, a }
  }
  return parseHexColor(trimmed)
}

function clampColorValue(value) {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function rgbToHex({ r, g, b }) {
  const toHex = (channel) => clampColorValue(channel).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function mixColors(colorA, colorB, ratio = 0.5) {
  const first = parseColor(colorA)
  const second = parseColor(colorB)
  if (!first || !second) {
    return colorA || colorB || '#1f2937'
  }
  const mixRatio = Math.min(1, Math.max(0, Number(ratio)))
  const inv = 1 - mixRatio
  return rgbToHex({
    r: first.r * mixRatio + second.r * inv,
    g: first.g * mixRatio + second.g * inv,
    b: first.b * mixRatio + second.b * inv,
  })
}

function adjustColorLuminance(color, delta = 0) {
  const parsed = parseColor(color)
  if (!parsed) {
    return color
  }
  const factor = 1 + delta
  return rgbToHex({ r: parsed.r * factor, g: parsed.g * factor, b: parsed.b * factor })
}

function getRelativeLuminance(color) {
  const parsed = parseColor(color)
  if (!parsed) {
    return 0
  }
  const transform = (channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const r = transform(parsed.r)
  const g = transform(parsed.g)
  const b = transform(parsed.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function getContrastRatio(foreground, background) {
  const lumA = getRelativeLuminance(foreground)
  const lumB = getRelativeLuminance(background)
  const brightest = Math.max(lumA, lumB)
  const darkest = Math.min(lumA, lumB)
  return (brightest + 0.05) / (darkest + 0.05)
}

function pickReadableTextColor(background) {
  const light = '#f8fafc'
  const dark = '#0f172a'
  const contrastWithLight = getContrastRatio(light, background)
  const contrastWithDark = getContrastRatio(dark, background)
  if (contrastWithLight >= 4.5 && contrastWithLight >= contrastWithDark) {
    return light
  }
  if (contrastWithDark >= 4.5 && contrastWithDark > contrastWithLight) {
    return dark
  }
  return contrastWithLight > contrastWithDark ? light : dark
}

function ensureAccentContrast(accent, bubble) {
  const desired = getContrastRatio(accent, bubble) >= 3
  if (desired) {
    return accent
  }
  const bubbleLum = getRelativeLuminance(bubble)
  const adjustment = bubbleLum > 0.5 ? -0.35 : 0.35
  return adjustColorLuminance(accent, adjustment)
}

function deriveAutoPalette({ background, accent, bubble, text }) {
  const sampleBackground = background || '#0f172a'
  let bubbleColor = bubble || mixColors(sampleBackground, '#0f172a', 0.72)
  const backgroundLum = getRelativeLuminance(sampleBackground)
  if (backgroundLum > 0.55) {
    bubbleColor = adjustColorLuminance(sampleBackground, -0.4)
  } else if (backgroundLum < 0.15) {
    bubbleColor = adjustColorLuminance(sampleBackground, 0.45)
  }
  const textColor = pickReadableTextColor(bubbleColor || sampleBackground)
  const accentColor = ensureAccentContrast(accent || '#38bdf8', bubbleColor || sampleBackground)
  return { bubbleColor: bubbleColor || '#1f2937', textColor: textColor || text, accentColor }
}

function extractPrimaryColorFromGradient(value) {
  if (typeof value !== 'string') return null
  const hexMatch = value.match(/#([0-9a-f]{3,8})/i)
  if (hexMatch) {
    return `#${hexMatch[1]}`
  }
  const rgbMatch = value.match(/rgba?\([^\)]+\)/i)
  if (rgbMatch) {
    return rgbMatch[0]
  }
  return null
}

const ROOM_THEME_LIBRARY = [
  {
    id: 'aurora-midnight',
    label: '오로라 미드나잇',
    value: 'linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #38bdf8 100%)',
    sampleColor: '#172554',
    recommended: {
      accentColor: '#38bdf8',
      bubbleColor: '#1f2937',
      textColor: '#f8fafc',
    },
  },
  {
    id: 'sunset-blend',
    label: '선셋 블렌드',
    value: 'linear-gradient(130deg, #f97316 0%, #ef4444 40%, #312e81 100%)',
    sampleColor: '#7c2d12',
    recommended: {
      accentColor: '#f97316',
      bubbleColor: '#1e1b4b',
      textColor: '#f8fafc',
    },
  },
  {
    id: 'forest-dawn',
    label: '포레스트 던',
    value: 'linear-gradient(140deg, #064e3b 0%, #1e3a8a 100%)',
    sampleColor: '#0f3c2d',
    recommended: {
      accentColor: '#22d3ee',
      bubbleColor: '#083344',
      textColor: '#ecfeff',
    },
  },
  {
    id: 'neon-grid',
    label: '네온 그리드',
    value: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(15, 15, 42, 0.7) 45%, rgba(59, 130, 246, 0.45) 100%)',
    sampleColor: '#1e3a8a',
    recommended: {
      accentColor: '#60a5fa',
      bubbleColor: '#1e293b',
      textColor: '#f1f5f9',
    },
  },
  {
    id: 'violet-mist',
    label: '바이올렛 미스트',
    value: 'linear-gradient(135deg, #312e81 0%, #7c3aed 50%, #f472b6 100%)',
    sampleColor: '#312e81',
    recommended: {
      accentColor: '#f472b6',
      bubbleColor: '#1e1b4b',
      textColor: '#fdf4ff',
    },
  },
  {
    id: 'oceanic-glow',
    label: '오셔닉 글로우',
    value: 'linear-gradient(135deg, #082f49 0%, #0ea5e9 60%, #38bdf8 100%)',
    sampleColor: '#0f3f5b',
    recommended: {
      accentColor: '#0ea5e9',
      bubbleColor: '#082f49',
      textColor: '#e0f2fe',
    },
  },
]

const DEFAULT_THEME_PRESET = ROOM_THEME_LIBRARY[0]

function getThemePreset(presetId) {
  if (!presetId) return DEFAULT_THEME_PRESET
  return ROOM_THEME_LIBRARY.find((preset) => preset.id === presetId) || DEFAULT_THEME_PRESET
}

async function uploadBackgroundImage({ file, roomId = null, ownerToken = null }) {
  if (!file) {
    throw new Error('업로드할 이미지를 선택해 주세요.')
  }
  if (file.size > ATTACHMENT_SIZE_LIMIT) {
    throw new Error('배경 이미지는 50MB 이하로 선택해 주세요.')
  }

  const extensionMatch = (file.name || '').match(/\.([a-z0-9]+)$/i)
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'webp'
  const sanitizedName = sanitizeFileName(file.name || `background.${extension}`)
  const segments = [ROOM_BACKGROUND_FOLDER]
  if (roomId) {
    segments.push(roomId)
  } else if (ownerToken) {
    segments.push(`owner-${ownerToken}`)
  } else {
    segments.push('shared')
  }
  const objectPath = `${segments.join('/')}/${createLocalId('bg')}-${sanitizedName}`

  const { error } = await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).upload(objectPath, file, {
    contentType: file.type || 'image/webp',
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    throw error
  }

  const { data } = supabase.storage.from(CHAT_ATTACHMENT_BUCKET).getPublicUrl(objectPath)
  if (!data?.publicUrl) {
    throw new Error('업로드한 배경의 공개 URL을 생성할 수 없습니다.')
  }

  return data.publicUrl
}

async function uploadAnnouncementImage({ file, roomId = null }) {
  if (!file) {
    throw new Error('업로드할 이미지를 선택해 주세요.')
  }

  if (file.size > ANNOUNCEMENT_IMAGE_SIZE_LIMIT) {
    throw new Error('공지 이미지는 20MB 이하로 선택해 주세요.')
  }

  const extensionMatch = (file.name || '').match(/\.([a-z0-9]+)$/i)
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'webp'
  const sanitizedName = sanitizeFileName(file.name || `announcement.${extension}`)
  const segments = [ANNOUNCEMENT_MEDIA_FOLDER]
  if (roomId) {
    segments.push(roomId)
  } else {
    segments.push('shared')
  }

  const objectPath = `${segments.join('/')}/${createLocalId('notice')}-${sanitizedName}`

  const { error } = await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).upload(objectPath, file, {
    contentType: file.type || 'image/webp',
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    throw error
  }

  const { data } = supabase.storage.from(CHAT_ATTACHMENT_BUCKET).getPublicUrl(objectPath)
  if (!data?.publicUrl) {
    throw new Error('업로드한 공지 이미지를 확인할 수 없습니다.')
  }

  return data.publicUrl
}

async function uploadAnnouncementMedia({ file, roomId = null, kind = 'image' }) {
  if (!file) {
    throw new Error('업로드할 파일을 선택해 주세요.')
  }

  const sizeLimit = kind === 'video' ? ANNOUNCEMENT_VIDEO_SIZE_LIMIT : ANNOUNCEMENT_IMAGE_SIZE_LIMIT
  if (file.size > sizeLimit) {
    if (kind === 'video') {
      throw new Error('동영상은 200MB 이하로 업로드해 주세요.')
    }
    throw new Error('이미지는 20MB 이하로 업로드해 주세요.')
  }

  const extensionMatch = (file.name || '').match(/\.([a-z0-9]+)$/i)
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : kind === 'video' ? 'mp4' : 'webp'
  const sanitizedName = sanitizeFileName(file.name || `${kind}.${extension}`)
  const segments = [ANNOUNCEMENT_MEDIA_FOLDER]
  if (roomId) {
    segments.push(roomId)
  } else {
    segments.push('shared')
  }
  segments.push('inline', kind)

  const objectPath = `${segments.join('/')}/${Date.now()}-${createLocalId(kind)}-${sanitizedName}`

  const { error } = await supabase.storage.from(CHAT_ATTACHMENT_BUCKET).upload(objectPath, file, {
    contentType: file.type || (kind === 'video' ? 'video/mp4' : 'image/webp'),
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    throw error
  }

  const { data } = supabase.storage.from(CHAT_ATTACHMENT_BUCKET).getPublicUrl(objectPath)
  if (!data?.publicUrl) {
    throw new Error('업로드한 파일의 공개 URL을 생성할 수 없습니다.')
  }

  return {
    url: data.publicUrl,
    path: objectPath,
  }
}

const DEFAULT_THEME_CONFIG = {
  mode: 'preset',
  presetId: DEFAULT_THEME_PRESET.id,
  backgroundUrl: '',
  backgroundColor: DEFAULT_THEME_PRESET.sampleColor,
  accentColor: DEFAULT_THEME_PRESET.recommended.accentColor,
  bubbleColor: DEFAULT_THEME_PRESET.recommended.bubbleColor,
  textColor: DEFAULT_THEME_PRESET.recommended.textColor,
  autoContrast: true,
}

function normalizeThemeConfig(theme, fallback = DEFAULT_THEME_CONFIG) {
  const base = { ...DEFAULT_THEME_CONFIG, ...fallback }
  const source = theme && typeof theme === 'object' ? theme : {}
  const allowedModes = new Set(['preset', 'color', 'image', 'none'])
  const mode = allowedModes.has(source.mode) ? source.mode : base.mode
  const preset = getThemePreset(source.presetId || base.presetId)
  const accentColor = normalizeColor(source.accentColor) || normalizeColor(base.accentColor) || preset.recommended.accentColor
  const bubbleColor = normalizeColor(source.bubbleColor) || normalizeColor(base.bubbleColor) || preset.recommended.bubbleColor
  const textColor = normalizeColor(source.textColor) || normalizeColor(base.textColor) || preset.recommended.textColor
  const backgroundColor = normalizeColor(source.backgroundColor) || normalizeColor(base.backgroundColor) || preset.sampleColor
  const backgroundUrl = typeof source.backgroundUrl === 'string' ? source.backgroundUrl.trim() : base.backgroundUrl || ''
  const autoContrast = source.autoContrast === false ? false : true
  return {
    mode,
    presetId: preset.id,
    backgroundUrl,
    backgroundColor,
    accentColor,
    bubbleColor,
    textColor,
    autoContrast,
  }
}

function deriveThemePalette(config) {
  const preset = getThemePreset(config.presetId)
  let backgroundValue = ''
  if (config.mode === 'preset') {
    backgroundValue = preset.value
  } else if (config.mode === 'color') {
    backgroundValue = config.backgroundColor || preset.sampleColor || preset.recommended.bubbleColor
  } else if (config.mode === 'image') {
    backgroundValue = config.backgroundUrl || ''
  } else {
    backgroundValue = ''
  }

  const descriptor = classifyBackground(backgroundValue, preset.sampleColor || preset.recommended.bubbleColor)
  const sampleColor = config.mode === 'color' && config.backgroundColor ? config.backgroundColor : descriptor.sampleColor
  let accentColor = config.accentColor || preset.recommended.accentColor
  let bubbleColor = config.bubbleColor || preset.recommended.bubbleColor
  let textColor = config.textColor || preset.recommended.textColor

  if (config.autoContrast !== false) {
    const auto = deriveAutoPalette({
      background: sampleColor || preset.sampleColor || preset.recommended.bubbleColor,
      accent: accentColor,
      bubble: bubbleColor,
      text: textColor,
    })
    bubbleColor = auto.bubbleColor
    textColor = auto.textColor
    accentColor = auto.accentColor
  }

  return {
    mode: config.mode,
    presetId: preset.id,
    backgroundValue,
    backgroundColor: config.backgroundColor,
    backgroundUrl: config.backgroundUrl,
    bubbleColor,
    textColor,
    accentColor,
    autoContrast: config.autoContrast !== false,
    descriptor,
    sampleColor: sampleColor || descriptor.sampleColor,
  }
}

function buildThemePaletteFromDraft(draft, options = {}) {
  const normalized = normalizeThemeConfig(
    {
      mode: draft.themeMode,
      presetId: draft.themePresetId,
      backgroundUrl: draft.themeBackgroundUrl || draft.backgroundUrl,
      backgroundColor: draft.themeBackgroundColor || draft.backgroundColor,
      accentColor: draft.accentColor,
      bubbleColor: draft.bubbleColor,
      textColor: draft.textColor,
      autoContrast: draft.autoContrast,
    },
    options.fallback || {
      ...DEFAULT_THEME_CONFIG,
      presetId: draft.themePresetId || DEFAULT_THEME_PRESET.id,
      mode: draft.themeMode || DEFAULT_THEME_CONFIG.mode,
      backgroundUrl: draft.themeBackgroundUrl || draft.backgroundUrl || options.fallbackBackgroundUrl || '',
      backgroundColor: draft.themeBackgroundColor || draft.backgroundColor || DEFAULT_THEME_CONFIG.backgroundColor,
      accentColor: draft.accentColor || DEFAULT_THEME_CONFIG.accentColor,
      bubbleColor: draft.bubbleColor || DEFAULT_THEME_CONFIG.bubbleColor,
      textColor: draft.textColor || DEFAULT_THEME_CONFIG.textColor,
      autoContrast: draft.autoContrast !== false,
    },
  )
  return deriveThemePalette(normalized)
}

function mergeThemePalettes(roomPalette, memberPalette, useRoomBackground = true) {
  const backgroundSource = useRoomBackground ? roomPalette : memberPalette
  const fallbackSample = roomPalette.sampleColor || memberPalette.sampleColor || DEFAULT_THEME_PRESET.sampleColor
  const backgroundValue = backgroundSource.backgroundValue || roomPalette.backgroundValue
  const descriptor = classifyBackground(backgroundValue, fallbackSample)
  const bubbleColor = memberPalette.bubbleColor || roomPalette.bubbleColor
  const textColor = memberPalette.textColor || roomPalette.textColor
  const accentColor = memberPalette.accentColor || roomPalette.accentColor
  return {
    mode: backgroundSource.mode,
    presetId: backgroundSource.presetId,
    backgroundValue,
    bubbleColor,
    textColor,
    accentColor,
    autoContrast: backgroundSource.autoContrast !== false,
    descriptor,
    sampleColor: descriptor.sampleColor || fallbackSample,
  }
}

const ACCENT_SWATCHES = [
  '#38bdf8',
  '#f97316',
  '#22d3ee',
  '#f472b6',
  '#22c55e',
  '#eab308',
  '#a855f7',
  '#f43f5e',
]

const BAN_DURATION_PRESETS = [
  { label: '즉시 해제', minutes: 0 },
  { label: '30분', minutes: 30 },
  { label: '1시간', minutes: 60 },
  { label: '6시간', minutes: 360 },
  { label: '1일', minutes: 1440 },
  { label: '3일', minutes: 4320 },
  { label: '영구', minutes: null },
]


const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(value) {
  if (value === null || value === undefined) return false
  const token = String(value).trim()
  return UUID_PATTERN.test(token)
}

function distanceBetweenTouches(touchA, touchB) {
  if (!touchA || !touchB) return 0
  const dx = (touchA.clientX || 0) - (touchB.clientX || 0)
  const dy = (touchA.clientY || 0) - (touchB.clientY || 0)
  return Math.sqrt(dx * dx + dy * dy)
}

function clampMiniOverlayPosition(
  position,
  viewport,
  width = MINI_OVERLAY_WIDTH,
  height = MINI_OVERLAY_HEIGHT,
  margin = MINI_OVERLAY_MARGIN,
  visibleEdge = MINI_OVERLAY_VISIBLE_MARGIN,
) {
  const safeWidth = Math.max(Number(viewport?.width) || DEFAULT_VIEWPORT.width || width, width + margin * 2)
  const safeHeight = Math.max(Number(viewport?.height) || DEFAULT_VIEWPORT.height || height, height + margin * 2)
  const nextX = typeof position?.x === 'number' ? position.x : safeWidth - width - margin
  const nextY = typeof position?.y === 'number' ? position.y : safeHeight - height - margin
  const edge = Math.max(visibleEdge, margin)
  const minX = edge - width
  const maxX = safeWidth - edge
  const minY = edge - height
  const maxY = safeHeight - edge
  const clampedX = Math.min(Math.max(minX, nextX), maxX)
  const clampedY = Math.min(Math.max(minY, nextY), maxY)
  return { x: clampedX, y: clampedY }
}

function getViewportSnapshot() {
  if (typeof window === 'undefined') {
    return {
      ...DEFAULT_VIEWPORT,
      innerWidth: DEFAULT_VIEWPORT.width,
      innerHeight: DEFAULT_VIEWPORT.height,
      offsetTop: 0,
      offsetLeft: 0,
      safeAreaTop: 0,
      safeAreaBottom: 0,
      scale: 1,
    }
  }

  const { innerWidth, innerHeight, visualViewport } = window
  const viewportWidth = visualViewport?.width ?? innerWidth
  const viewportHeight = visualViewport?.height ?? innerHeight
  const offsetTop = visualViewport?.offsetTop ?? 0
  const offsetLeft = visualViewport?.offsetLeft ?? 0
  const scale = visualViewport?.scale ?? 1
  const safeAreaTop = Math.max(0, offsetTop)
  const safeAreaBottom = Math.max(0, innerHeight - offsetTop - viewportHeight)

  return {
    width: viewportWidth,
    height: viewportHeight,
    innerWidth,
    innerHeight,
    offsetTop,
    offsetLeft,
    safeAreaTop,
    safeAreaBottom,
    scale,
  }
}

function getFriendDisplayName(friend) {
  if (!friend) return '친구'
  return (
    friend.friendHeroName ||
    friend.currentHeroName ||
    friend.displayName ||
    friend.username ||
    '친구'
  )
}

async function blobFromCanvas(canvas, type = 'image/webp', quality = 0.82) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('이미지 데이터를 생성할 수 없습니다.'))
      }
    }, type, quality)
  })
}

async function compressBlob(blob, encoding = 'gzip') {
  if (typeof CompressionStream === 'undefined') {
    return { blob, encoding: 'none' }
  }
  const stream = blob.stream().pipeThrough(new CompressionStream(encoding))
  const compressed = await new Response(stream).blob()
  return { blob: compressed, encoding }
}

async function decompressBlob(blob, encoding) {
  if (!encoding || encoding === 'none') {
    return blob
  }
  if (typeof DecompressionStream === 'undefined') {
    return blob
  }
  const stream = blob.stream().pipeThrough(new DecompressionStream(encoding))
  return new Response(stream).blob()
}

async function createImageAttachmentDraft(file) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })

    const maxDimension = 1600
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const processedBlob = await blobFromCanvas(canvas)
    const { blob: compressedBlob, encoding } = await compressBlob(processedBlob)

    const previewCanvas = document.createElement('canvas')
    const previewMax = 360
    const previewScale = Math.min(1, previewMax / Math.max(image.width, image.height))
    previewCanvas.width = Math.max(1, Math.round(image.width * previewScale))
    previewCanvas.height = Math.max(1, Math.round(image.height * previewScale))
    const previewCtx = previewCanvas.getContext('2d')
    previewCtx.drawImage(image, 0, 0, previewCanvas.width, previewCanvas.height)
    const previewUrl = previewCanvas.toDataURL('image/webp', 0.82)

    return {
      id: createLocalId('image'),
      type: 'image',
      name: file.name,
      originalSize: file.size,
      size: compressedBlob.size,
      encoding,
      blob: compressedBlob,
      contentType: 'image/webp',
      width: canvas.width,
      height: canvas.height,
      previewUrl,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function isFileSupportedByAction(file, action) {
  if (!file) return false
  if (action === 'photo') {
    return file.type?.startsWith('image/')
  }
  if (action === 'video') {
    return file.type?.startsWith('video/')
  }
  return true
}

async function loadVideoMetadata(file) {
  const url = URL.createObjectURL(file)
  try {
    const meta = await new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight })
      }
      video.onerror = (event) => reject(event?.error || new Error('동영상 정보를 불러오지 못했습니다.'))
      video.src = url
    })
    return meta
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function createVideoAttachmentDraft(file) {
  const { duration, width, height } = await loadVideoMetadata(file)
  if (Number.isFinite(duration) && duration > MAX_VIDEO_DURATION) {
    throw new Error('4분을 초과하는 동영상은 업로드할 수 없습니다.')
  }

  const { blob: compressedBlob, encoding } = await compressBlob(file)

  let previewUrl = ''
  const videoUrl = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = videoUrl
    await new Promise((resolve) => {
      video.onloadeddata = resolve
      video.onloadedmetadata = resolve
    })
    video.currentTime = Math.min(1, Math.max(0, duration / 2))
    await new Promise((resolve) => {
      video.onseeked = resolve
    })
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    previewUrl = canvas.toDataURL('image/webp', 0.82)
  } catch (error) {
    console.warn('[chat] 동영상 미리보기를 생성할 수 없습니다.', error)
  } finally {
    URL.revokeObjectURL(videoUrl)
  }

  return {
    id: createLocalId('video'),
    type: 'video',
    name: file.name,
    originalSize: file.size,
    size: compressedBlob.size,
    encoding,
    blob: compressedBlob,
    contentType: file.type || 'video/mp4',
    previewUrl,
    duration,
    width,
    height,
  }
}

async function createFileAttachmentDraft(file) {
  const { blob: compressedBlob, encoding } = await compressBlob(file)
  return {
    id: createLocalId('file'),
    type: 'file',
    name: file.name,
    originalSize: file.size,
    size: compressedBlob.size,
    encoding,
    blob: compressedBlob,
    contentType: file.type || 'application/octet-stream',
  }
}

function isLikelyHtml(value = '') {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  return /<([a-z][^>]*|!--)/i.test(trimmed)
}

function sanitizeStyleValue(property, raw) {
  const value = raw.trim()
  if (!value) return null
  const allowedColors = new Set(['color', 'background-color'])
  if (allowedColors.has(property)) {
    const normalized = normalizeColor(value)
    return normalized
  }
  if (property === 'font-size') {
    const numericMatch = value.match(/^(\d+(?:\.\d+)?)px$/i)
    if (numericMatch) {
      const pixels = Math.min(Math.max(parseFloat(numericMatch[1]), 8), 64)
      return `${pixels}px`
    }
  }
  if (property === 'font-weight') {
    if (value === 'bold' || value === '700') {
      return '700'
    }
  }
  if (property === 'font-style') {
    if (value === 'italic') {
      return 'italic'
    }
  }
  if (property === 'text-decoration') {
    if (value === 'underline' || value === 'line-through') {
      return value
    }
  }
  return null
}

function sanitizeAnnouncementHtml(value = '') {
  if (!value) return ''
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return String(value)
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/ on[a-z]+="[^"]*"/gi, '')
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<!doctype html><body>${value}</body>`, 'text/html')
  const allowedTags = new Set([
    'div',
    'p',
    'br',
    'strong',
    'em',
    'mark',
    'span',
    'figure',
    'figcaption',
    'img',
    'video',
    'source',
    'ul',
    'ol',
    'li',
    'iframe',
    'a',
  ])
  const attributeAllowList = {
    img: new Set(['src', 'alt', 'loading']),
    video: new Set(['src', 'controls', 'playsinline', 'poster', 'loop', 'muted']),
    source: new Set(['src', 'type']),
    iframe: new Set(['src', 'allow', 'allowfullscreen', 'loading', 'title']),
    a: new Set(['href', 'target', 'rel']),
    div: new Set(['data-announcement-poll', 'data-poll-question']),
    span: new Set(['data-font-size']),
  }

  const sanitizeNode = (node) => {
    if (!node) return
    const { nodeType } = node
    if (nodeType === Node.COMMENT_NODE) {
      node.remove()
      return
    }
    if (nodeType === Node.TEXT_NODE) {
      return
    }
    if (nodeType !== Node.ELEMENT_NODE) {
      node.remove()
      return
    }

    let tagName = node.tagName.toLowerCase()
    if (tagName === 'b') {
      const strong = doc.createElement('strong')
      while (node.firstChild) {
        strong.appendChild(node.firstChild)
      }
      node.replaceWith(strong)
      node = strong
      tagName = 'strong'
    } else if (tagName === 'i') {
      const em = doc.createElement('em')
      while (node.firstChild) {
        em.appendChild(node.firstChild)
      }
      node.replaceWith(em)
      node = em
      tagName = 'em'
    } else if (tagName === 'font') {
      const span = doc.createElement('span')
      const fontColor = node.getAttribute('color')
      const fontSize = node.getAttribute('size')
      if (fontColor) {
        const safe = normalizeColor(fontColor)
        if (safe) {
          span.style.color = safe
        }
      }
      if (fontSize) {
        const mapped = ANNOUNCEMENT_FONT_SIZE_BY_COMMAND[fontSize]
        if (mapped && ANNOUNCEMENT_SIZE_SCALE[mapped]) {
          span.style.fontSize = `${ANNOUNCEMENT_SIZE_SCALE[mapped]}em`
          span.dataset.fontSize = mapped
        }
      }
      while (node.firstChild) {
        span.appendChild(node.firstChild)
      }
      node.replaceWith(span)
      node = span
      tagName = 'span'
    }

    if (!allowedTags.has(tagName)) {
      if (node.childNodes.length) {
        const fragment = doc.createDocumentFragment()
        while (node.firstChild) {
          fragment.appendChild(node.firstChild)
        }
        node.replaceWith(fragment)
      } else {
        node.remove()
      }
      return
    }

    const allowedAttributes = attributeAllowList[tagName] || new Set()
    const attributes = Array.from(node.attributes || [])
    attributes.forEach((attr) => {
      const name = attr.name.toLowerCase()
      const value = attr.value
      if (name === 'style') {
        const parts = value.split(';')
        const sanitized = []
        parts.forEach((part) => {
          const [rawProperty, rawValue] = part.split(':')
          if (!rawProperty || !rawValue) return
          const property = rawProperty.trim().toLowerCase()
          const safeValue = sanitizeStyleValue(property, rawValue)
          if (safeValue) {
            sanitized.push(`${property}: ${safeValue}`)
          }
        })
        if (sanitized.length) {
          node.setAttribute('style', sanitized.join('; '))
        } else {
          node.removeAttribute('style')
        }
        return
      }

      if (allowedAttributes.has(name)) {
        if (name === 'src' || name === 'href' || name === 'poster') {
          const safeUrl = sanitizeExternalUrl(value)
          if (safeUrl) {
            node.setAttribute(name, safeUrl)
          } else {
            node.removeAttribute(name)
          }
          if (tagName === 'a' && name === 'href') {
            node.setAttribute('target', '_blank')
            node.setAttribute('rel', 'noopener noreferrer')
          }
          return
        }
        if (name === 'loading') {
          node.setAttribute('loading', 'lazy')
          return
        }
        if (name === 'allow') {
          node.setAttribute(
            'allow',
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
          )
          return
        }
        if (name === 'allowfullscreen') {
          node.setAttribute('allowfullscreen', '')
          return
        }
        return
      }

      if (name.startsWith('data-')) {
        return
      }

      node.removeAttribute(name)
    })

    Array.from(node.childNodes).forEach(sanitizeNode)
  }

  Array.from(doc.body.childNodes).forEach(sanitizeNode)
  return doc.body.innerHTML
}

function getAnnouncementPlainText(value = '') {
  if (!value) return ''
  const html = formatAnnouncementPreview(value)
  if (!html) return ''
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<!doctype html><body>${html}</body>`, 'text/html')
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
  }
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function truncateText(value = '', limit = MAX_MESSAGE_PREVIEW_LENGTH) {
  if (!value) return { text: '', truncated: false }
  const plain = getAnnouncementPlainText(value)
  if (!plain) {
    return { text: '', truncated: false }
  }
  if (plain.length <= limit) {
    return { text: plain, truncated: false }
  }
  return { text: `${plain.slice(0, limit)}…`, truncated: true }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeHtmlEntities(value = '') {
  if (!value) return ''
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function sanitizeExternalUrl(value = '') {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return ''
    }
    return url.href
  } catch (error) {
    return ''
  }
}

function sanitizeYoutubeId(value = '') {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const direct = trimmed.match(/^[a-zA-Z0-9_-]{6,15}$/)
  if (direct) {
    return trimmed
  }
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '')
      return id.match(/^[a-zA-Z0-9_-]{6,15}$/) ? id : null
    }
    if (host.endsWith('youtube.com')) {
      const id = parsed.searchParams.get('v') || parsed.pathname.split('/').pop()
      return id && id.match(/^[a-zA-Z0-9_-]{6,15}$/) ? id : null
    }
  } catch (error) {
    return null
  }
  return null
}

function getYoutubeEmbedUrl(id = '') {
  if (!id) return ''
  return `https://www.youtube.com/embed/${id}`
}

function formatAnnouncementPreview(value = '') {
  if (!value) return ''
  if (isLikelyHtml(value)) {
    return sanitizeAnnouncementHtml(value)
  }
  let html = escapeHtml(value)
  html = html.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/gs, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/gs, '<em>$1</em>')
  html = html.replace(/_(.+?)_/gs, '<em>$1</em>')
  html = html.replace(/~~(.+?)~~/gs, '<mark>$1</mark>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  html = html.replace(/!&#91;(.*?)&#93;\((https?:[^)]+)\)/gi, (match, rawAlt, rawUrl) => {
    const url = sanitizeExternalUrl(decodeHtmlEntities(rawUrl))
    if (!url) return match
    const alt = escapeHtml(decodeHtmlEntities(rawAlt || '첨부 이미지'))
    return `
<figure style="margin: 12px 0; border-radius: 12px; overflow: hidden; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.35);">
  <img src="${url}" alt="${alt}" style="display: block; width: 100%; height: auto;" loading="lazy" />
  <figcaption style="padding: 6px 10px; font-size: 12px; color: #cbd5f5;">${alt}</figcaption>
</figure>`
  })

  html = html.replace(/&#91;color=([^&#]+)&#93;(.*?)&#91;\/color&#93;/gis, (match, rawColor, inner) => {
    const color = normalizeColor(decodeHtmlEntities(rawColor))
    if (!color) return match
    return `<span style="color: ${color}">${inner}</span>`
  })

  html = html.replace(/&#91;size=([^&#]+)&#93;(.*?)&#91;\/size&#93;/gis, (match, rawSize, inner) => {
    const sizeId = decodeHtmlEntities(rawSize || '').trim().toLowerCase()
    const scale = ANNOUNCEMENT_SIZE_SCALE[sizeId] || 1
    return `<span style="display: inline-block; font-size: ${scale}em" data-font-size="${sizeId}">${inner}</span>`
  })

  html = html.replace(/&#91;video([^&#]*)&#93;/gi, (match, rawAttrs) => {
    const attrs = decodeHtmlEntities(rawAttrs || '')
    const srcMatch = attrs.match(/src="([^"]+)"/i)
    const posterMatch = attrs.match(/poster="([^"]+)"/i)
    const url = sanitizeExternalUrl(srcMatch ? srcMatch[1] : '')
    if (!url) return ''
    const poster = sanitizeExternalUrl(posterMatch ? posterMatch[1] : '')
    const posterAttr = poster ? ` poster="${poster}"` : ''
    return `
<div style="margin: 12px 0; border-radius: 12px; overflow: hidden; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.35);">
  <video src="${url}" controls playsinline style="display: block; width: 100%; max-height: 320px; background: #000;"${posterAttr}></video>
</div>`
  })

  html = html.replace(/&#91;youtube([^&#]*)&#93;/gi, (match, rawAttrs) => {
    const attrs = decodeHtmlEntities(rawAttrs || '')
    const idMatch = attrs.match(/id="([^"]+)"/i)
    const urlMatch = attrs.match(/url="([^"]+)"/i)
    const titleMatch = attrs.match(/title="([^"]*)"/i)
    const thumbnailMatch = attrs.match(/thumbnail="([^"]*)"/i)
    const youtubeId = sanitizeYoutubeId(idMatch ? idMatch[1] : urlMatch ? urlMatch[1] : '')
    if (!youtubeId) return ''
    const title = escapeHtml(decodeHtmlEntities(titleMatch ? titleMatch[1] : 'YouTube 영상'))
    const embedUrl = getYoutubeEmbedUrl(youtubeId)
    const thumbUrl = sanitizeExternalUrl(thumbnailMatch ? thumbnailMatch[1] : '')
    const preview = thumbUrl
      ? `<img src="${thumbUrl}" alt="${title}" style="display:block;width:100%;height:auto;" loading="lazy" />`
      : `<iframe src="${embedUrl}" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" style="width:100%;min-height:220px;border:0;border-radius:12px;"></iframe>`
    const footer = thumbUrl
      ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><span style="background:rgba(15,23,42,0.75);color:#f8fafc;padding:8px 14px;border-radius:999px;font-size:13px;">▶ ${title}</span></div>`
      : ''
    return `
<div style="position: relative; margin: 12px 0; border-radius: 14px; overflow: hidden; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.35);">
  ${preview}
  ${footer}
  <div style="padding: 8px 12px; font-size: 12px; color: #cbd5f5;">${title}</div>
  ${thumbUrl ? `<iframe src="${embedUrl}" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" style="position:absolute; inset:0; opacity:0;" tabindex="-1"></iframe>` : ''}
</div>`
  })

  html = html.replace(/&#91;poll([^&#]*)&#93;([\s\S]*?)&#91;\/poll&#93;/gi, (match, rawAttrs, rawBody) => {
    const attrs = decodeHtmlEntities(rawAttrs || '')
    const questionMatch = attrs.match(/question="([^"]*)"/i)
    const decodedQuestion = questionMatch ? questionMatch[1] : ''
    const question = escapeHtml(decodedQuestion || '투표')
    const lines = rawBody.split(/\r?\n/)
    const options = []
    lines.forEach((line) => {
      const decoded = decodeHtmlEntities(line.trim())
      const matchOption = decoded.match(/^[-•]\s*(.+)$/)
      if (matchOption && matchOption[1]) {
        options.push(escapeHtml(matchOption[1]))
      }
    })
    if (!options.length) {
      return `<div style="margin: 12px 0; padding: 12px; border-radius: 12px; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148,163,184,0.35);"><strong style="display:block;font-size:13px;color:#e2e8f0;">${question}</strong><span style="font-size:12px;color:#94a3b8;">옵션이 없는 투표</span></div>`
    }
    const optionsHtml = options
      .map((option) => `<li style="padding: 8px 10px; border-radius: 10px; background: rgba(15,23,42,0.55); margin-top: 6px; color: #e2e8f0; font-size: 13px;">${option}</li>`)
      .join('')
    return `<div style="margin: 12px 0; padding: 12px; border-radius: 12px; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148,163,184,0.35);" data-announcement-poll="true" data-poll-question="${question}"><strong style="display:block;font-size:13px;color:#e2e8f0;">${question}</strong><ul style="list-style:none;padding:0;margin:6px 0 0;">${optionsHtml}</ul></div>`
  })

  html = html.replace(/\n/g, '<br />')
  return sanitizeAnnouncementHtml(html)
}

function sameMinute(a, b) {
  if (!a || !b) return false
  try {
    const first = new Date(a)
    const second = new Date(b)
    if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return false
    return (
      first.getFullYear() === second.getFullYear() &&
      first.getMonth() === second.getMonth() &&
      first.getDate() === second.getDate() &&
      first.getHours() === second.getHours() &&
      first.getMinutes() === second.getMinutes()
    )
  } catch (error) {
    return false
  }
}

async function uploadAttachmentDraft({ blob, name, encoding, contentType }) {
  const safeName = sanitizeFileName(name)
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}.gz`
  const { error } = await supabase.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .upload(path, blob, {
      cacheControl: '3600',
      contentType: 'application/octet-stream',
      upsert: false,
    })

  if (error) {
    throw error
  }

  return {
    bucket: CHAT_ATTACHMENT_BUCKET,
    path,
    encoding,
    content_type: contentType,
    name,
    size: blob.size,
  }
}

async function fetchAttachmentBlob(attachment) {
  const bucket = attachment.bucket || CHAT_ATTACHMENT_BUCKET
  const path = attachment.path
  if (!bucket || !path) {
    throw new Error('첨부 파일 위치를 확인할 수 없습니다.')
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
  if (error || !data?.signedUrl) {
    throw error || new Error('첨부 파일 URL을 생성하지 못했습니다.')
  }

  const response = await fetch(data.signedUrl)
  if (!response.ok) {
    throw new Error('첨부 파일을 다운로드할 수 없습니다.')
  }

  const blob = await response.blob()
  return decompressBlob(blob, attachment.encoding)
}

const normalizeMessageRecord = (record) => {
  if (!record || typeof record !== 'object') {
    return null
  }

  const createdAt = record.created_at || record.createdAt || null
  return {
    ...record,
    created_at: createdAt,
    hero_name: record.hero_name || record.username || '익명',
  }
}

const toChrono = (value) => {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const upsertMessageList = (current, incoming) => {
  const next = Array.isArray(current) ? [...current] : []
  const payload = Array.isArray(incoming) ? incoming : [incoming]

  for (const candidate of payload) {
    const normalized = normalizeMessageRecord(candidate)
    if (!normalized) continue
    const identifier = normalized.id || normalized.local_id || normalized.created_at
    if (!identifier) continue

    const index = next.findIndex((item) => {
      if (!item) return false
      if (item.id && normalized.id) {
        return String(item.id) === String(normalized.id)
      }
      if (item.local_id && normalized.local_id) {
        return String(item.local_id) === String(normalized.local_id)
      }
      if (item.created_at && normalized.created_at) {
        return String(item.created_at) === String(normalized.created_at)
      }
      return false
    })

    if (index >= 0) {
      next[index] = { ...next[index], ...normalized }
    } else {
      next.push(normalized)
    }
  }

  return next
    .filter(Boolean)
    .sort((a, b) => toChrono(a?.created_at) - toChrono(b?.created_at))
}

const overlayStyles = {
  frame: {
    position: 'relative',
    background: 'rgba(15, 23, 42, 0.94)',
    borderRadius: 30,
    border: '1px solid rgba(71, 85, 105, 0.45)',
    padding: '28px 28px calc(48px + var(--chat-overlay-safe-bottom, env(safe-area-inset-bottom, 16px)))',
    minHeight: 'min(var(--chat-overlay-viewport-height, 96dvh), 860px)',
    maxHeight: 'min(var(--chat-overlay-viewport-height, 100dvh), 920px)',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    boxSizing: 'border-box',
    alignItems: 'stretch',
    flex: 1,
    overflow: 'hidden',
    transition: 'min-height 0.2s ease, max-height 0.2s ease',
  },
  root: (focused, compact = false, viewportHeight = null) => {
    const numericHeight =
      typeof viewportHeight === 'number' && Number.isFinite(viewportHeight) ? viewportHeight : null
    const effectiveHeight = compact && numericHeight ? Math.max(numericHeight - 48, 320) : null

    return {
      display: 'grid',
      gridTemplateColumns:
        focused && !compact ? 'minmax(260px, 300px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
      gap: compact ? 12 : 18,
      height: compact
        ? effectiveHeight
          ? `${effectiveHeight}px`
          : 'calc(100dvh - 48px)'
        : 'min(90dvh, 800px)',
      minHeight: compact
        ? effectiveHeight
          ? Math.max(effectiveHeight, 420)
          : 'min(560px, 92dvh)'
        : 'min(600px, 88dvh)',
      width: '100%',
      maxWidth: '100%',
      padding: 0,
      boxSizing: 'border-box',
    }
  },
  sidePanel: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',
    background: 'rgba(12, 20, 45, 0.92)',
    borderRadius: 22,
    border: '1px solid rgba(71, 85, 105, 0.45)',
    overflow: 'hidden',
    minHeight: 0,
  },
  sideActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px 10px',
    background: 'rgba(15, 23, 42, 0.96)',
  },
  sideActionsLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  lobbyCloseButton: {
    appearance: 'none',
    border: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'rgba(15, 23, 42, 0.7)',
    color: '#cbd5f5',
    borderRadius: 12,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sideActionsRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  actionIconButton: (active = false) => ({
    width: 38,
    height: 38,
    borderRadius: 12,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.7)'
      : '1px solid rgba(71, 85, 105, 0.55)',
    background: active ? 'rgba(37, 99, 235, 0.32)' : 'rgba(15, 23, 42, 0.7)',
    color: '#e0f2fe',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  }),
  sideContent: {
    padding: '0 16px 18px',
    overflowY: 'auto',
    display: 'grid',
    gap: 18,
    background: 'rgba(10, 16, 35, 0.65)',
  },
  tabBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 10,
    padding: '12px 16px 14px',
    background: 'rgba(15, 23, 42, 0.96)',
  },
  tabButton: (active) => ({
    borderRadius: 12,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.7)'
      : '1px solid rgba(71, 85, 105, 0.45)',
    background: active ? 'rgba(37, 99, 235, 0.3)' : 'rgba(15, 23, 42, 0.7)',
    color: active ? '#e0f2fe' : '#cbd5f5',
    fontSize: 12,
    fontWeight: 700,
    padding: '9px 0',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  }),
  section: {
    display: 'grid',
    gap: 12,
  },
  input: {
    appearance: 'none',
    borderRadius: 12,
    border: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'linear-gradient(135deg, rgba(14, 22, 45, 0.92), rgba(10, 16, 35, 0.92))',
    color: '#e2e8f0',
    padding: '10px 12px',
    fontSize: 13,
    lineHeight: 1.45,
    outline: 'none',
    transition: 'border 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
    boxShadow: '0 0 0 0 rgba(59, 130, 246, 0.28)',
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  colorInput: (disabled = false) => ({
    width: 46,
    height: 34,
    borderRadius: 12,
    border: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'rgba(8, 13, 30, 0.9)',
    padding: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  }),
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#cbd5f5',
  },
  mutedText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
    gap: 12,
  },
  heroCard: (active) => ({
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    border: active
      ? '1px solid rgba(59, 130, 246, 0.7)'
      : '1px solid rgba(71, 85, 105, 0.45)',
    height: 120,
    cursor: 'pointer',
    background: 'rgba(15, 23, 42, 0.7)',
  }),
  heroCardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  heroCardOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.1) 0%, rgba(15, 23, 42, 0.82) 100%)',
    display: 'flex',
    alignItems: 'flex-end',
    padding: '10px 12px',
    color: '#f8fafc',
    fontWeight: 700,
    fontSize: 13,
  },
  heroCardDetails: {
    marginTop: 8,
    borderRadius: 14,
    border: '1px solid rgba(59, 130, 246, 0.4)',
    background: 'rgba(12, 20, 45, 0.8)',
    padding: '12px 14px',
    display: 'grid',
    gap: 6,
    fontSize: 12,
    color: '#cbd5f5',
  },
  friendList: {
    display: 'grid',
    gap: 10,
  },
  friendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 14,
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(71, 85, 105, 0.45)',
  },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'rgba(30, 64, 175, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    color: '#bfdbfe',
    overflow: 'hidden',
  },
  friendName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e2e8f0',
  },
  roomList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  roomListScroll: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxHeight: 'min(420px, 55vh)',
    overflowY: 'auto',
    paddingRight: 4,
  },
  roomCard: (active) => ({
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    minHeight: 64,
    cursor: 'pointer',
    border: active
      ? '1px solid rgba(59, 130, 246, 0.65)'
      : '1px solid rgba(71, 85, 105, 0.45)',
    background: 'rgba(15, 23, 42, 0.65)',
  }),
  roomCardBackdrop: (coverUrl) => ({
    position: 'absolute',
    inset: 0,
    background: coverUrl
      ? `url(${coverUrl}) center/cover no-repeat`
      : 'linear-gradient(135deg, rgba(30, 64, 175, 0.45), rgba(30, 27, 75, 0.65))',
    filter: 'brightness(0.55)',
  }),
  roomCardScrim: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(10, 19, 35, 0.1) 0%, rgba(10, 19, 35, 0.92) 100%)',
  },
  roomCardBody: {
    position: 'relative',
    display: 'grid',
    gap: 6,
    padding: '10px 12px',
    minHeight: 0,
  },
  roomCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  roomCardTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#f8fafc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  roomCardUnreadBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 24,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'rgba(248, 113, 113, 0.82)',
    color: '#0f172a',
    fontSize: 11,
    fontWeight: 700,
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.4)',
  },
  roomCardPreview: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    fontSize: 11,
    color: '#e2e8f0',
    minHeight: 16,
    overflow: 'hidden',
  },
  roomCardPreviewAuthor: {
    fontWeight: 600,
    color: '#cbd5f5',
    maxWidth: '35%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  roomCardPreviewText: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  roomCardPreviewPlaceholder: {
    color: 'rgba(203, 213, 225, 0.7)',
    fontStyle: 'italic',
  },
  roomCardStats: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#a5b4fc',
    gap: 10,
  },
  roomCardStatsRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionButton: (variant = 'primary', disabled = false) => {
    const palette = {
      primary: {
        background: disabled ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.85)',
        color: disabled ? '#94a3b8' : '#f8fafc',
        border: '1px solid rgba(59, 130, 246, 0.6)',
      },
      ghost: {
        background: 'rgba(15, 23, 42, 0.7)',
        color: '#cbd5f5',
        border: '1px solid rgba(71, 85, 105, 0.5)',
      },
    }
    const tone = palette[variant] || palette.primary
    return {
      borderRadius: 12,
      border: tone.border,
      padding: '9px 14px',
      fontSize: 12,
      fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: tone.background,
      color: tone.color,
      transition: 'all 0.15s ease',
    }
  },
  secondaryButton: {
    borderRadius: 10,
    border: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#cbd5f5',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 12px',
    cursor: 'pointer',
  },
  conversation: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto auto',
    borderRadius: 24,
    border: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(11, 18, 40, 0.96)',
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  conversationBackground: (value) => {
    const base = {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg, rgba(6, 10, 25, 0.9) 0%, rgba(6, 10, 25, 0.75) 100%)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      opacity: 0.88,
      zIndex: 0,
      pointerEvents: 'none',
    }

    if (!value) {
      return base
    }

    const trimmed = typeof value === 'string' ? value.trim() : ''
    if (isGradientValue(trimmed) || isColorValue(trimmed)) {
      return {
        ...base,
        background: `linear-gradient(180deg, rgba(6, 10, 25, 0.68) 0%, rgba(6, 10, 25, 0.7) 35%, rgba(6, 10, 25, 0.88) 100%), ${trimmed}`,
        backgroundImage: undefined,
      }
    }

    return {
      ...base,
      backgroundImage: `linear-gradient(180deg, rgba(6, 10, 25, 0.88) 0%, rgba(6, 10, 25, 0.75) 100%), url(${trimmed})`,
    }
  },
  conversationHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 22px',
    borderBottom: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(12, 20, 45, 0.98)',
    position: 'relative',
    zIndex: 1,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  headerMeta: {
    display: 'grid',
    gap: 4,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#f1f5f9',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: (active = false) => ({
    width: 34,
    height: 34,
    borderRadius: 10,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.7)'
      : '1px solid rgba(71, 85, 105, 0.5)',
    background: active ? 'rgba(37, 99, 235, 0.28)' : 'rgba(15, 23, 42, 0.65)',
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  }),
  headerButton: (variant = 'ghost', disabled = false) => {
    const palette = {
      ghost: {
        background: 'rgba(15, 23, 42, 0.7)',
        color: disabled ? '#64748b' : '#cbd5f5',
        border: '1px solid rgba(71, 85, 105, 0.5)',
      },
      primary: {
        background: 'rgba(59, 130, 246, 0.85)',
        color: '#f8fafc',
        border: '1px solid rgba(59, 130, 246, 0.6)',
      },
    }
    const tone = palette[variant] || palette.ghost
    return {
      borderRadius: 10,
      border: tone.border,
      padding: '6px 12px',
      fontSize: 12,
      fontWeight: 600,
      background: tone.background,
      color: tone.color,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.7 : 1,
    }
  },
  drawerScrim: (open, compact = false) => ({
    position: 'absolute',
    inset: compact ? 0 : '8px 0 8px 8px',
    background: compact ? 'rgba(8, 15, 30, 0.72)' : 'transparent',
    pointerEvents: open ? 'auto' : 'none',
    opacity: open && compact ? 1 : 0,
    transition: 'opacity 0.2s ease',
    borderRadius: compact ? 0 : 18,
    zIndex: 8,
  }),
  drawerContainer: (open, compact = false) => ({
    position: 'absolute',
    top: compact ? 0 : 12,
    right: compact ? 0 : 12,
    bottom: compact ? 0 : 12,
    width: compact ? '100%' : 340,
    maxWidth: compact ? '100%' : 360,
    transform: open ? 'translateX(0)' : 'translateX(108%)',
    transition: 'transform 0.24s ease',
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: open ? 'auto' : 'none',
    zIndex: 12,
  }),
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-start',
  },
  drawerCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'rgba(15, 23, 42, 0.7)',
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerHeaderLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: 600,
  },
  drawerPanel: {
    background: 'rgba(10, 16, 35, 0.96)',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    borderRadius: 22,
    padding: '18px 18px 16px',
    display: 'grid',
    gridTemplateRows: 'auto auto 1fr auto',
    gap: 16,
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  drawerScrollArea: {
    overflowY: 'auto',
    display: 'grid',
    gap: 16,
    paddingRight: 6,
    paddingBottom: 12,
  },
  drawerSection: {
    display: 'grid',
    gap: 10,
  },
  drawerSectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#cbd5f5',
    letterSpacing: 0.2,
  },
  drawerCover: {
    width: '100%',
    height: 150,
    borderRadius: 18,
    overflow: 'hidden',
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(71, 85, 105, 0.45)',
  },
  drawerCoverImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  drawerMediaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
    gap: 8,
  },
  drawerMediaItem: {
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: 14,
    overflow: 'hidden',
    border: '1px solid rgba(71, 85, 105, 0.55)',
    cursor: 'pointer',
    position: 'relative',
    background: 'rgba(15, 23, 42, 0.82)',
  },
  drawerMediaThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  drawerMediaBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 999,
    background: 'rgba(15, 23, 42, 0.8)',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  drawerMoreButton: {
    border: '1px dashed rgba(71, 85, 105, 0.6)',
    borderRadius: 14,
    padding: '8px 10px',
    background: 'rgba(8, 15, 30, 0.6)',
    color: '#cbd5f5',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  drawerFileList: {
    display: 'grid',
    gap: 6,
  },
  drawerFileItem: {
    borderRadius: 12,
    border: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(15, 23, 42, 0.72)',
    padding: '8px 10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    fontSize: 11,
    color: '#e2e8f0',
  },
  drawerParticipants: {
    display: 'grid',
    gap: 10,
  },
  drawerParticipant: (role) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 8px',
    borderRadius: 12,
    border:
      role === 'owner'
        ? '1px solid rgba(59, 130, 246, 0.75)'
        : role === 'moderator'
          ? '1px solid rgba(244, 114, 182, 0.75)'
          : '1px solid rgba(71, 85, 105, 0.45)',
    background:
      role === 'owner'
        ? 'rgba(37, 99, 235, 0.22)'
        : role === 'moderator'
          ? 'rgba(236, 72, 153, 0.18)'
          : 'rgba(15, 23, 42, 0.6)',
    cursor: 'pointer',
  }),
  drawerParticipantAvatar: (role) => ({
    width: 30,
    height: 30,
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
    border:
      role === 'owner'
        ? '2px solid rgba(59, 130, 246, 0.8)'
        : role === 'moderator'
          ? '2px solid rgba(244, 114, 182, 0.8)'
          : '2px solid rgba(148, 163, 184, 0.6)',
    background: 'rgba(15, 23, 42, 0.8)',
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  drawerParticipantMeta: {
    display: 'grid',
    gap: 2,
    minWidth: 0,
  },
  drawerParticipantName: {
    fontSize: 12,
    fontWeight: 700,
    color: '#f8fafc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  drawerParticipantSub: {
    fontSize: 10,
    color: '#cbd5f5',
  },
  settingsTabs: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  imageUploadTile: (hasImage = false) => ({
    position: 'relative',
    borderRadius: 20,
    border: hasImage
      ? '1px solid rgba(59, 130, 246, 0.5)'
      : '1px dashed rgba(148, 163, 184, 0.55)',
    background: hasImage ? 'rgba(8, 13, 30, 0.85)' : 'rgba(8, 13, 30, 0.6)',
    minHeight: 190,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  imageUploadPreview: (url) => ({
    position: 'absolute',
    inset: 0,
    backgroundImage: `linear-gradient(180deg, rgba(8, 13, 30, 0.15) 0%, rgba(8, 13, 30, 0.75) 100%), url(${url})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: 'saturate(1.05)',
  }),
  imageUploadPlaceholder: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gap: 6,
    justifyItems: 'center',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 1.6,
    padding: '0 18px',
  },
  imageUploadActions: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    zIndex: 2,
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 999,
    background: 'rgba(8, 13, 30, 0.82)',
    boxShadow: '0 18px 48px -18px rgba(8, 15, 30, 0.85)',
  },
  imageUploadButton: (variant = 'primary', disabled = false) => {
    const palette = {
      primary: {
        background: disabled ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.88)',
        color: '#f8fafc',
        border: '1px solid rgba(59, 130, 246, 0.55)',
      },
      ghost: {
        background: 'rgba(15, 23, 42, 0.72)',
        color: '#cbd5f5',
        border: '1px solid rgba(148, 163, 184, 0.45)',
      },
    }
    const tone = palette[variant] || palette.primary
    return {
      borderRadius: 999,
      border: tone.border,
      padding: '8px 16px',
      fontSize: 12,
      fontWeight: 600,
      background: tone.background,
      color: tone.color,
      cursor: disabled ? 'not-allowed' : 'pointer',
    }
  },
  imageUploadHint: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 1.6,
    wordBreak: 'break-all',
  },
  settingsTabButton: (active = false) => ({
    flex: '0 0 auto',
    borderRadius: 999,
    border: active ? '1px solid rgba(59, 130, 246, 0.8)' : '1px solid rgba(71, 85, 105, 0.55)',
    background: active ? 'rgba(37, 99, 235, 0.32)' : 'rgba(15, 23, 42, 0.75)',
    color: active ? '#e0f2fe' : '#cbd5f5',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 14px',
    cursor: 'pointer',
  }),
  pinnedAnnouncementContainer: {
    position: 'sticky',
    top: -8,
    zIndex: 5,
    display: 'grid',
    gap: 12,
    margin: '0 -6px 18px',
    padding: '16px 6px 10px',
    isolation: 'isolate',
  },
  pinnedAnnouncementBackdrop: {
    position: 'absolute',
    inset: '-18px -6px -12px',
    borderRadius: 30,
    background:
      'linear-gradient(180deg, rgba(15, 23, 42, 0.92) 0%, rgba(15, 23, 42, 0.72) 55%, rgba(15, 23, 42, 0) 100%)',
    backdropFilter: 'blur(24px)',
    pointerEvents: 'none',
  },
  pinnedAnnouncementContent: {
    position: 'relative',
    display: 'grid',
    gap: 12,
    zIndex: 1,
  },
  pinnedAnnouncementCard: (hasImage = false) => ({
    display: 'grid',
    gridTemplateColumns: hasImage ? 'minmax(0, 1fr) minmax(120px, 168px)' : 'minmax(0, 1fr)',
    gap: 14,
    padding: '14px 18px',
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.38)',
    background: 'rgba(15, 23, 42, 0.7)',
    backdropFilter: 'blur(22px)',
    boxShadow: '0 18px 42px -18px rgba(2, 6, 23, 0.7)',
  }),
  pinnedAnnouncementHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    fontSize: 12,
    color: '#cbd5f5',
  },
  pinnedAnnouncementBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.18)',
    border: '1px solid rgba(59, 130, 246, 0.45)',
    color: '#e0f2fe',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.01em',
    textTransform: 'uppercase',
  },
  pinnedAnnouncementTimestamp: {
    fontSize: 11,
    color: '#94a3b8',
  },
  pinnedAnnouncementText: {
    display: 'grid',
    gap: 6,
    color: '#e2e8f0',
  },
  pinnedAnnouncementTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#f8fafc',
    lineHeight: 1.4,
  },
  pinnedAnnouncementPreview: {
    fontSize: 13,
    lineHeight: 1.6,
    color: '#cbd5f5',
    wordBreak: 'break-word',
  },
  pinnedAnnouncementImageWrapper: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: 'rgba(15, 23, 42, 0.72)',
  },
  pinnedAnnouncementImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  pinnedAnnouncementImageButton: {
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  },
  pinnedAnnouncementActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  pinnedAnnouncementActionButton: (variant = 'secondary') => ({
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    border:
      variant === 'primary'
        ? '1px solid rgba(59, 130, 246, 0.7)'
        : '1px solid rgba(148, 163, 184, 0.5)',
    background:
      variant === 'primary'
        ? 'rgba(37, 99, 235, 0.28)'
        : 'rgba(15, 23, 42, 0.68)',
    color: variant === 'primary' ? '#e0f2fe' : '#cbd5f5',
    cursor: 'pointer',
  }),
  pinnedAnnouncementEmpty: {
    padding: '14px 18px',
    borderRadius: 18,
    border: '1px dashed rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#94a3b8',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  announcementImagePreview: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    border: '1px solid rgba(148, 163, 184, 0.45)',
    background: 'rgba(15, 23, 42, 0.68)',
  },
  announcementImagePreviewImage: {
    width: '100%',
    maxHeight: 220,
    objectFit: 'cover',
    display: 'block',
  },
  announcementImageRemoveButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.6)',
    background: 'rgba(15, 23, 42, 0.82)',
    color: '#f8fafc',
    fontSize: 11,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  announcementImageUploadRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  announcementListItem: (pinned = false) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    padding: '10px 12px',
    borderRadius: 12,
    border: pinned ? '1px solid rgba(59, 130, 246, 0.65)' : '1px solid rgba(71, 85, 105, 0.45)',
    background: pinned ? 'rgba(37, 99, 235, 0.18)' : 'rgba(15, 23, 42, 0.72)',
    color: '#e2e8f0',
    cursor: 'pointer',
    textAlign: 'left',
  }),
  announcementMeta: {
    fontSize: 11,
    color: '#94a3b8',
  },
  announcementToolbarOverlay: (visible = false) => ({
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingTop: 12,
    paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
    paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
    background: 'linear-gradient(180deg, rgba(4, 7, 18, 0.05) 0%, rgba(4, 7, 18, 0.88) 35%, rgba(4, 7, 18, 0.96) 100%)',
    boxShadow: '0 -28px 48px rgba(2, 6, 23, 0.78)',
    zIndex: 1540,
    pointerEvents: visible ? 'auto' : 'none',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(16px)',
    transition: 'opacity 180ms ease, transform 200ms ease',
  }),
  announcementToolbarRow: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    paddingBottom: 4,
    WebkitOverflowScrolling: 'touch',
  },
  announcementToolbarItem: (active = false) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    flex: '0 0 auto',
    padding: '10px 14px',
    borderRadius: 18,
    border: active ? '1px solid rgba(59, 130, 246, 0.75)' : '1px solid rgba(71, 85, 105, 0.55)',
    background: active ? 'rgba(37, 99, 235, 0.32)' : 'rgba(15, 23, 42, 0.78)',
    color: '#e0f2fe',
    fontSize: 13,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  }),
  announcementToolbarItemIcon: {
    fontSize: 17,
    lineHeight: 1,
  },
  announcementToolbarItemLabel: {
    fontSize: 13,
    lineHeight: 1.2,
  },
  announcementToolbarPaletteRow: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    padding: '4px 4px 0',
    WebkitOverflowScrolling: 'touch',
  },
  announcementToolbarColorButton: (color, active = false) => ({
    width: 38,
    height: 38,
    borderRadius: 19,
    border: active
      ? '2px solid rgba(59, 130, 246, 0.85)'
      : color === '#f8fafc'
        ? '1px solid rgba(15, 23, 42, 0.6)'
        : '1px solid rgba(148, 163, 184, 0.5)',
    background: color,
    cursor: 'pointer',
    flex: '0 0 auto',
    boxShadow: active ? '0 0 0 1px rgba(37, 99, 235, 0.45)' : '0 0 0 1px rgba(15, 23, 42, 0.4)',
  }),
  announcementToolbarSizeRow: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    padding: '2px 4px 0',
    WebkitOverflowScrolling: 'touch',
  },
  announcementToolbarSizeButton: (active = false) => ({
    flex: '0 0 auto',
    borderRadius: 12,
    border: active ? '1px solid rgba(59, 130, 246, 0.7)' : '1px solid rgba(71, 85, 105, 0.6)',
    background: active ? 'rgba(37, 99, 235, 0.25)' : 'rgba(15, 23, 42, 0.74)',
    color: '#e2e8f0',
    fontSize: 12,
    padding: '7px 12px',
    cursor: 'pointer',
  }),
  announcementToolbarStatusRow: {
    fontSize: 11,
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  announcementCommentActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
  },
  announcementCommentDelete: {
    borderRadius: 8,
    border: '1px solid rgba(244, 114, 182, 0.6)',
    background: 'rgba(244, 114, 182, 0.18)',
    color: '#fbcfe8',
    fontSize: 11,
    padding: '4px 8px',
    cursor: 'pointer',
  },
  announcementYoutubeResult: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    borderRadius: 14,
    border: '1px solid rgba(71, 85, 105, 0.45)',
    background: 'rgba(15, 23, 42, 0.7)',
    padding: '8px 12px',
    cursor: 'pointer',
    textAlign: 'left',
    color: '#e2e8f0',
  },
  announcementYoutubeThumb: {
    width: 84,
    height: 48,
    borderRadius: 10,
    objectFit: 'cover',
    background: 'rgba(15, 23, 42, 0.85)',
    flexShrink: 0,
  },
  announcementYoutubeInfo: {
    display: 'grid',
    gap: 4,
    minWidth: 0,
  },
  announcementPollOptionList: {
    display: 'grid',
    gap: 8,
  },
  announcementPollOptionRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  announcementToolbarHint: {
    fontSize: 11,
    color: '#94a3b8',
  },
  announcementEditorWrapper: {
    position: 'relative',
    borderRadius: 16,
    border: '1px solid rgba(71, 85, 105, 0.45)',
    background: 'rgba(8, 15, 30, 0.58)',
    minHeight: 220,
  },
  announcementEditor: {
    minHeight: 220,
    maxHeight: 420,
    overflowY: 'auto',
    padding: '16px 18px',
    fontSize: 14,
    lineHeight: 1.65,
    color: '#f8fafc',
    wordBreak: 'break-word',
    outline: 'none',
  },
  announcementEditorPlaceholder: {
    position: 'absolute',
    inset: 0,
    padding: '16px 18px',
    fontSize: 14,
    lineHeight: 1.65,
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  announcementPreview: {
    display: 'grid',
    gap: 6,
    borderRadius: 14,
    border: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'rgba(15, 23, 42, 0.75)',
    padding: '12px 14px',
  },
  announcementPreviewBody: {
    fontSize: 13,
    lineHeight: 1.6,
    color: '#e2e8f0',
  },
  announcementStack: {
    display: 'grid',
    gap: 8,
    padding: '0 12px 12px',
    position: 'relative',
    zIndex: 1,
  },
  announcementHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  banList: {
    display: 'grid',
    gap: 10,
  },
  banListItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    padding: '10px 12px',
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(71, 85, 105, 0.45)',
    gap: 12,
  },
  banListActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  statList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 12,
    fontSize: 12,
    color: '#cbd5f5',
  },
  statContributionList: {
    display: 'grid',
    gap: 10,
    marginTop: 6,
  },
  statContributionItem: {
    display: 'grid',
    gap: 6,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(71, 85, 105, 0.4)',
    background: 'rgba(15, 23, 42, 0.6)',
  },
  statContributionLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 600,
  },
  statContributionBar: {
    height: 6,
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.25)',
    overflow: 'hidden',
  },
  statContributionBarFill: (percent = 0) => ({
    width: `${Math.max(0, Math.min(100, Number(percent) || 0))}%`,
    height: '100%',
    background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.85) 0%, rgba(96, 165, 250, 0.95) 100%)',
  }),
  apiKeyList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'grid',
    gap: 10,
  },
  apiKeyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: '10px 12px',
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(71, 85, 105, 0.45)',
    color: '#e2e8f0',
    gap: 12,
  },
  apiKeyStatusBadge: (active = false) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    color: active ? '#bbf7d0' : '#cbd5f5',
    background: active ? 'rgba(34, 197, 94, 0.28)' : 'rgba(71, 85, 105, 0.45)',
    border: active ? '1px solid rgba(74, 222, 128, 0.5)' : '1px solid rgba(71, 85, 105, 0.55)',
  }),
  apiKeyActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  themeModeTabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeModeButton: (active = false) => ({
    appearance: 'none',
    borderRadius: 12,
    border: active ? '1px solid rgba(59, 130, 246, 0.65)' : '1px solid rgba(71, 85, 105, 0.45)',
    background: active ? 'rgba(37, 99, 235, 0.25)' : 'rgba(15, 23, 42, 0.75)',
    color: active ? '#e0f2fe' : '#cbd5f5',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 12px',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  }),
  themePresetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
  },
  themePresetButton: (active = false) => ({
    appearance: 'none',
    borderRadius: 16,
    border: active ? '1px solid rgba(59, 130, 246, 0.7)' : '1px solid rgba(71, 85, 105, 0.45)',
    padding: 0,
    overflow: 'hidden',
    cursor: 'pointer',
    background: 'rgba(15, 23, 42, 0.6)',
    display: 'grid',
    gridTemplateRows: '120px auto',
    transition: 'border 0.2s ease, transform 0.2s ease',
    transform: active ? 'translateY(-2px)' : 'translateY(0)',
  }),
  themePresetPreview: (background) => ({
    height: 120,
    width: '100%',
    background: background || 'linear-gradient(135deg, #1e293b, #0f172a)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }),
  themePresetLabel: {
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  themeAccentPalette: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeAccentSwatch: (color, active = false) => ({
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: color,
    border: active ? '2px solid #e0f2fe' : '2px solid rgba(15, 23, 42, 0.9)',
    cursor: 'pointer',
    boxShadow: active ? '0 0 0 2px rgba(59, 130, 246, 0.45)' : 'none',
  }),
  themePreview: (background) => ({
    borderRadius: 16,
    border: '1px solid rgba(71, 85, 105, 0.5)',
    padding: 16,
    display: 'grid',
    gap: 12,
    background: isGradientValue(background) || isColorValue(background)
      ? `linear-gradient(135deg, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.8)), ${background}`
      : 'rgba(15, 23, 42, 0.8)',
    backgroundImage: !background || isGradientValue(background) || isColorValue(background)
      ? undefined
      : `linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0.72)), url(${background})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }),
  themePreviewMessage: (bubbleColor, textColor) => ({
    borderRadius: 12,
    border: `1px solid ${adjustColorLuminance(bubbleColor || '#1f2937', 0.35)}`,
    background: bubbleColor || 'rgba(15, 23, 42, 0.8)',
    color: textColor || '#f8fafc',
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  }),
  themePreviewAccent: (accent) => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: accent || '#38bdf8',
    boxShadow: '0 0 0 2px rgba(15, 23, 42, 0.75)',
  }),
  themeAutoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: '#cbd5f5',
  },
  banPresetGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  banPresetButton: (active = false) => ({
    appearance: 'none',
    borderRadius: 10,
    border: active ? '1px solid rgba(59, 130, 246, 0.7)' : '1px solid rgba(71, 85, 105, 0.5)',
    background: active ? 'rgba(37, 99, 235, 0.3)' : 'rgba(15, 23, 42, 0.7)',
    color: active ? '#e0f2fe' : '#cbd5f5',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 10px',
    cursor: 'pointer',
  }),
  conversationFooter: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    gap: 12,
    padding: '12px 18px 16px',
    borderTop: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'linear-gradient(180deg, rgba(10, 16, 35, 0.7) 0%, rgba(10, 16, 35, 0.92) 90%)',
  },
  conversationFooterButton: (variant = 'ghost', disabled = false) => {
    const palette = {
      danger: {
        background: 'rgba(248, 113, 113, 0.18)',
        border: '1px solid rgba(248, 113, 113, 0.6)',
        color: '#fecaca',
      },
      ghost: {
        background: 'rgba(15, 23, 42, 0.72)',
        border: '1px solid rgba(71, 85, 105, 0.55)',
        color: '#cbd5f5',
      },
    }
    const tone = palette[variant] || palette.ghost
    return {
      flex: 1,
      borderRadius: 12,
      border: tone.border,
      background: tone.background,
      color: disabled ? '#64748b' : tone.color,
      fontSize: 12,
      fontWeight: 600,
      padding: '10px 14px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      transition: 'all 0.18s ease',
    }
  },
  drawerFooter: {
    position: 'sticky',
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 6px 0',
    background: 'linear-gradient(180deg, rgba(10, 16, 35, 0) 0%, rgba(10, 16, 35, 0.95) 38%, rgba(10, 16, 35, 0.98) 100%)',
    backdropFilter: 'blur(12px)',
    margin: '0 -6px',
  },
  drawerFooterButton: (variant = 'ghost') => ({
    flex: 1,
    borderRadius: 12,
    border:
      variant === 'danger'
        ? '1px solid rgba(248, 113, 113, 0.7)'
        : '1px solid rgba(71, 85, 105, 0.55)',
    background:
      variant === 'danger'
        ? 'rgba(248, 113, 113, 0.16)'
        : 'rgba(15, 23, 42, 0.7)',
    color: variant === 'danger' ? '#fecaca' : '#cbd5f5',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '10px 12px',
    transition: 'all 0.18s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }),
  miniOverlayShell: (x, y, width = MINI_OVERLAY_WIDTH, height = MINI_OVERLAY_HEIGHT, mode = 'reading') => {
    const base = {
      position: 'fixed',
      top: y,
      left: x,
      width,
      height,
      border: '1px solid rgba(71, 85, 105, 0.55)',
      boxShadow: '0 40px 120px -40px rgba(8, 15, 30, 0.85)',
      backdropFilter: 'blur(18px)',
      color: '#e2e8f0',
      zIndex: 1525,
      overflow: 'hidden',
      userSelect: 'none',
      touchAction: mode === 'bar' ? 'none' : 'auto',
    }

    if (mode === 'bar') {
      return {
        ...base,
        borderRadius: 999,
        background: 'rgba(15, 23, 42, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 16px',
        touchAction: 'none',
      }
    }

    return {
      ...base,
      borderRadius: 22,
      background: 'rgba(12, 20, 45, 0.95)',
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto auto',
    }
  },
  miniOverlayHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 18px 12px',
    background: 'rgba(10, 16, 35, 0.82)',
    cursor: 'grab',
    touchAction: 'none',
    userSelect: 'none',
  },
  miniOverlayHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  miniOverlayTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#f1f5f9',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  miniOverlayBadge: {
    borderRadius: 999,
    background: 'rgba(37, 99, 235, 0.3)',
    color: '#dbeafe',
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
  },
  miniOverlayAction: {
    minWidth: 32,
    height: 32,
    borderRadius: 12,
    border: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#cbd5f5',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  miniOverlayMessages: {
    padding: '12px 18px 10px',
    display: 'grid',
    gap: 10,
    overflowY: 'auto',
    touchAction: 'pan-y',
    WebkitOverflowScrolling: 'touch',
    background: 'rgba(8, 13, 30, 0.55)',
  },
  miniOverlayMessageRow: (mine = false) => ({
    display: 'grid',
    gap: 4,
    justifyItems: mine ? 'end' : 'start',
  }),
  miniOverlayMessageMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    color: '#94a3b8',
  },
  miniOverlayMessageAuthor: (mine = false) => ({
    fontWeight: 600,
    color: mine ? '#38bdf8' : '#e2e8f0',
  }),
  miniOverlayMessageBody: {
    maxWidth: '100%',
    fontSize: 12,
    lineHeight: 1.45,
    color: '#cbd5f5',
    background: 'rgba(15, 23, 42, 0.72)',
    borderRadius: 12,
    border: '1px solid rgba(71, 85, 105, 0.4)',
    padding: '8px 12px',
  },
  miniOverlayComposer: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px 14px',
    borderTop: '1px solid rgba(71, 85, 105, 0.45)',
    background: 'rgba(10, 16, 35, 0.88)',
  },
  miniOverlayComposerInput: {
    flex: 1,
    minHeight: 44,
    resize: 'none',
    borderRadius: 14,
    border: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#e2e8f0',
    padding: '8px 12px',
    fontSize: 12,
    lineHeight: 1.45,
  },
  miniOverlayResizeHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 0 10px',
    borderTop: '1px solid rgba(71, 85, 105, 0.45)',
    background: 'rgba(7, 12, 26, 0.9)',
    cursor: 'ns-resize',
    touchAction: 'none',
  },
  miniOverlayResizeBar: {
    width: 48,
    height: 4,
    borderRadius: 999,
    background: 'rgba(148, 163, 184, 0.55)',
  },
  miniOverlayBarLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#e2e8f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  miniOverlayBarBadge: {
    borderRadius: 999,
    background: 'rgba(37, 99, 235, 0.35)',
    color: '#dbeafe',
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 8px',
  },
  miniOverlayBarClose: {
    width: 28,
    height: 28,
    borderRadius: 10,
    border: '1px solid rgba(71, 85, 105, 0.55)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#cbd5f5',
    fontSize: 14,
    cursor: 'pointer',
  },
  messageViewport: {
    overflowY: 'auto',
    padding: '22px 6px 26px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: 'rgba(4, 10, 28, 0.4)',
    position: 'relative',
    zIndex: 1,
  },
  dateDividerWrapper: {
    display: 'flex',
    justifyContent: 'center',
  },
  dateDivider: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 14px',
    borderRadius: 999,
    border: '1px solid rgba(59, 130, 246, 0.45)',
    background: 'rgba(15, 23, 42, 0.82)',
    color: '#dbeafe',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.2,
  },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    fontSize: 13,
    minHeight: '100%',
    textAlign: 'center',
    padding: '32px 20px',
  },
  messageGroup: (mine = false) => ({
    display: 'flex',
    justifyContent: mine ? 'flex-end' : 'flex-start',
    alignItems: 'flex-start',
    gap: mine ? 10 : 12,
  }),
  messageAvatarButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    padding: 2,
    cursor: 'pointer',
    outline: 'none',
    border: '1px solid rgba(59, 130, 246, 0)',
    transition: 'border 0.15s ease, background 0.15s ease',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'rgba(15, 23, 42, 0.8)',
    color: '#bae6fd',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  messageContent: (mine = false) => ({
    display: 'grid',
    gap: 4,
    maxWidth: '94%',
    textAlign: mine ? 'right' : 'left',
  }),
  messageName: (mine = false, clickable = false, accent = '#bfdbfe') => ({
    fontSize: 11,
    fontWeight: 700,
    color: mine ? accent || '#bfdbfe' : '#f8fafc',
    cursor: clickable ? 'pointer' : 'default',
  }),
  messageStack: (mine = false) => ({
    display: 'grid',
    gap: 2,
    justifyItems: mine ? 'end' : 'start',
  }),
  messageItem: (mine = false) => ({
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: mine ? 'flex-end' : 'flex-start',
    gap: 4,
  }),
  messageBubble: (mine = false, variant = 'default', theme = null) => {
    const variants = {
      default: {
        border: mine
          ? '1px solid rgba(59, 130, 246, 0.45)'
          : '1px solid rgba(71, 85, 105, 0.45)',
        background: mine ? 'rgba(37, 99, 235, 0.25)' : 'rgba(15, 23, 42, 0.8)',
      },
      aiPrompt: {
        border: '1px solid rgba(96, 165, 250, 0.7)',
        background: 'rgba(37, 99, 235, 0.22)',
      },
      aiResponse: {
        border: '1px solid rgba(248, 113, 113, 0.7)',
        background: 'rgba(239, 68, 68, 0.16)',
      },
      aiPending: {
        border: '1px dashed rgba(248, 113, 113, 0.65)',
        background: 'rgba(248, 113, 113, 0.12)',
      },
      aiError: {
        border: '1px solid rgba(248, 113, 113, 0.85)',
        background: 'rgba(127, 29, 29, 0.2)',
      },
    }
    const tone = variants[variant] || variants.default
    const bubbleColor = theme?.bubbleColor
    const background = bubbleColor
      ? mine
        ? adjustColorLuminance(bubbleColor, 0.12)
        : bubbleColor
      : tone.background
    const borderColor = bubbleColor
      ? `1px solid ${adjustColorLuminance(bubbleColor, mine ? 0.35 : 0.18)}`
      : tone.border
    const resolvedText = theme?.textColor || '#f8fafc'
    return {
      borderRadius: 12,
      border: borderColor,
      background,
      padding: '4px 12px 6px',
      color: variant.startsWith('ai') ? tone.color || '#f8fafc' : resolvedText,
      display: 'grid',
      gap: 4,
      minWidth: 0,
    }
  },
  messageUnreadRow: (mine = false) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: mine ? 'flex-end' : 'flex-start',
    gap: 6,
    marginTop: 4,
  }),
  messageUnreadDot: (mine = false) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: mine ? 'rgba(96, 165, 250, 0.85)' : 'rgba(251, 191, 36, 0.95)',
    flexShrink: 0,
    boxShadow: mine
      ? '0 0 6px rgba(96, 165, 250, 0.4)'
      : '0 0 6px rgba(251, 191, 36, 0.35)',
  }),
  messageUnreadText: (mine = false) => ({
    fontSize: 10,
    color: mine ? '#dbeafe' : '#f8fafc',
    opacity: 0.85,
  }),
  messageLabel: (variant = 'prompt') => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    color:
      variant === 'response'
        ? 'rgba(248, 181, 181, 0.95)'
        : variant === 'error'
          ? 'rgba(248, 113, 113, 0.95)'
          : 'rgba(191, 219, 254, 0.95)',
  }),
  messageText: {
    fontSize: 13,
    lineHeight: 1.34,
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  messagePendingText: {
    fontSize: 12,
    color: '#fca5a5',
  },
  viewMoreButton: {
    border: 'none',
    background: 'transparent',
    color: '#bae6fd',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
    justifySelf: 'start',
  },
  messageTimestamp: (mine = false) => ({
    fontSize: 11,
    color: 'rgba(148, 163, 184, 0.85)',
    minWidth: 56,
    textAlign: mine ? 'right' : 'left',
  }),
  messageAttachments: {
    display: 'grid',
    gap: 8,
  },
  messageAttachmentsGrid: {
    display: 'grid',
    gap: 8,
    gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
  },
  messageAttachment: (mine = false) => ({
    borderRadius: 12,
    overflow: 'hidden',
    border: mine ? '1px solid rgba(96, 165, 250, 0.6)' : '1px solid rgba(148, 163, 184, 0.5)',
    background: 'rgba(15, 23, 42, 0.92)',
    maxWidth: 320,
    cursor: 'pointer',
    display: 'grid',
    gap: 0,
  }),
  messageAttachmentGrid: (mine = false) => ({
    borderRadius: 12,
    overflow: 'hidden',
    border: mine ? '1px solid rgba(96, 165, 250, 0.6)' : '1px solid rgba(148, 163, 184, 0.45)',
    background: 'rgba(15, 23, 42, 0.92)',
    width: 120,
    height: 120,
    cursor: 'pointer',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  messageAttachmentPreviewWrapper: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    background: 'rgba(15, 23, 42, 0.8)',
  },
  messageAttachmentGridPreviewWrapper: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    background: 'rgba(15, 23, 42, 0.82)',
  },
  messageAttachmentPreview: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  messageAttachmentGridPreview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  messageAttachmentMeta: {
    padding: '6px 10px',
    fontSize: 12,
    color: '#e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  messageAttachmentChip: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    background: 'rgba(15, 23, 42, 0.88)',
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 6px',
    borderRadius: 8,
  },
  composerContainer: {
    position: 'relative',
    borderTop: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(12, 20, 45, 0.98)',
  },
  composer: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 10,
    padding: '10px 16px 12px',
  },
  attachmentStrip: {
    display: 'flex',
    gap: 12,
    padding: '10px 16px 0',
    overflowX: 'auto',
  },
  aiRequestBanner: {
    margin: '8px 16px 0',
    padding: '10px 14px',
    borderRadius: 14,
    border: '1px solid rgba(96, 165, 250, 0.55)',
    background: 'rgba(37, 99, 235, 0.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  aiRequestLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#bfdbfe',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  aiRequestPreview: {
    fontSize: 12,
    color: '#e2e8f0',
    maxWidth: 'calc(100% - 28px)',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  aiRequestCancel: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: '1px solid rgba(96, 165, 250, 0.6)',
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#bfdbfe',
    cursor: 'pointer',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentPreview: {
    position: 'relative',
    flex: '0 0 auto',
    width: 96,
    borderRadius: 14,
    border: '1px solid rgba(59, 130, 246, 0.45)',
    background: 'rgba(15, 23, 42, 0.8)',
    padding: 8,
    display: 'grid',
    gap: 6,
    justifyItems: 'center',
    color: '#e2e8f0',
  },
  attachmentRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'rgba(15, 23, 42, 0.9)',
    color: '#e2e8f0',
    border: '1px solid rgba(59, 130, 246, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    cursor: 'pointer',
  },
  attachmentThumb: {
    width: 72,
    height: 54,
    borderRadius: 10,
    background: 'rgba(30, 41, 59, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontSize: 22,
    position: 'relative',
  },
  attachmentDuration: {
    position: 'absolute',
    bottom: 6,
    right: 10,
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 999,
  },
  attachmentInfo: {
    display: 'grid',
    justifyItems: 'center',
    gap: 2,
  },
  attachmentName: {
    fontSize: 11,
    fontWeight: 600,
    color: '#e2e8f0',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  attachmentMeta: {
    fontSize: 10,
    color: '#94a3b8',
  },
  composerToggle: (active = false, disabled = false) => ({
    width: 36,
    height: 36,
    borderRadius: 12,
    border: disabled
      ? '1px solid rgba(71, 85, 105, 0.35)'
      : active
        ? '1px solid rgba(59, 130, 246, 0.6)'
        : '1px solid rgba(71, 85, 105, 0.5)',
    background: disabled
      ? 'rgba(15, 23, 42, 0.45)'
      : active
        ? 'rgba(37, 99, 235, 0.24)'
        : 'rgba(15, 23, 42, 0.7)',
    color: disabled ? '#64748b' : '#e2e8f0',
    fontSize: 22,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.65 : 1,
  }),
  textarea: {
    width: '100%',
    minHeight: 52,
    maxHeight: 160,
    borderRadius: 14,
    border: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(2, 6, 23, 0.6)',
    color: '#f8fafc',
    padding: '10px 12px',
    fontSize: 14,
    lineHeight: 1.45,
    resize: 'vertical',
  },
  errorText: {
    fontSize: 12,
    color: '#fca5a5',
    padding: '0 18px 12px',
  },
  attachmentPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: '100%',
    marginBottom: 8,
    borderRadius: 16,
    border: '1px solid rgba(59, 130, 246, 0.4)',
    background: 'rgba(8, 15, 35, 0.95)',
    boxShadow: '0 18px 40px -18px rgba(2, 6, 23, 0.8)',
    padding: 12,
    display: 'grid',
    gap: 8,
    zIndex: 5,
  },
  attachmentPanelTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#cbd5f5',
  },
  attachmentActions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 8,
  },
  attachmentButton: {
    borderRadius: 12,
    border: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 600,
    padding: '10px 12px',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  mediaPickerBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(4, 10, 28, 0.78)',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 2200,
  },
  mediaPickerPanel: {
    width: 'min(680px, 96vw)',
    maxHeight: '85vh',
    borderRadius: 24,
    border: '1px solid rgba(59, 130, 246, 0.45)',
    background: 'rgba(10, 16, 35, 0.96)',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    overflow: 'hidden',
    boxShadow: '0 30px 60px rgba(2, 6, 23, 0.65)',
  },
  mediaPickerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: '1px solid rgba(71, 85, 105, 0.5)',
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: 14,
  },
  mediaPickerClose: {
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.75)',
    color: '#e2e8f0',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  mediaPickerHint: {
    fontSize: 12,
    color: '#cbd5f5',
  },
  mediaPickerAction: (disabled = false) => ({
    borderRadius: 10,
    border: '1px solid rgba(59, 130, 246, 0.6)',
    background: disabled ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.8)',
    color: disabled ? '#94a3b8' : '#f8fafc',
    padding: '6px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    fontWeight: 600,
  }),
  mediaPickerSecondary: {
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.7)',
    color: '#cbd5f5',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  mediaPickerBody: {
    padding: 18,
    overflowY: 'auto',
  },
  mediaPickerStatus: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    color: '#cbd5f5',
    fontSize: 13,
    minHeight: 220,
  },
  mediaPickerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 12,
  },
  mediaPickerItem: (selected = false) => ({
    position: 'relative',
    borderRadius: 16,
    border: selected ? '2px solid rgba(59, 130, 246, 0.85)' : '1px solid rgba(71, 85, 105, 0.6)',
    overflow: 'hidden',
    padding: 0,
    aspectRatio: '1 / 1',
    background: 'rgba(15, 23, 42, 0.85)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  mediaPickerThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  mediaPickerPlaceholder: {
    fontSize: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    color: '#cbd5f5',
  },
  mediaPickerMeta: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#f1f5f9',
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 6px',
    borderRadius: 8,
  },
  mediaPickerFooterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  mediaPickerInlineError: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: 600,
  },
  mediaPickerLoadMore: (disabled = false) => ({
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: disabled ? 'rgba(15, 23, 42, 0.5)' : 'rgba(15, 23, 42, 0.85)',
    color: disabled ? '#94a3b8' : '#e2e8f0',
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
  }),
}

const modalStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(4, 10, 28, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: 24,
  },
  panel: {
    background: 'rgba(12, 20, 45, 0.98)',
    borderRadius: 24,
    border: '1px solid rgba(59, 130, 246, 0.45)',
    maxWidth: 'min(640px, 94vw)',
    width: '100%',
    maxHeight: '85vh',
    display: 'grid',
    gap: 18,
    padding: '20px 24px',
    color: '#f8fafc',
    boxShadow: '0 24px 60px rgba(2, 6, 23, 0.6)',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  closeButton: {
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.8)',
    color: '#e2e8f0',
    padding: '6px 12px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 12,
  },
  body: {
    display: 'grid',
    gap: 12,
    fontSize: 14,
    lineHeight: 1.6,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: '#cbd5f5',
  },
}

const TABS = [
  { key: 'info', label: '정보' },
  { key: 'private', label: '일반채팅' },
  { key: 'open', label: '오픈채팅' },
]

const MESSAGE_LIMIT = 60

function extractMessageText(message) {
  if (!message) return ''
  const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : null
  if (metadata?.plain_text) {
    return String(metadata.plain_text)
  }
  if (metadata?.text) {
    return String(metadata.text)
  }
  if (metadata?.drafty?.txt) {
    return String(metadata.drafty.txt)
  }
  if (typeof message.text === 'string') {
    return message.text
  }
  return ''
}

function getMessageAttachments(message) {
  if (!message || !message.metadata) return []
  const metadata = typeof message.metadata === 'object' ? message.metadata : null
  if (!metadata) return []
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : []
  return attachments
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const bucket = item.bucket || CHAT_ATTACHMENT_BUCKET
      const path = item.path || null
      const id = item.id || `${message.id || message.local_id || 'attachment'}-${index}`
      return {
        ...item,
        id,
        bucket,
        path,
        type: item.type || 'file',
        name: item.name || '첨부 파일',
        preview_url: item.preview_url || item.preview || null,
        encoding: item.encoding || 'none',
        layoutHint: item.layout_hint || item.layoutHint || null,
      }
    })
    .filter((attachment) => attachment && (attachment.path || attachment.preview_url))
}

function getAiMetadata(message) {
  if (!message || !message.metadata) return null
  const metadata = typeof message.metadata === 'object' ? message.metadata : null
  if (!metadata || !metadata.ai) return null
  const aiMeta = typeof metadata.ai === 'object' ? metadata.ai : null
  if (!aiMeta) return null
  return {
    type: aiMeta.type || aiMeta.kind || null,
    status: aiMeta.status || 'complete',
    requestId: aiMeta.requestId || aiMeta.request_id || null,
    prompt: aiMeta.prompt || metadata.prompt || metadata.plain_text || '',
    source: aiMeta.source || null,
  }
}

function isAiPrompt(message) {
  const aiMeta = getAiMetadata(message)
  return Boolean(aiMeta && aiMeta.type === 'prompt')
}

function isAiResponse(message) {
  const aiMeta = getAiMetadata(message)
  return Boolean(aiMeta && aiMeta.type === 'response')
}

function formatTime(value) {
  if (!value) return ''
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    return ''
  }
}

function formatRelativeLastActivity(value) {
  if (!value) return ''
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const now = new Date()
    let diffMs = now.getTime() - date.getTime()
    if (!Number.isFinite(diffMs)) {
      return ''
    }
    if (diffMs < 0) {
      diffMs = 0
    }
    const minuteMs = 60 * 1000
    const hourMs = 60 * minuteMs
    const dayMs = 24 * hourMs
    const diffMinutes = Math.floor(diffMs / minuteMs)
    if (diffMinutes < 1) {
      return '방금 전 마지막 채팅'
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}분 전 마지막 채팅`
    }
    const diffHours = Math.floor(diffMs / hourMs)
    if (diffHours < 24) {
      return `${diffHours}시간 전 마지막 채팅`
    }
    const diffDays = Math.floor(diffMs / dayMs)
    if (diffDays < 7) {
      return `${diffDays}일 전 마지막 채팅`
    }
    if (diffDays < 30) {
      const weeks = Math.max(1, Math.floor(diffDays / 7))
      return `${weeks}주 전 마지막 채팅`
    }
    if (diffDays < 365) {
      const months = Math.max(1, Math.floor(diffDays / 30))
      return `${months}개월 전 마지막 채팅`
    }
    const years = Math.max(1, Math.floor(diffDays / 365))
    return `${years}년 전 마지막 채팅`
  } catch (error) {
    return ''
  }
}

function formatDateLabel(value) {
  if (!value) return '알 수 없는 날짜'
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '알 수 없는 날짜'
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    })
  } catch (error) {
    return '알 수 없는 날짜'
  }
}

function normalizeId(value) {
  if (value === null || value === undefined) return null
  const token = String(value).trim()
  return token.length ? token.toLowerCase() : null
}

function normalizeRoomEntry(room) {
  if (!room || typeof room !== 'object') {
    return null
  }

  const base = { ...room }
  const latestRaw =
    base.latestMessage !== undefined
      ? base.latestMessage
      : base.latest_message !== undefined
        ? base.latest_message
        : base.latest
  const latestMessage = latestRaw && latestRaw.payload ? latestRaw.payload : latestRaw || null

  const derivedTimestamp = latestMessage
    ? latestMessage.created_at || latestMessage.createdAt || null
    : null
  const lastMessageAt =
    base.lastMessageAt !== undefined
      ? base.lastMessageAt
      : base.last_message_at !== undefined
        ? base.last_message_at
        : derivedTimestamp

  const unreadRaw =
    base.unread_count !== undefined
      ? base.unread_count
      : base.unreadCount !== undefined
        ? base.unreadCount
        : base.unread !== undefined
          ? base.unread
          : 0
  const unreadNumeric = Number(unreadRaw)
  const unreadCount = Number.isFinite(unreadNumeric) ? Math.max(0, Math.trunc(unreadNumeric)) : 0

  const coverUrl = base.coverUrl || base.cover_url || null

  return {
    ...base,
    latestMessage,
    latest_message: latestMessage,
    lastMessageAt,
    last_message_at: lastMessageAt,
    unreadCount,
    unread_count: unreadCount,
    coverUrl,
    cover_url: coverUrl,
  }
}

function normalizeSearchKeyword(entry) {
  if (!entry) return null

  if (typeof entry === 'string') {
    const keyword = entry.trim()
    if (!keyword) return null
    return { keyword, searchCount: null, lastSearchedAt: null }
  }

  const keywordRaw =
    entry.keyword !== undefined
      ? entry.keyword
      : entry.query !== undefined
        ? entry.query
        : entry.text !== undefined
          ? entry.text
          : null

  const keyword = typeof keywordRaw === 'string' ? keywordRaw.trim() : ''
  if (!keyword) return null

  const countRaw =
    entry.search_count !== undefined
      ? entry.search_count
      : entry.searchCount !== undefined
        ? entry.searchCount
        : entry.count
  const searchCount = Number.isFinite(Number(countRaw)) ? Number(countRaw) : null

  const lastSearchedAt =
    entry.last_searched_at !== undefined
      ? entry.last_searched_at
      : entry.lastSearchedAt !== undefined
        ? entry.lastSearchedAt
        : entry.updated_at !== undefined
          ? entry.updated_at
          : entry.updatedAt !== undefined
            ? entry.updatedAt
            : null

  return { keyword, searchCount, lastSearchedAt }
}

function parseUnreadValue(value) {
  if (value === null || value === undefined) {
    return 0
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return 0
  }
  return Math.max(0, Math.trunc(numeric))
}

function resolveRoomUnread(room) {
  if (!room || typeof room !== 'object') {
    return 0
  }
  const candidates = [room.unread_count, room.unreadCount, room.unread]
  let resolved = 0
  for (const candidate of candidates) {
    const parsed = parseUnreadValue(candidate)
    if (parsed > resolved) {
      resolved = parsed
    }
  }
  return resolved
}

function normalizeRoomCollections(snapshot = {}) {
  const resolveList = (primary, fallback) => {
    if (Array.isArray(primary)) return primary
    if (Array.isArray(fallback)) return fallback
    return []
  }

  const joinedSource = resolveList(
    snapshot.joined,
    snapshot.rooms || (snapshot.roomSummary && snapshot.roomSummary.joined),
  )
  const availableSource = resolveList(
    snapshot.available,
    snapshot.publicRooms || (snapshot.roomSummary && snapshot.roomSummary.available),
  )
  const trendingSource = resolveList(
    snapshot.trendingKeywords,
    snapshot.trending_keywords || (snapshot.roomSummary && snapshot.roomSummary.trendingKeywords),
  )
  const suggestedSource = resolveList(
    snapshot.suggestedKeywords,
    snapshot.suggested_keywords || (snapshot.roomSummary && snapshot.roomSummary.suggestedKeywords),
  )

  return {
    joined: joinedSource.map((room) => normalizeRoomEntry(room)).filter(Boolean),
    available: availableSource.map((room) => normalizeRoomEntry(room)).filter(Boolean),
    trendingKeywords: trendingSource.map((entry) => normalizeSearchKeyword(entry)).filter(Boolean),
    suggestedKeywords: suggestedSource.map((entry) => normalizeSearchKeyword(entry)).filter(Boolean),
  }
}

function dedupeRoomsById(list = []) {
  if (!Array.isArray(list) || list.length === 0) {
    return []
  }

  const seen = new Set()
  const result = []

  for (const room of list) {
    const id = normalizeId(room?.id)
    if (!id) continue
    if (seen.has(id)) continue
    seen.add(id)
    result.push(room)
  }

  return result
}

function sortRoomsByRecentActivity(list = []) {
  if (!Array.isArray(list) || list.length === 0) {
    return []
  }

  return [...list].sort((a, b) => {
    const aTime = toChrono(a?.last_message_at || a?.updated_at || a?.created_at)
    const bTime = toChrono(b?.last_message_at || b?.updated_at || b?.created_at)
    return bTime - aTime
  })
}

function getDayKey(value) {
  if (!value) return null
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch (error) {
    return null
  }
}

const GLOBAL_ROOM = {
  id: 'global-chat-channel',
  name: '전체 채팅',
  description: '모두가 참여하는 기본 채팅 채널입니다.',
  visibility: 'public',
  builtin: 'global',
}

export default function ChatOverlay({ open, onClose, onUnreadChange }) {
  const [activeTab, setActiveTab] = useState('info')
  const [dashboard, setDashboard] = useState(null)
  const [rooms, setRooms] = useState(() => normalizeRoomCollections())
  const [roomSearchMeta, setRoomSearchMeta] = useState({ trending: [], suggestions: [] })
  const roomsRef = useRef(rooms)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [dashboardError, setDashboardError] = useState(null)
  const [roomError, setRoomError] = useState(null)
  const [selectedHero, setSelectedHero] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [viewerReady, setViewerReady] = useState(false)
  const [context, setContext] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [sending, setSending] = useState(false)
  const [showComposerPanel, setShowComposerPanel] = useState(false)
  const [composerAttachments, setComposerAttachments] = useState([])
  const [attachmentError, setAttachmentError] = useState(null)
  const [aiRequest, setAiRequest] = useState(null)
  const [viewerAttachment, setViewerAttachment] = useState(null)
  const [expandedMessage, setExpandedMessage] = useState(null)
  const [videoControlsVisible, setVideoControlsVisible] = useState(true)
  const [infoHeroFocus, setInfoHeroFocus] = useState(null)
  const [friendOverlayOpen, setFriendOverlayOpen] = useState(false)
  const [createModal, setCreateModal] = useState({ open: false, visibility: 'private' })
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    allowAi: false,
    requireApproval: false,
  })
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [searchPerformed, setSearchPerformed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMediaLimit, setDrawerMediaLimit] = useState(20)
  const [drawerFileLimit, setDrawerFileLimit] = useState(20)
  const [miniOverlay, setMiniOverlay] = useState({
    active: false,
    mode: 'reading',
    position: null,
    size: { width: MINI_OVERLAY_WIDTH, height: MINI_OVERLAY_HEIGHT },
  })
  const viewingConversation = open && (!miniOverlay.active || miniOverlay.mode === 'reading')

  useEffect(() => {
    drawerOpenRef.current = drawerOpen
    if (!drawerOpen) {
      drawerGestureRef.current = {
        tracking: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        moved: false,
        triggered: false,
        openOnStart: false,
      }
    }
  }, [drawerOpen])
  const [profileSheet, setProfileSheet] = useState({ open: false, participant: null, busy: false, error: null })
  const [settingsOverlayOpen, setSettingsOverlayOpen] = useState(false)
  const [roomBans, setRoomBans] = useState([])
  const [roomBansLoading, setRoomBansLoading] = useState(false)
  const [roomAnnouncements, setRoomAnnouncements] = useState([])
  const [roomAnnouncementCursor, setRoomAnnouncementCursor] = useState(null)
  const [roomAnnouncementsHasMore, setRoomAnnouncementsHasMore] = useState(false)
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState(null)
  const nonPinnedAnnouncements = useMemo(() => {
    const list = Array.isArray(roomAnnouncements) ? roomAnnouncements : []
    const pinnedId = pinnedAnnouncement?.id
    if (!pinnedId) {
      return list
    }
    return list.filter((item) => item && item.id !== pinnedId)
  }, [roomAnnouncements, pinnedAnnouncement])
  const [announcementComposer, setAnnouncementComposer] = useState({
    open: false,
    title: '',
    content: '',
    pinned: false,
    imageUrl: '',
    uploading: false,
    attachmentUploading: false,
    submitting: false,
    error: null,
  })
  const [announcementDetail, setAnnouncementDetail] = useState({
    open: false,
    loading: false,
    announcementId: null,
    announcement: null,
    comments: [],
    commentInput: '',
    error: null,
  })
  const [announcementListOpen, setAnnouncementListOpen] = useState(false)
  const [announcementError, setAnnouncementError] = useState(null)
  const [announcementToolbarState, setAnnouncementToolbarState] = useState({
    panel: null,
    bold: false,
    italic: false,
    highlight: false,
    color: null,
    size: 'normal',
  })
  const [announcementYoutubeOverlay, setAnnouncementYoutubeOverlay] = useState({
    open: false,
    query: '',
    results: [],
    loading: false,
    error: null,
  })
  const [announcementPollOverlay, setAnnouncementPollOverlay] = useState({
    open: false,
    question: '',
    options: ['', ''],
    error: null,
  })
  const [roomStats, setRoomStats] = useState(null)
  const [roomStatsLoading, setRoomStatsLoading] = useState(false)
  const [roomPreferences, setRoomPreferences] = useState(null)
  const [preferencesDraft, setPreferencesDraft] = useState({
    bubbleColor: DEFAULT_THEME_CONFIG.bubbleColor,
    textColor: DEFAULT_THEME_CONFIG.textColor,
    backgroundUrl: '',
    backgroundColor: DEFAULT_THEME_CONFIG.backgroundColor,
    useRoomBackground: true,
    themeMode: DEFAULT_THEME_CONFIG.mode,
    themePresetId: DEFAULT_THEME_CONFIG.presetId,
    accentColor: DEFAULT_THEME_CONFIG.accentColor,
    autoContrast: true,
    metadata: {},
  })
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [preferencesError, setPreferencesError] = useState(null)
  const [settingsMessage, setSettingsMessage] = useState(null)
  const [settingsError, setSettingsError] = useState(null)
  const [settingsTab, setSettingsTab] = useState('owner')
  const [banModal, setBanModal] = useState({
    open: false,
    participant: null,
    duration: '60',
    reason: '',
    submitting: false,
    error: null,
  })
  const [apiKeys, setApiKeys] = useState([])
  const [apiKeysLoading, setApiKeysLoading] = useState(false)
  const [apiKeyError, setApiKeyError] = useState(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySubmitting, setApiKeySubmitting] = useState(false)
  const [roomSettingsDraft, setRoomSettingsDraft] = useState({
    defaultBanMinutes: '',
    themeMode: DEFAULT_THEME_CONFIG.mode,
    themePresetId: DEFAULT_THEME_CONFIG.presetId,
    themeBackgroundUrl: '',
    themeBackgroundColor: DEFAULT_THEME_CONFIG.backgroundColor,
    accentColor: DEFAULT_THEME_CONFIG.accentColor,
    bubbleColor: DEFAULT_THEME_CONFIG.bubbleColor,
    textColor: DEFAULT_THEME_CONFIG.textColor,
    autoContrast: true,
  })
  const [roomThemeUploadBusy, setRoomThemeUploadBusy] = useState(false)
  const [memberThemeUploadBusy, setMemberThemeUploadBusy] = useState(false)
  const [mediaLibrary, setMediaLibrary] = useState({
    status: 'idle',
    entries: [],
    action: null,
    error: null,
    errorCode: null,
    multiSelect: false,
    selection: new Map(),
    cursor: null,
    hasMore: false,
    source: null,
    loadingMore: false,
  })
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const unsubscribeRef = useRef(null)
  const messageListRef = useRef(null)
  const conversationRef = useRef(null)
  const composerPanelRef = useRef(null)
  const roomBackgroundInputRef = useRef(null)
  const memberBackgroundInputRef = useRef(null)
  const composerToggleRef = useRef(null)
  const announcementEditorRef = useRef(null)
  const announcementImageInputRef = useRef(null)
  const announcementAttachmentInputRef = useRef(null)
  const announcementVideoInputRef = useRef(null)
  const youtubeSearchAbortRef = useRef(null)
  const attachmentCacheRef = useRef(new Map())
  const longPressTimerRef = useRef(null)
  const longPressActiveRef = useRef(false)
  const videoControlTimerRef = useRef(null)
  const mediaPickerLongPressRef = useRef({ timer: null, active: false, id: null })
  const aiPendingMessageRef = useRef(null)
  const roomMetadataRef = useRef(new Map())
  const lastMarkedReadRef = useRef({ roomId: null, messageId: null })
  const drawerOpenRef = useRef(false)
  const drawerGestureRef = useRef({
    tracking: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
    triggered: false,
    openOnStart: false,
  })
  const rootRef = useRef(null)
  const pinchStateRef = useRef({ initialDistance: null, triggered: false })
  const miniOverlayDragRef = useRef({ pointerId: null, originX: 0, originY: 0, startX: 0, startY: 0 })
  const miniOverlayResizeRef = useRef({ pointerId: null, originHeight: MINI_OVERLAY_HEIGHT, startY: 0 })
  const [viewport, setViewport] = useState(() => getViewportSnapshot())
  const isCompactLayout = viewport.width <= 900
  const isUltraCompactLayout = viewport.width <= 640

  const heroes = useMemo(() => (dashboard?.heroes ? dashboard.heroes : []), [dashboard])

  const heroViewerHint = useMemo(() => {
    if (!Array.isArray(heroes) || heroes.length === 0) return null
    const normalizedSelected = normalizeId(selectedHero)
    const hero =
      heroes.find((item) => normalizeId(item.id) === normalizedSelected) || heroes[0]
    if (!hero) return null
    return {
      heroId: hero.id,
      hero_id: hero.id,
      owner_id: hero.owner_id,
      heroName: hero.name,
      name: hero.name,
      avatar_url: hero.image_url,
    }
  }, [heroes, selectedHero])

  const {
    viewer: socialViewer,
    friends,
    friendRequests,
    loading: friendLoading,
    error: friendError,
    refreshSocial,
  } = useHeroSocialBootstrap(selectedHero, heroViewerHint)

  const { addFriend, removeFriend, acceptFriendRequest, declineFriendRequest, cancelFriendRequest } =
    useFriendActions(socialViewer, refreshSocial)

  const activeRoomId = context?.type === 'chat-room' ? context.chatRoomId : null
  const viewingGlobal = context?.type === 'global'
  const activeSessionId = context?.type === 'session' ? context.sessionId : null
  const joinedRoomIds = useMemo(() => {
    const identifiers = new Set()
    const joined = Array.isArray(rooms?.joined) ? rooms.joined : []
    for (const room of joined) {
      const id = normalizeId(room?.id)
      if (id) {
        identifiers.add(id)
      }
    }
    return identifiers
  }, [rooms])

  const baselineAvailableRooms = useMemo(() => {
    const availableList = Array.isArray(rooms?.available) ? rooms.available : []
    const deduped = dedupeRoomsById(availableList)
    return sortRoomsByRecentActivity(deduped)
  }, [rooms])

  const trimmedSearchQuery = useMemo(() => (searchQuery || '').trim(), [searchQuery])

  const getCollectionUnreadTotal = useCallback((collection) => {
    if (!Array.isArray(collection) || collection.length === 0) {
      return 0
    }
    return collection.reduce((sum, room) => sum + resolveRoomUnread(room), 0)
  }, [])

  const commitUnreadState = useCallback(
    (collections = null) => {
      const snapshot = collections || roomsRef.current
      if (!snapshot) {
        if (onUnreadChange) {
          onUnreadChange(0)
        }
        return
      }

      const total = getCollectionUnreadTotal(snapshot.joined)
      if (onUnreadChange) {
        onUnreadChange(total)
      }
    },
    [getCollectionUnreadTotal, onUnreadChange],
  )

  const syncUnreadFromCollections = useCallback(
    (collections, _options = {}) => {
      if (collections) {
        commitUnreadState(collections)
      } else {
        commitUnreadState()
      }
    },
    [commitUnreadState],
  )

  const getRoomUnreadCount = useCallback((roomId) => {
    const normalized = normalizeId(roomId)
    if (!normalized) {
      return 0
    }

    const overrides = roomMetadataRef.current
    if (overrides && overrides.has(normalized)) {
      const override = overrides.get(normalized)
      const overrideValue = resolveRoomUnread(override)
      if (overrideValue > 0 || parseUnreadValue(override?.unread_count) === 0) {
        return overrideValue
      }
    }

    const snapshot = roomsRef.current
    if (!snapshot) {
      return 0
    }

    const findInCollection = (collection) => {
      if (!Array.isArray(collection)) {
        return null
      }
      return collection.find((room) => normalizeId(room?.id) === normalized) || null
    }

    const target =
      findInCollection(snapshot.joined) ||
      findInCollection(snapshot.available) ||
      (snapshot.roomSummary
        ? findInCollection(snapshot.roomSummary.joined) ||
          findInCollection(snapshot.roomSummary.available)
        : null)

    return resolveRoomUnread(target)
  }, [])

  useEffect(() => {
    if (onUnreadChange) {
      onUnreadChange(0)
    }
  }, [onUnreadChange])

  const resolvedSearchKeywords = useMemo(() => {
    const source = trimmedSearchQuery
      ? roomSearchMeta.suggestions
      : roomSearchMeta.trending
    const limit = trimmedSearchQuery ? 10 : 5
    const seen = new Set()
    const keywords = []

    if (Array.isArray(source)) {
      for (const entry of source) {
        if (!entry || typeof entry.keyword !== 'string') continue
        const key = entry.keyword.trim()
        if (!key) continue
        const normalizedKey = key.toLowerCase()
        if (seen.has(normalizedKey)) continue
        seen.add(normalizedKey)
        keywords.push({ ...entry, keyword: key })
        if (keywords.length >= limit) {
          break
        }
      }
    }

    return keywords
  }, [roomSearchMeta.suggestions, roomSearchMeta.trending, trimmedSearchQuery])

  useEffect(() => {
    roomsRef.current = rooms
  }, [rooms])

  useEffect(() => {
    commitUnreadState(rooms)
  }, [rooms, commitUnreadState])

  useEffect(() => {
    if (!context?.chatRoomId) {
      setDrawerOpen(false)
      setProfileSheet({ open: false, participant: null })
    }
    setDrawerMediaLimit(20)
    setDrawerFileLimit(20)
  }, [context?.chatRoomId])

  useEffect(() => {
    const node = conversationRef.current
    if (!node || typeof window === 'undefined') {
      return
    }

    const resetGesture = () => {
      drawerGestureRef.current = {
        tracking: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        moved: false,
        triggered: false,
        openOnStart: false,
      }
    }

    const handlePointerDown = (event) => {
      if (!context?.chatRoomId) return
      if (event.pointerType === 'mouse' && event.buttons !== 1) return
      if (event.target?.closest('button, a, input, textarea, select, [data-ignore-drawer-gesture="true"]')) {
        return
      }

      const rect = node.getBoundingClientRect()
      const openOnStart = !!drawerOpenRef.current

      if (!openOnStart) {
        const edgeThreshold = Math.min(140, rect.width * 0.28)
        if (event.clientX < rect.right - edgeThreshold) {
          return
        }
      }

      drawerGestureRef.current = {
        tracking: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        triggered: false,
        openOnStart,
      }
    }

    const handlePointerMove = (event) => {
      const gesture = drawerGestureRef.current
      if (!gesture.tracking || gesture.pointerId !== event.pointerId) {
        return
      }

      const dx = event.clientX - gesture.startX
      const dy = event.clientY - gesture.startY

      if (!gesture.moved) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
          return
        }
        if (Math.abs(dy) > Math.abs(dx)) {
          resetGesture()
          return
        }
        gesture.moved = true
      }

      if (gesture.triggered) {
        return
      }

      const threshold = Math.max(48, Math.min(120, node.getBoundingClientRect().width * 0.18))

      if (!gesture.openOnStart && dx <= -threshold) {
        setDrawerOpen(true)
        gesture.triggered = true
      } else if (gesture.openOnStart && dx >= threshold) {
        setDrawerOpen(false)
        gesture.triggered = true
      }
    }

    const handlePointerEnd = (event) => {
      if (drawerGestureRef.current.pointerId !== event.pointerId) {
        return
      }
      resetGesture()
    }

    node.addEventListener('pointerdown', handlePointerDown, { passive: true })
    node.addEventListener('pointermove', handlePointerMove)
    node.addEventListener('pointerup', handlePointerEnd)
    node.addEventListener('pointercancel', handlePointerEnd)
    node.addEventListener('pointerleave', handlePointerEnd)

    return () => {
      node.removeEventListener('pointerdown', handlePointerDown)
      node.removeEventListener('pointermove', handlePointerMove)
      node.removeEventListener('pointerup', handlePointerEnd)
      node.removeEventListener('pointercancel', handlePointerEnd)
      node.removeEventListener('pointerleave', handlePointerEnd)
    }
  }, [context?.chatRoomId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      setViewport(getViewportSnapshot())
    }

    const visual = window.visualViewport

    handleResize()

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    if (visual) {
      visual.addEventListener('resize', handleResize)
      visual.addEventListener('scroll', handleResize)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
      if (visual) {
        visual.removeEventListener('resize', handleResize)
        visual.removeEventListener('scroll', handleResize)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setMiniOverlay((prev) => {
        if (!prev.active) return prev
        return { ...prev, active: false }
      })
    }
  }, [open])

  useEffect(() => {
    setAnnouncementListOpen(false)
  }, [context?.chatRoomId])

  useEffect(() => {
    setMiniOverlay((prev) => {
      if (!prev.active) return prev
      const position = clampMiniOverlayPosition(prev.position, viewport)
      if (!prev.position || prev.position.x !== position.x || prev.position.y !== position.y) {
        return { ...prev, position }
      }
      return prev
    })
  }, [viewport])

  const applyRoomOverrides = useCallback((collections) => {
    if (!collections) {
      return collections
    }

    const overrides = roomMetadataRef.current
    if (!overrides || overrides.size === 0) {
      return collections
    }

    const apply = (list) => {
      if (!Array.isArray(list) || list.length === 0) {
        return list
      }

      let changed = false
      const next = list.map((room) => {
        const id = normalizeId(room?.id)
        if (!id) return room
        const override = overrides.get(id)
        if (!override) return room
        changed = true
        return { ...room, ...override }
      })

      return changed ? next : list
    }

    const nextJoined = apply(collections.joined)
    const nextAvailable = apply(collections.available)

    if (nextJoined === collections.joined && nextAvailable === collections.available) {
      return collections
    }

    return {
      ...collections,
      joined: nextJoined,
      available: nextAvailable,
    }
  }, [])

  const updateRoomMetadata = useCallback((roomId, updates = {}) => {
    if (!roomId || !updates || typeof updates !== 'object') {
      return
    }

    const normalizedRoomId = normalizeId(roomId)
    if (!normalizedRoomId) {
      return
    }

    const patch = { ...updates }
    if (patch.latestMessage && !patch.latest_message) {
      patch.latest_message = patch.latestMessage
    }
    if (
      patch.latest_message &&
      patch.lastMessageAt === undefined &&
      patch.last_message_at === undefined
    ) {
      const createdAt = patch.latest_message.created_at || patch.latest_message.createdAt || null
      if (createdAt) {
        patch.lastMessageAt = createdAt
        patch.last_message_at = createdAt
      }
    }
    if (patch.lastMessageAt && !patch.last_message_at) {
      patch.last_message_at = patch.lastMessageAt
    }
    if (patch.last_message_at && !patch.lastMessageAt) {
      patch.lastMessageAt = patch.last_message_at
    }
    let unreadTouched = false
    if (patch.unread_count !== undefined || patch.unreadCount !== undefined) {
      const unread = patch.unread_count !== undefined ? patch.unread_count : patch.unreadCount
      const numeric = Number(unread)
      const parsed = Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0
      patch.unread_count = parsed
      patch.unreadCount = parsed
      unreadTouched = true
    }

    const overrides = roomMetadataRef.current
    if (overrides) {
      const previous = overrides.get(normalizedRoomId) || {}
      const nextOverride = { ...previous, ...patch }
      if (Object.keys(nextOverride).length === 0) {
        overrides.delete(normalizedRoomId)
      } else {
        overrides.set(normalizedRoomId, nextOverride)
      }
    }

    const applyCollection = (collection) => {
      if (!Array.isArray(collection)) {
        return collection
      }
      let changed = false
      const next = collection.map((room) => {
        if (normalizeId(room.id) !== normalizedRoomId) {
          return room
        }
        changed = true
        return { ...room, ...patch }
      })
      return changed ? next : collection
    }

    let nextCollectionsSnapshot = null

    setRooms((prev) => {
      if (!prev) {
        nextCollectionsSnapshot = null
        return prev
      }
      const nextJoined = applyCollection(prev.joined)
      const nextAvailable = applyCollection(prev.available)
      if (nextJoined === prev.joined && nextAvailable === prev.available) {
        nextCollectionsSnapshot = prev
        return prev
      }
      const nextState = { ...prev, joined: nextJoined, available: nextAvailable }
      nextCollectionsSnapshot = nextState
      return nextState
    })

    setDashboard((prev) => {
      if (!prev) return prev
      const nextRooms = applyCollection(prev.rooms)
      const nextPublic = applyCollection(prev.publicRooms)
      const nextSummary = prev.roomSummary
        ? {
            ...prev.roomSummary,
            joined: applyCollection(prev.roomSummary.joined),
            available: applyCollection(prev.roomSummary.available),
          }
        : prev.roomSummary
      if (
        nextRooms === prev.rooms &&
        nextPublic === prev.publicRooms &&
        nextSummary === prev.roomSummary
      ) {
        return prev
      }
      return {
        ...prev,
        rooms: nextRooms,
        publicRooms: nextPublic,
        roomSummary: nextSummary,
      }
    })

    if (unreadTouched) {
      commitUnreadState(nextCollectionsSnapshot || roomsRef.current)
    }
  }, [commitUnreadState])

  const viewerId = useMemo(() => viewer?.id || viewer?.owner_id || null, [viewer])
  const normalizedViewerId = useMemo(() => normalizeId(viewerId), [viewerId])
  const viewerToken = useMemo(() => normalizeId(viewerId), [viewerId])

  const currentRoom = useMemo(() => {
    if (context?.type !== 'chat-room') {
      return null
    }
    const identifier = normalizeId(context.chatRoomId)
    if (!identifier) return null
    const joined = Array.isArray(rooms?.joined) ? rooms.joined : []
    const available = Array.isArray(rooms?.available) ? rooms.available : []
    return [...joined, ...available].find((room) => normalizeId(room?.id) === identifier) || null
  }, [context, rooms])

  const roomOwnerToken = useMemo(
    () => normalizeId(currentRoom?.owner_id || currentRoom?.ownerId),
    [currentRoom],
  )

  const moderatorTokenSet = useMemo(() => {
    if (!currentRoom) return new Set()
    const candidates =
      currentRoom.moderators ||
      currentRoom.moderator_ids ||
      currentRoom.moderatorIds ||
      currentRoom.moderatorOwners ||
      []
    const set = new Set()
    if (Array.isArray(candidates)) {
      candidates.forEach((candidate) => {
        if (!candidate) return
        const token = normalizeId(
          typeof candidate === 'string'
            ? candidate
            : candidate.owner_id || candidate.ownerId || candidate.id,
        )
        if (token) {
          set.add(token)
        }
      })
    }
    return set
  }, [currentRoom])

  const timelineEntries = useMemo(() => {
    if (!Array.isArray(messages) || messages.length === 0) {
      return []
    }

    const entries = []
    let currentGroup = null
    let lastDayKey = null

    messages.forEach((message, index) => {
      const dayKey = getDayKey(message.created_at)
      if (dayKey && dayKey !== lastDayKey) {
        entries.push({
          type: 'date',
          key: `date-${dayKey}-${index}`,
          label: formatDateLabel(message.created_at),
        })
        lastDayKey = dayKey
        currentGroup = null
      }

      const aiMeta = getAiMetadata(message)
      const ownerId = message.owner_id || message.user_id || null
      const ownerToken = normalizeId(ownerId)
      let mine = Boolean(viewerToken && ownerToken && viewerToken === ownerToken)
      let actorToken = ownerToken || normalizeId(message.username) || `system-${index}`
      let displayName = message.username || '알 수 없음'
      let avatarUrl = message.avatar_url || null
      let initials = displayName.slice(0, 2)
      let participant = null

      if (aiMeta?.type === 'response') {
        mine = false
        actorToken = `ai::${aiMeta.requestId || actorToken}`
        displayName = AI_ASSISTANT_NAME
        avatarUrl = null
        initials = 'AI'
      } else if (ownerToken) {
        const role = ownerToken === roomOwnerToken
          ? 'owner'
          : moderatorTokenSet.has(ownerToken)
            ? 'moderator'
            : 'member'
        participant = {
          ownerToken,
          ownerId,
          userId: message.user_id || null,
          displayName,
          avatarUrl: avatarUrl || message.hero_image_url || null,
          heroId: message.hero_id || message.heroId || null,
          heroImageUrl: message.hero_image_url || null,
          heroName: message.hero_name || null,
          role,
        }
      }

      const groupKey = `${lastDayKey || dayKey || 'unknown'}::${actorToken}::${mine ? 'me' : 'peer'}`

      if (!currentGroup || currentGroup.groupKey !== groupKey) {
        currentGroup = {
          type: 'group',
          key: `group-${groupKey}-${message.id || message.local_id || index}`,
          groupKey,
          mine,
          displayName,
          avatarUrl,
          initials,
          participant,
          messages: [],
        }
        entries.push(currentGroup)
      } else if (participant && !currentGroup.participant) {
        currentGroup.participant = participant
      }

      currentGroup.messages.push(message)
    })

    return entries
  }, [messages, moderatorTokenSet, roomOwnerToken, viewerToken])

  const hasContext = Boolean(context)
  const aiActive = Boolean(aiRequest?.active)
  const hasReadyAttachment = useMemo(
    () => composerAttachments.some((attachment) => attachment?.status === 'ready'),
    [composerAttachments],
  )
  const trimmedMessage = messageInput.trim()
  const disableSend = useMemo(() => {
    if (!hasContext || sending) {
      return true
    }
    if (aiActive) {
      return trimmedMessage.length === 0
    }
    return trimmedMessage.length === 0 && !hasReadyAttachment
  }, [aiActive, hasContext, hasReadyAttachment, sending, trimmedMessage])
  const promptPreview = useMemo(() => {
    if (!aiActive) {
      return null
    }
    const promptSource = aiRequest?.prompt ?? messageInput
    const source = (promptSource || '').trim()
    if (!source) {
      return null
    }
    return truncateText(source, 120)
  }, [aiActive, aiRequest?.prompt, messageInput])

  useEffect(() => {
    if (!settingsOverlayOpen || context?.type !== 'chat-room') {
      return
    }

    const rawTheme = normalizeThemeConfig(
      currentRoom?.default_theme || currentRoom?.defaultTheme || {},
      {
        ...DEFAULT_THEME_CONFIG,
        backgroundUrl:
          currentRoom?.default_background_url || currentRoom?.defaultBackgroundUrl || '',
      },
    )
    const palette = deriveThemePalette(rawTheme)
    const banMinutesRaw =
      currentRoom?.default_ban_minutes !== undefined
        ? currentRoom?.default_ban_minutes
        : currentRoom?.defaultBanMinutes

    setRoomSettingsDraft({
      defaultBanMinutes:
        banMinutesRaw !== undefined && banMinutesRaw !== null && banMinutesRaw !== ''
          ? String(banMinutesRaw)
          : '',
      themeMode: rawTheme.mode,
      themePresetId: rawTheme.presetId,
      themeBackgroundUrl: rawTheme.backgroundUrl || '',
      themeBackgroundColor: rawTheme.backgroundColor || DEFAULT_THEME_CONFIG.backgroundColor,
      accentColor: palette.accentColor,
      bubbleColor: palette.bubbleColor,
      textColor: palette.textColor,
      autoContrast: rawTheme.autoContrast !== false,
    })
  }, [context?.type, context?.chatRoomId, currentRoom, settingsOverlayOpen])

  const viewerOwnsRoom = useMemo(
    () =>
      Boolean(
        context?.type === 'chat-room' && roomOwnerToken && viewerToken && roomOwnerToken === viewerToken,
      ),
    [context?.type, roomOwnerToken, viewerToken],
  )

  const viewerIsModerator = useMemo(
    () =>
      viewerOwnsRoom ||
      (context?.type === 'chat-room' && viewerToken && moderatorTokenSet.has(viewerToken)),
    [context?.type, moderatorTokenSet, viewerOwnsRoom, viewerToken],
  )

  useEffect(() => {
    if (context?.type !== 'chat-room') {
      setPreferencesDraft({
        bubbleColor: DEFAULT_THEME_CONFIG.bubbleColor,
        textColor: DEFAULT_THEME_CONFIG.textColor,
        backgroundUrl: '',
        backgroundColor: DEFAULT_THEME_CONFIG.backgroundColor,
        useRoomBackground: true,
        themeMode: DEFAULT_THEME_CONFIG.mode,
        themePresetId: DEFAULT_THEME_CONFIG.presetId,
        accentColor: DEFAULT_THEME_CONFIG.accentColor,
        autoContrast: true,
        metadata: {},
      })
      return
    }

    const baseThemeConfig = normalizeThemeConfig(
      currentRoom?.default_theme || currentRoom?.defaultTheme || {},
      {
        ...DEFAULT_THEME_CONFIG,
        backgroundUrl:
          currentRoom?.default_background_url || currentRoom?.defaultBackgroundUrl || '',
      },
    )
    const basePalette = deriveThemePalette(baseThemeConfig)
    const storedBubble = normalizeColor(roomPreferences?.bubble_color)
    const storedText = normalizeColor(roomPreferences?.text_color)
    const personalBackgroundUrl = roomPreferences?.background_url || ''
    const metadataTheme = roomPreferences?.metadata?.theme || {}
    const personalThemeConfig = normalizeThemeConfig(metadataTheme, {
      ...baseThemeConfig,
      bubbleColor: storedBubble || basePalette.bubbleColor,
      textColor: storedText || basePalette.textColor,
      backgroundUrl: personalBackgroundUrl || baseThemeConfig.backgroundUrl,
    })
    const personalPalette = deriveThemePalette(personalThemeConfig)
    const useRoomBackground = roomPreferences ? roomPreferences.use_room_background !== false : true
    const mergedPalette = mergeThemePalettes(basePalette, personalPalette, useRoomBackground)
    const activeThemeConfig = useRoomBackground ? baseThemeConfig : personalThemeConfig

    setPreferencesDraft({
      bubbleColor: storedBubble || mergedPalette.bubbleColor,
      textColor: storedText || mergedPalette.textColor,
      backgroundUrl: useRoomBackground ? '' : personalThemeConfig.backgroundUrl || '',
      backgroundColor: activeThemeConfig.backgroundColor || DEFAULT_THEME_CONFIG.backgroundColor,
      useRoomBackground,
      themeMode: activeThemeConfig.mode,
      themePresetId: activeThemeConfig.presetId,
      accentColor: mergedPalette.accentColor,
      autoContrast: activeThemeConfig.autoContrast !== false,
      metadata: roomPreferences?.metadata || {},
    })
  }, [context?.type, currentRoom, roomPreferences])

  const ownerThemeFallback = useMemo(
    () =>
      normalizeThemeConfig(currentRoom?.default_theme || currentRoom?.defaultTheme || {}, {
        ...DEFAULT_THEME_CONFIG,
        backgroundUrl:
          currentRoom?.default_background_url || currentRoom?.defaultBackgroundUrl || '',
      }),
    [currentRoom],
  )

  const ownerThemePreview = useMemo(
    () =>
      buildThemePaletteFromDraft(roomSettingsDraft, {
        fallback: ownerThemeFallback,
        fallbackBackgroundUrl: ownerThemeFallback.backgroundUrl,
      }),
    [ownerThemeFallback, roomSettingsDraft],
  )

  const basePalette = useMemo(() => deriveThemePalette(ownerThemeFallback), [ownerThemeFallback])

  const memberThemeFallback = useMemo(
    () =>
      normalizeThemeConfig(roomPreferences?.metadata?.theme || {}, {
        ...ownerThemeFallback,
        backgroundUrl: roomPreferences?.background_url || ownerThemeFallback.backgroundUrl,
        bubbleColor: roomPreferences?.bubble_color || ownerThemeFallback.bubbleColor,
        textColor: roomPreferences?.text_color || ownerThemeFallback.textColor,
      }),
    [ownerThemeFallback, roomPreferences],
  )

  const personalThemePreview = useMemo(() => {
    const preview = buildThemePaletteFromDraft(
      {
        themeMode: preferencesDraft.themeMode,
        themePresetId: preferencesDraft.themePresetId,
        themeBackgroundUrl: preferencesDraft.backgroundUrl,
        themeBackgroundColor: preferencesDraft.backgroundColor,
        accentColor: preferencesDraft.accentColor,
        bubbleColor: preferencesDraft.bubbleColor,
        textColor: preferencesDraft.textColor,
        autoContrast: preferencesDraft.autoContrast,
      },
      {
        fallback: memberThemeFallback,
        fallbackBackgroundUrl: memberThemeFallback.backgroundUrl || ownerThemeFallback.backgroundUrl,
      },
    )

    if (preferencesDraft.useRoomBackground) {
      return mergeThemePalettes(basePalette, preview, true)
    }

    return preview
  }, [
    basePalette,
    memberThemeFallback,
    ownerThemeFallback.backgroundUrl,
    preferencesDraft,
  ])

  const ownerBackgroundColorValue = useMemo(
    () => getColorPickerValue(roomSettingsDraft.themeBackgroundColor, ownerThemePreview.sampleColor || DEFAULT_THEME_CONFIG.backgroundColor),
    [ownerThemePreview.sampleColor, roomSettingsDraft.themeBackgroundColor],
  )

  const ownerAccentPickerValue = useMemo(
    () => getColorPickerValue(roomSettingsDraft.accentColor, ownerThemePreview.accentColor || DEFAULT_THEME_CONFIG.accentColor),
    [ownerThemePreview.accentColor, roomSettingsDraft.accentColor],
  )

  const ownerBubblePickerValue = useMemo(
    () => getColorPickerValue(roomSettingsDraft.bubbleColor, ownerThemePreview.bubbleColor || DEFAULT_THEME_CONFIG.bubbleColor),
    [ownerThemePreview.bubbleColor, roomSettingsDraft.bubbleColor],
  )

  const ownerTextPickerValue = useMemo(
    () => getColorPickerValue(roomSettingsDraft.textColor, ownerThemePreview.textColor || DEFAULT_THEME_CONFIG.textColor),
    [ownerThemePreview.textColor, roomSettingsDraft.textColor],
  )

  const personalBackgroundColorValue = useMemo(
    () => getColorPickerValue(preferencesDraft.backgroundColor, personalThemePreview.sampleColor || DEFAULT_THEME_CONFIG.backgroundColor),
    [personalThemePreview.sampleColor, preferencesDraft.backgroundColor],
  )

  const personalAccentPickerValue = useMemo(
    () => getColorPickerValue(preferencesDraft.accentColor, personalThemePreview.accentColor || DEFAULT_THEME_CONFIG.accentColor),
    [personalThemePreview.accentColor, preferencesDraft.accentColor],
  )

  const personalBubblePickerValue = useMemo(
    () => getColorPickerValue(preferencesDraft.bubbleColor, personalThemePreview.bubbleColor || DEFAULT_THEME_CONFIG.bubbleColor),
    [personalThemePreview.bubbleColor, preferencesDraft.bubbleColor],
  )

  const personalTextPickerValue = useMemo(
    () => getColorPickerValue(preferencesDraft.textColor, personalThemePreview.textColor || DEFAULT_THEME_CONFIG.textColor),
    [personalThemePreview.textColor, preferencesDraft.textColor],
  )

  const roomTheme = useMemo(() => {
    const metadataTheme = roomPreferences?.metadata?.theme || {}
    const storedBubble = normalizeColor(roomPreferences?.bubble_color)
    const storedText = normalizeColor(roomPreferences?.text_color)
    const personalThemeConfig = normalizeThemeConfig(metadataTheme, {
      ...ownerThemeFallback,
      bubbleColor: storedBubble || basePalette.bubbleColor,
      textColor: storedText || basePalette.textColor,
      backgroundUrl: roomPreferences?.background_url || ownerThemeFallback.backgroundUrl,
    })
    const personalPalette = deriveThemePalette(personalThemeConfig)
    const useRoomBackground = roomPreferences ? roomPreferences.use_room_background !== false : true
    return mergeThemePalettes(basePalette, personalPalette, useRoomBackground)
  }, [basePalette, ownerThemeFallback, roomPreferences])

  const updateOwnerThemeDraft = useCallback(
    (patch, recompute = false) => {
      setRoomSettingsDraft((prev) => {
        const next = { ...prev, ...patch }
        const shouldRecompute = recompute || next.autoContrast
        if (shouldRecompute) {
          const preview = buildThemePaletteFromDraft(next, {
            fallback: ownerThemeFallback,
            fallbackBackgroundUrl: ownerThemeFallback.backgroundUrl,
          })
          next.accentColor = preview.accentColor
          next.bubbleColor = preview.bubbleColor
          next.textColor = preview.textColor
        }
        return next
      })
    },
    [ownerThemeFallback],
  )

  const updateMemberThemeDraft = useCallback(
    (patch, recompute = false) => {
      setPreferencesDraft((prev) => {
        const next = { ...prev, ...patch }
        const shouldRecompute = recompute || next.autoContrast
        if (shouldRecompute) {
          const preview = buildThemePaletteFromDraft(
            {
              themeMode: next.themeMode,
              themePresetId: next.themePresetId,
              themeBackgroundUrl: next.backgroundUrl,
              themeBackgroundColor: next.backgroundColor,
              accentColor: next.accentColor,
              bubbleColor: next.bubbleColor,
              textColor: next.textColor,
              autoContrast: next.autoContrast,
            },
            {
              fallback: memberThemeFallback,
              fallbackBackgroundUrl: memberThemeFallback.backgroundUrl || ownerThemeFallback.backgroundUrl,
            },
          )
          next.accentColor = preview.accentColor
          next.bubbleColor = preview.bubbleColor
          next.textColor = preview.textColor
        }
        return next
      })
    },
    [memberThemeFallback, ownerThemeFallback],
  )

  const handleOwnerThemeModeChange = useCallback(
    (mode) => {
      const normalized = ['preset', 'color', 'image', 'none'].includes(mode) ? mode : 'preset'
      updateOwnerThemeDraft(
        {
          themeMode: normalized,
          themePresetId:
            normalized === 'preset'
              ? roomSettingsDraft.themePresetId || DEFAULT_THEME_PRESET.id
              : roomSettingsDraft.themePresetId,
          themeBackgroundColor:
            normalized === 'color'
              ? roomSettingsDraft.themeBackgroundColor || ownerThemeFallback.backgroundColor
              : roomSettingsDraft.themeBackgroundColor,
          themeBackgroundUrl: normalized === 'image' ? roomSettingsDraft.themeBackgroundUrl : '',
        },
        true,
      )
    },
    [ownerThemeFallback.backgroundColor, roomSettingsDraft.themeBackgroundColor, roomSettingsDraft.themeBackgroundUrl, roomSettingsDraft.themePresetId, updateOwnerThemeDraft],
  )

  const handleOwnerSelectPreset = useCallback(
    (presetId) => {
      const preset = getThemePreset(presetId)
      updateOwnerThemeDraft(
        {
          themeMode: 'preset',
          themePresetId: preset.id,
          accentColor: preset.recommended.accentColor,
          bubbleColor: preset.recommended.bubbleColor,
          textColor: preset.recommended.textColor,
        },
        true,
      )
    },
    [updateOwnerThemeDraft],
  )

  const handleOwnerAccentChange = useCallback(
    (value) => {
      const normalized = normalizeColor(value) || value
      updateOwnerThemeDraft(
        {
          accentColor: normalized || DEFAULT_THEME_CONFIG.accentColor,
        },
        true,
      )
    },
    [updateOwnerThemeDraft],
  )

  const handleOwnerAutoContrastToggle = useCallback(
    (checked) => {
      updateOwnerThemeDraft({ autoContrast: checked }, true)
    },
    [updateOwnerThemeDraft],
  )

  const handleOwnerBubbleInput = useCallback(
    (value) => {
      updateOwnerThemeDraft({ bubbleColor: value }, false)
    },
    [updateOwnerThemeDraft],
  )

  const handleOwnerTextInput = useCallback(
    (value) => {
      updateOwnerThemeDraft({ textColor: value }, false)
    },
    [updateOwnerThemeDraft],
  )

  const handleOwnerBackgroundUpload = useCallback(
    async (file) => {
      if (!file) return
      if (!context?.chatRoomId) {
        setSettingsError('채팅방을 찾을 수 없습니다.')
        return
      }
      setRoomThemeUploadBusy(true)
      setSettingsError(null)
      try {
        const publicUrl = await uploadBackgroundImage({ file, roomId: context.chatRoomId })
        updateOwnerThemeDraft(
          {
            themeMode: 'image',
            themeBackgroundUrl: publicUrl,
          },
          true,
        )
        setSettingsMessage('배경 이미지를 업로드했습니다.')
      } catch (error) {
        console.error('[chat] 방 배경 업로드 실패', error)
        setSettingsError(error?.message || '배경 이미지를 업로드할 수 없습니다.')
      } finally {
        setRoomThemeUploadBusy(false)
      }
    },
    [context?.chatRoomId, updateOwnerThemeDraft],
  )

  const handleOwnerBackgroundFileChange = useCallback(
    async (event) => {
      const file = event.target?.files?.[0] || null
      if (event.target) {
        event.target.value = ''
      }
      if (!file) return
      await handleOwnerBackgroundUpload(file)
    },
    [handleOwnerBackgroundUpload],
  )

  const handleOwnerBackgroundClear = useCallback(() => {
    updateOwnerThemeDraft(
      {
        themeBackgroundUrl: '',
        themeMode: 'image',
      },
      true,
    )
    setSettingsMessage('배경 이미지를 제거했습니다.')
  }, [updateOwnerThemeDraft])

  const handleMemberThemeModeChange = useCallback(
    (mode) => {
      const normalized = ['preset', 'color', 'image', 'none'].includes(mode) ? mode : 'preset'
      updateMemberThemeDraft(
        {
          themeMode: normalized,
          themePresetId:
            normalized === 'preset'
              ? preferencesDraft.themePresetId || DEFAULT_THEME_PRESET.id
              : preferencesDraft.themePresetId,
          backgroundColor:
            normalized === 'color'
              ? preferencesDraft.backgroundColor || ownerThemeFallback.backgroundColor
              : preferencesDraft.backgroundColor,
          backgroundUrl: normalized === 'image' ? preferencesDraft.backgroundUrl : '',
          useRoomBackground: false,
        },
        true,
      )
    },
    [ownerThemeFallback.backgroundColor, preferencesDraft.backgroundColor, preferencesDraft.backgroundUrl, preferencesDraft.themePresetId, updateMemberThemeDraft],
  )

  const handleMemberSelectPreset = useCallback(
    (presetId) => {
      const preset = getThemePreset(presetId)
      updateMemberThemeDraft(
        {
          themeMode: 'preset',
          themePresetId: preset.id,
          accentColor: preset.recommended.accentColor,
          bubbleColor: preset.recommended.bubbleColor,
          textColor: preset.recommended.textColor,
          useRoomBackground: false,
        },
        true,
      )
    },
    [updateMemberThemeDraft],
  )

  const handleMemberAccentChange = useCallback(
    (value) => {
      const normalized = normalizeColor(value) || value
      updateMemberThemeDraft(
        {
          accentColor: normalized || DEFAULT_THEME_CONFIG.accentColor,
        },
        true,
      )
    },
    [updateMemberThemeDraft],
  )

  const handleMemberAutoContrastToggle = useCallback(
    (checked) => {
      updateMemberThemeDraft({ autoContrast: checked }, true)
    },
    [updateMemberThemeDraft],
  )

  const handleMemberBubbleInput = useCallback(
    (value) => {
      updateMemberThemeDraft({ bubbleColor: value }, false)
    },
    [updateMemberThemeDraft],
  )

  const handleMemberTextInput = useCallback(
    (value) => {
      updateMemberThemeDraft({ textColor: value }, false)
    },
    [updateMemberThemeDraft],
  )

  const handleMemberBackgroundUpload = useCallback(
    async (file) => {
      if (!file) return
      setMemberThemeUploadBusy(true)
      setPreferencesError(null)
      try {
        const publicUrl = await uploadBackgroundImage({ file, ownerToken: viewerToken || 'viewer' })
        updateMemberThemeDraft(
          {
            themeMode: 'image',
            backgroundUrl: publicUrl,
            useRoomBackground: false,
          },
          true,
        )
        setSettingsMessage('개인 배경 이미지를 업로드했습니다.')
      } catch (error) {
        console.error('[chat] 개인 배경 업로드 실패', error)
        setPreferencesError(error?.message || '배경 이미지를 업로드할 수 없습니다.')
      } finally {
        setMemberThemeUploadBusy(false)
      }
    },
    [updateMemberThemeDraft, viewerToken],
  )

  const handleMemberBackgroundFileChange = useCallback(
    async (event) => {
      const file = event.target?.files?.[0] || null
      if (event.target) {
        event.target.value = ''
      }
      if (!file) return
      await handleMemberBackgroundUpload(file)
    },
    [handleMemberBackgroundUpload],
  )

  const handleMemberBackgroundClear = useCallback(() => {
    updateMemberThemeDraft(
      {
        backgroundUrl: '',
        themeMode: 'image',
        useRoomBackground: false,
      },
      true,
    )
    setSettingsMessage('개인 배경 이미지를 제거했습니다.')
  }, [updateMemberThemeDraft])

  const handleMemberUseRoomBackgroundChange = useCallback(
    (checked) => {
      updateMemberThemeDraft({ useRoomBackground: checked }, true)
    },
    [updateMemberThemeDraft],
  )

  const messageTextStyle = useMemo(
    () => (roomTheme.textColor ? { ...overlayStyles.messageText, color: roomTheme.textColor } : overlayStyles.messageText),
    [roomTheme.textColor],
  )

  const roomAssets = useMemo(() => {
    if (context?.type !== 'chat-room') {
      return { media: [], files: [] }
    }

    const media = []
    const files = []

    messages.forEach((message) => {
      const attachments = getMessageAttachments(message)
      const createdAt = message.created_at || null
      attachments.forEach((attachment) => {
        const mime = (attachment.mime_type || attachment.mime || '').toLowerCase()
        const type = attachment.type || (mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'file')
        const entry = {
          ...attachment,
          message,
          messageId: message.id || message.local_id || null,
          createdAt,
          ownerToken: normalizeId(message.owner_id || message.user_id),
          kind: type,
        }
        if (type === 'image' || type === 'video') {
          media.push(entry)
        } else {
          files.push(entry)
        }
      })
    })

    const sortByTimeDesc = (a, b) => toChrono(b?.createdAt) - toChrono(a?.createdAt)

    media.sort(sortByTimeDesc)
    files.sort(sortByTimeDesc)

    return { media, files }
  }, [context?.type, context?.chatRoomId, messages])

  const participantList = useMemo(() => {
    if (context?.type !== 'chat-room') {
      return []
    }

    const map = new Map()

    messages.forEach((message) => {
      const ownerToken = normalizeId(message.owner_id || message.user_id)
      if (!ownerToken) return
      const createdAt = message.created_at || null
      const existing = map.get(ownerToken) || {
        ownerToken,
        heroId: message.hero_id || message.heroId || null,
        displayName: message.username || message.hero_name || '알 수 없음',
        avatarUrl: message.avatar_url || message.hero_image_url || null,
        lastMessageAt: null,
        message,
      }

      if (!existing.lastMessageAt || toChrono(createdAt) >= toChrono(existing.lastMessageAt)) {
        existing.heroId = message.hero_id || message.heroId || existing.heroId
        existing.displayName = message.username || message.hero_name || existing.displayName
        existing.avatarUrl = message.avatar_url || message.hero_image_url || existing.avatarUrl
        existing.lastMessageAt = createdAt
        existing.message = message
      }

      map.set(ownerToken, existing)
    })

    const entries = Array.from(map.values()).map((entry) => {
      let role = 'member'
      if (roomOwnerToken && entry.ownerToken === roomOwnerToken) {
        role = 'owner'
      } else if (moderatorTokenSet.has(entry.ownerToken)) {
        role = 'moderator'
      }
      return { ...entry, role }
    })

    const rolePriority = { owner: 0, moderator: 1, member: 2 }
    entries.sort((a, b) => {
      const roleDiff = (rolePriority[a.role] || 9) - (rolePriority[b.role] || 9)
      if (roleDiff !== 0) return roleDiff
      const timeDiff = toChrono(b.lastMessageAt) - toChrono(a.lastMessageAt)
      if (timeDiff !== 0) return timeDiff
      return (a.displayName || '').localeCompare(b.displayName || '', 'ko')
    })

    return entries
  }, [context?.type, context?.chatRoomId, messages, moderatorTokenSet, roomOwnerToken])

  useEffect(() => {
    if (!open) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      setContext(null)
      setMessages([])
      setMessageInput('')
      setShowComposerPanel(false)
      setShowMediaPicker(false)
      setComposerAttachments([])
      setAttachmentError(null)
      setAiRequest(null)
      setDrawerOpen(false)
      setDrawerMediaLimit(20)
      setDrawerFileLimit(20)
      setProfileSheet({ open: false, participant: null })
      setSettingsOverlayOpen(false)
      setExpandedMessage(null)
      setViewerAttachment(null)
      attachmentCacheRef.current.clear()
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      longPressActiveRef.current = false
      if (videoControlTimerRef.current) {
        clearTimeout(videoControlTimerRef.current)
        videoControlTimerRef.current = null
      }
      setVideoControlsVisible(true)
      setViewerReady(false)
      commitUnreadState()
      return
    }

    let mounted = true

    const bootstrap = async () => {
      setLoadingDashboard(true)
      setDashboardError(null)
      try {
        const [snapshot, user] = await Promise.all([fetchChatDashboard({ limit: 24 }), getCurrentUser()])
        if (!mounted) return
        const normalizedRoomState = normalizeRoomCollections({
          joined: snapshot?.roomSummary?.joined || snapshot?.rooms,
          available: snapshot?.roomSummary?.available || snapshot?.publicRooms,
        })
        const patchedRoomState = applyRoomOverrides(normalizedRoomState)
        setDashboard({
          ...snapshot,
          rooms: patchedRoomState.joined,
          publicRooms: patchedRoomState.available,
          roomSummary: patchedRoomState,
        })
        setViewer(user)
        setSelectedHero((snapshot.heroes && snapshot.heroes[0]?.id) || null)
        setRooms(patchedRoomState)
        syncUnreadFromCollections(patchedRoomState, { replace: true })
      } catch (error) {
        if (!mounted) return
        console.error('[chat] 대시보드 로드 실패:', error)
        setDashboardError(error)
      } finally {
        if (mounted) {
          setLoadingDashboard(false)
          setViewerReady(true)
        }
      }
    }

    bootstrap()

    return () => {
      mounted = false
    }
  }, [open, applyRoomOverrides, commitUnreadState, syncUnreadFromCollections])

  useEffect(() => {
    if (!open || !context) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      return
    }

    let cancelled = false
    const load = async () => {
      setLoadingMessages(true)
      setSendError(null)
      try {
        const result = await fetchRecentMessages({
          limit: MESSAGE_LIMIT,
          sessionId: context.sessionId || null,
          matchInstanceId: context.matchInstanceId || null,
          chatRoomId: context.chatRoomId || null,
          scope: context.scope || null,
        })
        if (cancelled) return
        const nextMessages = Array.isArray(result.messages) ? result.messages : []
        setMessages(upsertMessageList([], nextMessages))
        if (context?.type === 'chat-room' && context.chatRoomId) {
          const latestRecord = nextMessages.length ? nextMessages[nextMessages.length - 1] : null
          const patch = {}
          if (latestRecord?.id) {
            patch.latestMessage = latestRecord
          }
          patch.unread_count = 0
          patch.unreadCount = 0
          updateRoomMetadata(context.chatRoomId, patch)
        }

        if (unsubscribeRef.current) {
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }

        unsubscribeRef.current = subscribeToMessages({
          onInsert: (record) => {
            setMessages((prev) => upsertMessageList(prev, record))
            const recordRoomId = normalizeId(record?.chat_room_id || record?.room_id || null)
            const messageOwnerId = normalizeId(record?.owner_id || record?.user_id)
            const fromSelf = Boolean(viewerToken && messageOwnerId && viewerToken === messageOwnerId)

            if (!recordRoomId) {
              return
            }

            const isActiveRoom =
              context?.type === 'chat-room' && normalizeId(context.chatRoomId) === recordRoomId

            if (isActiveRoom) {
              const totalMembers = parseUnreadValue(record.room_member_total)
                ? parseUnreadValue(record.room_member_total)
                : parseUnreadValue(roomStats?.participantCount)
              if (!parseUnreadValue(record.room_member_total) && totalMembers > 0) {
                record.room_member_total = totalMembers
              }
              if (record.room_unread_count === undefined) {
                const baseTotal = parseUnreadValue(record.room_member_total)
                if (baseTotal > 0) {
                  record.room_unread_count = Math.max(0, baseTotal - 1)
                }
              }
              updateRoomMetadata(context.chatRoomId, { latestMessage: record })
            } else {
              const currentUnread = getRoomUnreadCount(recordRoomId)
              const nextUnread = fromSelf ? currentUnread : currentUnread + 1
              const patch = { latestMessage: record }
              if (!fromSelf) {
                patch.unread_count = nextUnread
                patch.unreadCount = nextUnread
              }
              updateRoomMetadata(recordRoomId, patch)
            }
          },
          sessionId: context.sessionId || null,
          matchInstanceId: context.matchInstanceId || null,
          chatRoomId: context.chatRoomId || null,
          scope: context.scope || null,
          ownerId: viewer?.id || null,
          userId: viewer?.id || null,
        })
      } catch (error) {
        if (cancelled) return
        console.error('[chat] 메시지 로드 실패:', error)
        setSendError(error)
      } finally {
        if (!cancelled) {
          setLoadingMessages(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [
    open,
    context,
    viewer,
    viewerToken,
    roomStats?.participantCount,
    getRoomUnreadCount,
    updateRoomMetadata,
  ])

  useEffect(() => {
    if (!viewingConversation) return
    const node = messageListRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, viewingConversation])

  useEffect(() => {
    if (!open) return
    if (context?.type !== 'chat-room') return
    if (!viewingConversation) return

    const roomId = context.chatRoomId
    if (!roomId) return

    const latestPersisted = [...messages]
      .slice()
      .reverse()
      .find((message) => message && message.id)
    const messageId = latestPersisted?.id || null

    const previous = lastMarkedReadRef.current
    if (previous.roomId === roomId && previous.messageId === (messageId || null)) {
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        const result = await markChatRoomRead({ roomId, messageId })
        if (cancelled) return
        if (result?.ok) {
          lastMarkedReadRef.current = { roomId, messageId: messageId || null }
          updateRoomMetadata(roomId, { unread_count: 0, unreadCount: 0 })
        } else if (result?.skipped) {
          lastMarkedReadRef.current = { roomId, messageId: messageId || null }
        }
      } catch (error) {
        if (cancelled) return
        console.error('[chat] 읽음 상태 업데이트 실패:', error)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [
    open,
    context?.type,
    context?.chatRoomId,
    messages,
    viewingConversation,
    markChatRoomRead,
    updateRoomMetadata,
  ])

  useEffect(() => {
    if (!showComposerPanel) return

    const handlePointerDown = (event) => {
      if (
        (composerPanelRef.current && composerPanelRef.current.contains(event.target)) ||
        (composerToggleRef.current && composerToggleRef.current.contains(event.target))
      ) {
        return
      }
      setShowComposerPanel(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [showComposerPanel])

  useEffect(() => {
    setShowComposerPanel(false)
  }, [context])

  useEffect(() => {
    return () => {
      attachmentCacheRef.current.forEach((entry) => {
        if (entry?.url) {
          try {
            URL.revokeObjectURL(entry.url)
          } catch (error) {
            console.warn('[chat] 첨부 미리보기 URL 해제 실패', error)
          }
        }
      })
      attachmentCacheRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (viewerAttachment?.attachment?.type === 'video' && viewerAttachment.status === 'ready') {
      setVideoControlsVisible(true)
      if (videoControlTimerRef.current) {
        clearTimeout(videoControlTimerRef.current)
      }
      videoControlTimerRef.current = setTimeout(() => {
        setVideoControlsVisible(false)
      }, 3000)
    } else {
      if (videoControlTimerRef.current) {
        clearTimeout(videoControlTimerRef.current)
        videoControlTimerRef.current = null
      }
      setVideoControlsVisible(true)
    }

    return () => {
      if (videoControlTimerRef.current) {
        clearTimeout(videoControlTimerRef.current)
        videoControlTimerRef.current = null
      }
    }
  }, [viewerAttachment])

  const refreshRooms = useCallback(
    async (search = '') => {
      setLoadingRooms(true)
      setRoomError(null)
      try {
        const snapshot = await fetchChatRooms({ search })
        const normalized = normalizeRoomCollections(snapshot)
        const patched = applyRoomOverrides(normalized)
        setRooms(patched)
        syncUnreadFromCollections(patched, { replace: true })
        setRoomSearchMeta((prev) => {
          const trending =
            Array.isArray(normalized.trendingKeywords) && normalized.trendingKeywords.length
              ? normalized.trendingKeywords
              : prev.trending
          const nextSuggestions =
            search && search.trim().length
              ? Array.isArray(normalized.suggestedKeywords)
                ? normalized.suggestedKeywords
                : []
              : []
          return {
            trending,
            suggestions: nextSuggestions,
          }
        })
        setDashboard((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            rooms: patched.joined,
            publicRooms: patched.available,
            roomSummary: patched,
          }
        })
      } catch (error) {
        console.error('[chat] 방 목록을 불러오지 못했습니다.', error)
        setRoomError(error)
      } finally {
        setLoadingRooms(false)
      }
    },
    [applyRoomOverrides, syncUnreadFromCollections],
  )

  useEffect(() => {
    if (!open) return
    if (activeTab === 'private' || activeTab === 'open') {
      refreshRooms()
    }
  }, [activeTab, open, refreshRooms])

  const handleSelectHero = useCallback((heroId) => {
    if (!heroId) return
    setSelectedHero(heroId)
    setInfoHeroFocus((current) => (current === heroId ? null : heroId))
  }, [])

  const handleSelectSession = useCallback((session) => {
    if (!session) return
    setContext({
      type: 'session',
      scope: 'main',
      sessionId: session.session_id || session.id,
      matchInstanceId: session.match_instance_id || session.matchInstanceId || null,
      rankRoomId: session.room_id || null,
      label: session.game_name || '세션 채팅',
      focused: true,
    })
    setActiveTab('info')
    setComposerAttachments([])
    setAttachmentError(null)
    setAiRequest(null)
  }, [])

  const handleSelectRoom = useCallback((room, visibility) => {
    if (!room) return
    const roomId = normalizeId(room.id)
    const isGlobal = room.builtin === 'global' || roomId === normalizeId(GLOBAL_ROOM.id)
    if (isGlobal) {
      setContext({
        type: 'global',
        scope: 'global',
        label: room.name || GLOBAL_ROOM.name,
        visibility: 'public',
        focused: true,
      })
      setComposerAttachments([])
      setAttachmentError(null)
      return
    }

    setContext({
      type: 'chat-room',
      scope: 'room',
      chatRoomId: room.id,
      label: room.name || '채팅방',
      visibility: visibility || room.visibility || 'private',
      focused: true,
    })
    updateRoomMetadata(room.id, { unread_count: 0, unreadCount: 0 })
    setComposerAttachments([])
    setAttachmentError(null)
    setAiRequest(null)
  }, [updateRoomMetadata])

  const handleOpenCreateRoom = useCallback(
    (visibility = 'private') => {
      setCreateModal({ open: true, visibility })
      setCreateForm({
        name: '',
        description: '',
        allowAi: visibility === 'public',
        requireApproval: false,
      })
      setCreateError(null)
    },
    [],
  )

  const handleCloseCreateRoom = useCallback(() => {
    setCreateModal({ open: false, visibility: 'private' })
    setCreateError(null)
    setCreateSubmitting(false)
  }, [])

  const handleChangeCreateField = useCallback((field, value) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleSubmitCreateRoom = useCallback(
    async (event) => {
      if (event?.preventDefault) {
        event.preventDefault()
      }

      const trimmedName = (createForm.name || '').trim()
      if (!trimmedName) {
        setCreateError('채팅방 이름을 입력해 주세요.')
        return
      }

      const payload = {
        name: trimmedName,
        description: (createForm.description || '').trim() || null,
        visibility: createModal.visibility === 'public' ? 'public' : 'private',
        allowAi: Boolean(createForm.allowAi),
        requireApproval: Boolean(createForm.requireApproval),
        heroId: selectedHero || null,
      }

      setCreateSubmitting(true)
      setCreateError(null)
      try {
        await createChatRoom(payload)
        await refreshRooms()
        handleCloseCreateRoom()
      } catch (error) {
        console.error('[chat] 채팅방 생성 실패', error)
        setCreateError('채팅방을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.')
      } finally {
        setCreateSubmitting(false)
      }
    },
    [createForm, createModal.visibility, handleCloseCreateRoom, refreshRooms, selectedHero],
  )

  const handleJoinRoom = useCallback(
    async (room) => {
      if (!room?.id) return
      const isGlobal = room.builtin === 'global' || normalizeId(room.id) === normalizeId(GLOBAL_ROOM.id)
      if (isGlobal) {
        handleSelectRoom({ ...GLOBAL_ROOM, ...room }, room.visibility || 'public')
        return
      }
      const roomId = normalizeId(room.id)
      if (!isValidUuid(roomId)) {
        console.warn('[chat] joinChatRoom: invalid room id', roomId)
        alert('채팅방 정보를 확인할 수 없습니다.')
        return
      }
      try {
        await joinChatRoom({ roomId, heroId: selectedHero || null })
        await refreshRooms()
        handleSelectRoom(room, room.visibility)
        setSearchModalOpen(false)
        setSearchResults([])
        setSearchQuery('')
        setSearchPerformed(false)
        setSearchError(null)
      } catch (error) {
        console.error('[chat] 채팅방 참여 실패', error)
        alert('채팅방에 참여할 수 없습니다.')
      }
    },
    [refreshRooms, handleSelectRoom, selectedHero],
  )

  const handleLeaveRoom = useCallback(
    async (room, options = {}) => {
      if (!room) return false
      const roomId = normalizeId(room.id || room.chat_room_id || room.chatRoomId)
      if (!roomId) return false

      const isGlobal =
        room.builtin === 'global' || normalizeId(roomId) === normalizeId(GLOBAL_ROOM.id)
      if (isGlobal) {
        setContext((current) => (current?.type === 'global' ? null : current))
        setMessages([])
        return true
      }

      if (!isValidUuid(roomId)) {
        console.warn('[chat] leaveChatRoom: invalid room id', roomId)
        alert('채팅방 정보를 확인할 수 없습니다.')
        return false
      }

      const asOwner = options.asOwner === true
      const confirmMessage = asOwner
        ? '방을 삭제하면 대화 기록과 설정이 모두 사라집니다. 계속하시겠습니까?'
        : '이 채팅방에서 나가시겠습니까?'
      const confirmed = window.confirm(confirmMessage)
      if (!confirmed) {
        return false
      }

      try {
        if (asOwner) {
          await deleteChatRoom({ roomId })
        } else {
          await leaveChatRoom({ roomId })
        }

        await refreshRooms()

        if (context?.type === 'chat-room' && normalizeId(context.chatRoomId) === roomId) {
          setContext(null)
          setMessages([])
        }

        return true
      } catch (error) {
        console.error(
          asOwner ? '[chat] 채팅방 삭제 실패' : '[chat] 채팅방 나가기 실패',
          error,
        )
        alert(
          asOwner
            ? '채팅방을 삭제할 수 없습니다. 잠시 후 다시 시도해 주세요.'
            : '채팅방을 나갈 수 없습니다. 잠시 후 다시 시도해 주세요.',
        )
        return false
      }
    },
    [context, refreshRooms],
  )

  const handleLeaveCurrentContext = useCallback(
    async (options = {}) => {
      if (!context) return false
      const isRoom = context.type === 'chat-room'
      const isGlobal = context.type === 'global'
      if (!isRoom && !isGlobal) {
        return false
      }

      const baseRoom =
        currentRoom ||
        (isRoom
          ? {
              id: context.chatRoomId,
              visibility: context.visibility || 'private',
              builtin: context.builtin,
            }
          : {
              id: context.chatRoomId,
              builtin: 'global',
            })

      const success = await handleLeaveRoom(baseRoom, options)
      if (success) {
        setDrawerOpen(false)
      }
      return success
    },
    [context, currentRoom, handleLeaveRoom],
  )

  const handleOpenSearchOverlay = useCallback(() => {
    setSearchModalOpen(true)
    setSearchQuery('')
    setSearchResults([])
    setSearchError(null)
    setSearchPerformed(false)
    setSearchLoading(false)
  }, [])

  const handleCloseSearchOverlay = useCallback(() => {
    setSearchModalOpen(false)
    setSearchLoading(false)
    setSearchError(null)
    setSearchResults([])
    setSearchPerformed(false)
  }, [])

  useEffect(() => {
    if (!searchModalOpen) {
      return
    }

    if (trimmedSearchQuery) {
      return
    }

    if (searchLoading) {
      return
    }

    setSearchResults(baselineAvailableRooms)
    setSearchPerformed(false)
  }, [baselineAvailableRooms, searchLoading, searchModalOpen, trimmedSearchQuery])

  const refreshRoomAnnouncements = useCallback(
    async (roomId, { append = false, cursor = null } = {}) => {
      if (!roomId) {
        setRoomAnnouncements([])
        setPinnedAnnouncement(null)
        setRoomAnnouncementsHasMore(false)
        setRoomAnnouncementCursor(null)
        return
      }

      try {
        const result = await fetchChatRoomAnnouncements({ roomId, limit: 20, cursor })
        const nextAnnouncements = Array.isArray(result.announcements) ? result.announcements : []

        setPinnedAnnouncement(result.pinned || null)

        setRoomAnnouncements((current) => {
          if (append) {
            const existingIds = new Set((current || []).map((item) => item.id))
            const merged = [...(current || [])]
            nextAnnouncements.forEach((item) => {
              if (item && !existingIds.has(item.id)) {
                merged.push(item)
              }
            })
            return merged
          }
          return nextAnnouncements
        })

        const last = nextAnnouncements[nextAnnouncements.length - 1]
        setRoomAnnouncementCursor(last?.created_at || cursor || null)
        setRoomAnnouncementsHasMore(Boolean(result.hasMore))
      } catch (error) {
        console.error('[chat] 공지사항 로드 실패', error)
        setAnnouncementError('공지사항을 불러올 수 없습니다.')
      }
    },
    [],
  )

  const refreshRoomBans = useCallback(
    async (roomId) => {
      if (!roomId || !viewerIsModerator) {
        setRoomBans([])
        return
      }

      setRoomBansLoading(true)
      try {
        const bans = await fetchChatRoomBans({ roomId })
        setRoomBans(bans)
      } catch (error) {
        console.error('[chat] 채팅방 차단 목록 로드 실패', error)
      } finally {
        setRoomBansLoading(false)
      }
    },
    [viewerIsModerator],
  )

  const refreshRoomStatsData = useCallback(
    async (roomId) => {
      if (!roomId) {
        setRoomStats(null)
        return
      }
      setRoomStatsLoading(true)
      try {
        const stats = await fetchChatRoomStats({ roomId })
        setRoomStats(stats || {})
      } catch (error) {
        console.error('[chat] 채팅방 통계 로드 실패', error)
      } finally {
        setRoomStatsLoading(false)
      }
    },
    [],
  )

  const refreshRoomPreferences = useCallback(
    async (roomId) => {
      if (!roomId) {
        setRoomPreferences(null)
        return
      }
      try {
        const prefs = await fetchChatMemberPreferences({ roomId })
        setRoomPreferences(prefs)
      } catch (error) {
        console.error('[chat] 개인 설정 로드 실패', error)
      }
    },
    [],
  )

  useEffect(() => {
    if (context?.type === 'chat-room' && context.chatRoomId) {
      refreshRoomAnnouncements(context.chatRoomId)
      refreshRoomBans(context.chatRoomId)
      refreshRoomStatsData(context.chatRoomId)
      refreshRoomPreferences(context.chatRoomId)
    } else {
      refreshRoomAnnouncements(null)
      refreshRoomBans(null)
      refreshRoomStatsData(null)
      refreshRoomPreferences(null)
    }
  }, [
    context?.chatRoomId,
    context?.type,
    refreshRoomAnnouncements,
    refreshRoomBans,
    refreshRoomPreferences,
    refreshRoomStatsData,
  ])

  const buildApiKeyHeaders = useCallback(
    (extra = {}) => {
      const headers = { ...extra }
      if (viewerId) {
        headers['x-rank-user-id'] = viewerId
      }
      return headers
    },
    [viewerId],
  )

  const refreshApiKeyring = useCallback(async () => {
    if (!viewerId) {
      setApiKeys([])
      if (viewerReady) {
        setApiKeyError('API 키는 로그인한 사용자만 관리할 수 있습니다.')
      } else {
        setApiKeyError(null)
      }
      setApiKeysLoading(false)
      return
    }

    setApiKeysLoading(true)
    setApiKeyError(null)
    try {
      const response = await fetch('/api/rank/user-api-keyring', {
        headers: buildApiKeyHeaders(),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.detail || '키 목록을 불러올 수 없습니다.')
      }
      const payload = await response.json()
      const entries = Array.isArray(payload?.keys)
        ? payload.keys
        : Array.isArray(payload?.entries)
          ? payload.entries
          : []
      setApiKeys(entries)
    } catch (error) {
      console.error('[chat] API 키 목록 로드 실패', error)
      setApiKeyError(error?.message || 'API 키 목록을 불러올 수 없습니다.')
    } finally {
      setApiKeysLoading(false)
    }
  }, [buildApiKeyHeaders, viewerId, viewerReady])

  const handleAddApiKey = useCallback(async () => {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) {
      setApiKeyError('API 키를 입력해 주세요.')
      return
    }
    if (!viewerId) {
      setApiKeyError('로그인 후 API 키를 추가할 수 있습니다.')
      return
    }
    setApiKeySubmitting(true)
    setApiKeyError(null)
    try {
      const response = await fetch('/api/rank/user-api-keyring', {
        method: 'POST',
        headers: buildApiKeyHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ apiKey: trimmed, activate: true }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.detail || payload?.error || 'API 키를 저장할 수 없습니다.')
      }
      setApiKeyInput('')
      setSettingsMessage('API 키를 추가했습니다.')
      await refreshApiKeyring()
    } catch (error) {
      console.error('[chat] API 키 추가 실패', error)
      setApiKeyError(error?.message || 'API 키를 추가할 수 없습니다.')
    } finally {
      setApiKeySubmitting(false)
    }
  }, [apiKeyInput, buildApiKeyHeaders, refreshApiKeyring, viewerId])

  const handleDeleteApiKey = useCallback(
    async (entryId) => {
      if (!entryId) return
      if (!viewerId) {
        setApiKeyError('로그인 후 API 키를 삭제할 수 있습니다.')
        return
      }
      try {
        const response = await fetch('/api/rank/user-api-keyring', {
          method: 'DELETE',
          headers: buildApiKeyHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ id: entryId }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.detail || payload?.error || 'API 키를 삭제할 수 없습니다.')
        }
        setSettingsMessage('API 키를 삭제했습니다.')
        await refreshApiKeyring()
      } catch (error) {
        console.error('[chat] API 키 삭제 실패', error)
        setApiKeyError(error?.message || 'API 키를 삭제할 수 없습니다.')
      }
    },
    [buildApiKeyHeaders, refreshApiKeyring, viewerId],
  )

  const handleToggleApiKey = useCallback(
    async (entry, action) => {
      if (!entry?.id) return
      if (!viewerId) {
        setApiKeyError('로그인 후 API 키를 변경할 수 있습니다.')
        return
      }

      const verb = action === 'deactivate' ? 'deactivate' : 'activate'
      try {
        const response = await fetch('/api/rank/user-api-keyring', {
          method: 'PATCH',
          headers: buildApiKeyHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ id: entry.id, action: verb }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.detail || payload?.error || 'API 키 상태를 변경할 수 없습니다.')
        }
        setSettingsMessage(
          verb === 'deactivate' ? 'API 키 사용을 해제했습니다.' : 'API 키를 기본값으로 설정했습니다.',
        )
        await refreshApiKeyring()
      } catch (error) {
        console.error('[chat] API 키 상태 변경 실패', error)
        setApiKeyError(error?.message || 'API 키 상태를 변경할 수 없습니다.')
      }
    },
    [buildApiKeyHeaders, refreshApiKeyring, viewerId],
  )

  useEffect(() => {
    if (!settingsOverlayOpen) {
      setSettingsMessage(null)
      setSettingsError(null)
      setPreferencesError(null)
      setAnnouncementError(null)
      return
    }

    setSettingsTab(viewerOwnsRoom ? 'owner' : 'preferences')

    if (context?.type === 'chat-room' && context.chatRoomId) {
      refreshRoomPreferences(context.chatRoomId)
      refreshRoomStatsData(context.chatRoomId)
      if (viewerIsModerator) {
        refreshRoomBans(context.chatRoomId)
      }
    }

    refreshApiKeyring()
  }, [
    context?.chatRoomId,
    context?.type,
    refreshApiKeyring,
    refreshRoomBans,
    refreshRoomPreferences,
    refreshRoomStatsData,
    settingsOverlayOpen,
    viewerIsModerator,
    viewerOwnsRoom,
  ])

  const handleLoadMoreAnnouncements = useCallback(() => {
    if (!context?.chatRoomId || !roomAnnouncementsHasMore || !roomAnnouncementCursor) {
      return
    }
    refreshRoomAnnouncements(context.chatRoomId, {
      append: true,
      cursor: roomAnnouncementCursor,
    })
  }, [context?.chatRoomId, refreshRoomAnnouncements, roomAnnouncementCursor, roomAnnouncementsHasMore])

  const handleOpenAnnouncementComposer = useCallback(() => {
    if (!context?.chatRoomId) return
    if (!viewerIsModerator) {
      setAnnouncementError('공지 작성 권한이 없습니다.')
      return
    }
    if (announcementImageInputRef.current) {
      announcementImageInputRef.current.value = ''
    }
    setAnnouncementComposer({
      open: true,
      title: '',
      content: '',
      pinned: false,
      imageUrl: '',
      uploading: false,
      attachmentUploading: false,
      submitting: false,
      error: null,
    })
    setAnnouncementToolbarState({
      panel: null,
      bold: false,
      italic: false,
      highlight: false,
      color: null,
      size: 'normal',
    })
    setAnnouncementYoutubeOverlay({ open: false, query: '', results: [], loading: false, error: null })
    setAnnouncementPollOverlay({ open: false, question: '', options: ['', ''], error: null })
  }, [context?.chatRoomId, viewerIsModerator])

  const handleCloseAnnouncementComposer = useCallback(() => {
    if (announcementImageInputRef.current) {
      announcementImageInputRef.current.value = ''
    }
    if (announcementEditorRef.current) {
      announcementEditorRef.current.innerHTML = ''
    }
    setAnnouncementComposer({
      open: false,
      title: '',
      content: '',
      pinned: false,
      imageUrl: '',
      uploading: false,
      attachmentUploading: false,
      submitting: false,
      error: null,
    })
    setAnnouncementToolbarState({ color: false, size: false })
    setAnnouncementYoutubeOverlay({ open: false, query: '', results: [], loading: false, error: null })
    setAnnouncementPollOverlay({ open: false, question: '', options: ['', ''], error: null })
  }, [])

  const handleAnnouncementTitleChange = useCallback((value) => {
    setAnnouncementComposer((prev) => ({ ...prev, title: value }))
  }, [])

  const focusAnnouncementEditor = useCallback(() => {
    const node = announcementEditorRef.current
    if (!node) return
    node.focus({ preventScroll: true })
    if (document.activeElement !== node) {
      node.focus()
    }
  }, [])

  const syncAnnouncementToolbarState = useCallback(() => {
    const editor = announcementEditorRef.current
    if (!editor) return
    const selection = document.getSelection()
    if (!selection || !selection.anchorNode || !editor.contains(selection.anchorNode)) {
      setAnnouncementToolbarState((prev) => ({ ...prev, bold: false, italic: false, highlight: false }))
      return
    }
    const anchorElement =
      selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode
        : selection.anchorNode.parentElement
    const findInlineStyle = (property) => {
      let current = anchorElement
      while (current && current !== editor) {
        if (current.nodeType === Node.ELEMENT_NODE && current.style && current.style[property]) {
          return current.style[property]
        }
        current = current.parentElement
      }
      return null
    }
    const boldActive = document.queryCommandState('bold')
    const italicActive = document.queryCommandState('italic')
    let highlightActive = false
    try {
      const hilite = document.queryCommandValue('hiliteColor') || document.queryCommandValue('backColor')
      const inlineBackground = findInlineStyle('backgroundColor')
      if (inlineBackground) {
        const normalized = getColorPickerValue(inlineBackground, ANNOUNCEMENT_HIGHLIGHT_COLOR)
        highlightActive = normalized.toLowerCase() === getColorPickerValue(ANNOUNCEMENT_HIGHLIGHT_COLOR)
      } else if (typeof hilite === 'string') {
        const normalized = getColorPickerValue(hilite, ANNOUNCEMENT_HIGHLIGHT_COLOR)
        highlightActive = normalized.toLowerCase() === getColorPickerValue(ANNOUNCEMENT_HIGHLIGHT_COLOR)
      }
    } catch (error) {
      highlightActive = false
    }
    let colorValue = null
    try {
      const commandColor = document.queryCommandValue('foreColor')
      const inlineColor = findInlineStyle('color')
      if (inlineColor) {
        colorValue = getColorPickerValue(inlineColor, inlineColor)
      } else if (typeof commandColor === 'string') {
        const normalized = getColorPickerValue(commandColor, commandColor)
        if (!['#000000', '#000'].includes(normalized.toLowerCase())) {
          colorValue = normalized
        }
      }
    } catch (error) {
      colorValue = null
    }
    let sizeValue = 'normal'
    try {
      const inlineSize = findInlineStyle('fontSize')
      if (inlineSize) {
        const match = ANNOUNCEMENT_TOOLBAR_SIZES.find((entry) => {
          const emSize = `${ANNOUNCEMENT_SIZE_SCALE[entry.id]}em`
          return inlineSize === emSize || inlineSize === `${ANNOUNCEMENT_SIZE_SCALE[entry.id] * 16}px`
        })
        if (match) {
          sizeValue = match.id
        }
      }
      const commandSize = document.queryCommandValue('fontSize')
      if (commandSize && ANNOUNCEMENT_FONT_SIZE_BY_COMMAND[commandSize]) {
        sizeValue = ANNOUNCEMENT_FONT_SIZE_BY_COMMAND[commandSize]
      }
    } catch (error) {
      sizeValue = 'normal'
    }
    setAnnouncementToolbarState((prev) => ({
      ...prev,
      bold: !!boldActive,
      italic: !!italicActive,
      highlight: !!highlightActive,
      color: colorValue,
      size: sizeValue,
    }))
  }, [])

  const syncAnnouncementContentFromEditor = useCallback(() => {
    const node = announcementEditorRef.current
    if (!node) return ''
    const sanitized = sanitizeAnnouncementHtml(node.innerHTML || '')
    setAnnouncementComposer((prev) => (prev.content === sanitized ? prev : { ...prev, content: sanitized }))
    return sanitized
  }, [])

  const handleAnnouncementEditorInput = useCallback(() => {
    syncAnnouncementContentFromEditor()
    syncAnnouncementToolbarState()
  }, [syncAnnouncementContentFromEditor, syncAnnouncementToolbarState])

  const handleAnnouncementEditorPaste = useCallback(
    (event) => {
      event.preventDefault()
      const editor = announcementEditorRef.current
      if (!editor) return
      const clipboard = event.clipboardData
      const html = clipboard?.getData('text/html')
      const text = clipboard?.getData('text/plain')
      const snippet = html
        ? sanitizeAnnouncementHtml(html)
        : escapeHtml(text || '').replace(/\n/g, '<br />')
      try {
        document.execCommand('insertHTML', false, snippet)
      } catch (error) {
        editor.insertAdjacentHTML('beforeend', snippet)
      }
      requestAnimationFrame(() => {
        syncAnnouncementContentFromEditor()
        syncAnnouncementToolbarState()
      })
    },
    [syncAnnouncementContentFromEditor, syncAnnouncementToolbarState],
  )

  const applyAnnouncementCommand = useCallback(
    (command, value = null) => {
      const editor = announcementEditorRef.current
      if (!editor) return
      focusAnnouncementEditor()
      try {
        document.execCommand('styleWithCSS', false, true)
      } catch (error) {
        // ignore
      }
      if (command === 'hiliteColor' && value === null) {
        document.execCommand('removeFormat')
      } else {
        document.execCommand(command, false, value)
      }
      requestAnimationFrame(() => {
        syncAnnouncementContentFromEditor()
        syncAnnouncementToolbarState()
      })
    },
    [focusAnnouncementEditor, syncAnnouncementContentFromEditor, syncAnnouncementToolbarState],
  )

  const handleAnnouncementToolbarCommand = useCallback(
    (command) => {
      if (command === 'bold' || command === 'italic') {
        applyAnnouncementCommand(command)
      } else if (command === 'highlight') {
        if (announcementToolbarState.highlight) {
          applyAnnouncementCommand('hiliteColor', 'transparent')
        } else {
          applyAnnouncementCommand('hiliteColor', ANNOUNCEMENT_HIGHLIGHT_COLOR)
        }
      }
    },
    [announcementToolbarState.highlight, applyAnnouncementCommand],
  )

  const handleAnnouncementToolbarPanelToggle = useCallback((panel) => {
    setAnnouncementToolbarState((prev) => ({
      ...prev,
      panel: prev.panel === panel ? null : panel,
    }))
  }, [])

  const handleAnnouncementColorPick = useCallback(
    (color) => {
      const normalized = getColorPickerValue(color, color)
      applyAnnouncementCommand('foreColor', normalized)
      setAnnouncementToolbarState((prev) => ({ ...prev, panel: null, color: normalized }))
    },
    [applyAnnouncementCommand],
  )

  const handleAnnouncementSizePick = useCallback(
    (sizeId) => {
      const size = ANNOUNCEMENT_TOOLBAR_SIZES.find((entry) => entry.id === sizeId)
      if (!size) return
      applyAnnouncementCommand('fontSize', size.command)
      setAnnouncementToolbarState((prev) => ({ ...prev, panel: null, size: size.id }))
    },
    [applyAnnouncementCommand],
  )

  const insertAnnouncementHtml = useCallback(
    (html) => {
      const editor = announcementEditorRef.current
      if (!editor) return
      focusAnnouncementEditor()
      try {
        document.execCommand('insertHTML', false, html)
      } catch (error) {
        editor.insertAdjacentHTML('beforeend', html)
      }
      requestAnimationFrame(() => {
        syncAnnouncementContentFromEditor()
        syncAnnouncementToolbarState()
      })
    },
    [focusAnnouncementEditor, syncAnnouncementContentFromEditor, syncAnnouncementToolbarState],
  )

  const handleAnnouncementAttachmentTrigger = useCallback(
    (type) => {
      if (announcementComposer.attachmentUploading || announcementComposer.submitting) return
      const target = type === 'video' ? announcementVideoInputRef.current : announcementAttachmentInputRef.current
      if (target) {
        target.click()
      }
    },
    [announcementComposer.attachmentUploading, announcementComposer.submitting],
  )

  const handleAnnouncementAttachmentSelect = useCallback(
    async (event, type) => {
      if (!context?.chatRoomId) return
      const file = event.target?.files?.[0]
      if (event.target) {
        event.target.value = ''
      }
      if (!file) return
      setAnnouncementComposer((prev) => ({ ...prev, attachmentUploading: true, error: null }))
      try {
        const { url } = await uploadAnnouncementMedia({
          file,
          roomId: context.chatRoomId,
          kind: type,
        })
        if (!url) {
          throw new Error('업로드된 파일 URL을 확인할 수 없습니다.')
        }
        if (type === 'image') {
          const alt = escapeHtml(file.name ? file.name.replace(/\s+/g, ' ') : '첨부 이미지')
          const snippet = `
<figure style="margin: 12px 0; border-radius: 12px; overflow: hidden; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.35);">
  <img src="${url}" alt="${alt}" style="display:block;width:100%;height:auto;" loading="lazy" />
  <figcaption style="padding: 6px 10px; font-size: 12px; color: #cbd5f5;">${alt}</figcaption>
</figure>`
          insertAnnouncementHtml(snippet)
        } else if (type === 'video') {
          const snippet = `
<div style="margin: 12px 0; border-radius: 12px; overflow: hidden; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.35);">
  <video src="${url}" controls playsinline style="display:block;width:100%;max-height:320px;background:#000;"></video>
</div>`
          insertAnnouncementHtml(snippet)
        }
      } catch (error) {
        console.error('[chat] 공지 첨부 업로드 실패', error)
        setAnnouncementComposer((prev) => ({
          ...prev,
          error: error?.message || '첨부 파일을 업로드할 수 없습니다.',
        }))
      } finally {
        setAnnouncementComposer((prev) => ({ ...prev, attachmentUploading: false }))
      }
    },
    [context?.chatRoomId, insertAnnouncementHtml],
  )

  useEffect(() => {
    if (!announcementComposer.open) {
      return
    }
    const node = announcementEditorRef.current
    if (node) {
      const safeHtml = sanitizeAnnouncementHtml(announcementComposer.content || '')
      if (node.innerHTML !== safeHtml) {
        node.innerHTML = safeHtml
      }
    }
    requestAnimationFrame(() => {
      syncAnnouncementToolbarState()
    })
  }, [announcementComposer.content, announcementComposer.open, syncAnnouncementToolbarState])

  useEffect(() => {
    if (!announcementComposer.open) return undefined
    const handler = () => {
      if (!announcementComposer.open) return
      syncAnnouncementToolbarState()
    }
    document.addEventListener('selectionchange', handler)
    requestAnimationFrame(() => {
      focusAnnouncementEditor()
      syncAnnouncementToolbarState()
    })
    return () => {
      document.removeEventListener('selectionchange', handler)
    }
  }, [announcementComposer.open, focusAnnouncementEditor, syncAnnouncementToolbarState])

  const handleAnnouncementYoutubeOpen = useCallback(() => {
    setAnnouncementYoutubeOverlay({ open: true, query: '', results: [], loading: false, error: null })
  }, [])

  const handleAnnouncementYoutubeClose = useCallback(() => {
    if (youtubeSearchAbortRef.current) {
      youtubeSearchAbortRef.current.abort()
      youtubeSearchAbortRef.current = null
    }
    setAnnouncementYoutubeOverlay({ open: false, query: '', results: [], loading: false, error: null })
  }, [])

  const handleAnnouncementYoutubeQueryChange = useCallback((value) => {
    setAnnouncementYoutubeOverlay((prev) => ({ ...prev, query: value }))
  }, [])

  const handleAnnouncementYoutubeSearch = useCallback(
    async (queryInput) => {
      const query = (queryInput || '').trim()
      if (!query) {
        setAnnouncementYoutubeOverlay((prev) => ({ ...prev, error: '검색어를 입력해 주세요.' }))
        return
      }
      if (youtubeSearchAbortRef.current) {
        youtubeSearchAbortRef.current.abort()
        youtubeSearchAbortRef.current = null
      }
      const controller = new AbortController()
      youtubeSearchAbortRef.current = controller
      setAnnouncementYoutubeOverlay((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const response = await fetch(`/api/chat/youtube-search?q=${encodeURIComponent(query)}&limit=12`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload?.error || '유튜브 검색에 실패했습니다.')
        }
        const payload = await response.json()
        const results = Array.isArray(payload?.results) ? payload.results : []
        setAnnouncementYoutubeOverlay((prev) => ({
          ...prev,
          loading: false,
          results,
          error: results.length ? null : '검색 결과가 없습니다.',
        }))
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }
        console.error('[chat] 유튜브 검색 실패', error)
        setAnnouncementYoutubeOverlay((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || '유튜브 검색을 수행할 수 없습니다.',
        }))
      } finally {
        youtubeSearchAbortRef.current = null
      }
    },
    [],
  )

  const handleAnnouncementYoutubeSelect = useCallback(
    (video) => {
      if (!video) return
      const candidateId = video.id || video.videoId || video.url || ''
      const youtubeId = sanitizeYoutubeId(candidateId)
      if (!youtubeId) {
        setAnnouncementYoutubeOverlay((prev) => ({ ...prev, error: '선택한 영상 ID를 확인할 수 없습니다.' }))
        return
      }
      const titleSource = typeof video.title === 'string' ? video.title.trim() : ''
      const title = titleSource ? titleSource.replace(/"/g, "'") : 'YouTube 영상'
      const thumb = sanitizeExternalUrl(video.thumbnail || video.thumbnailUrl || '')
      const attributes = [`id="${youtubeId}"`, `title="${title}"`]
      if (thumb) {
        attributes.push(`thumbnail="${thumb}"`)
      }
      const preview = thumb
        ? `<img src="${thumb}" alt="${escapeHtml(title)}" style="display:block;width:100%;height:auto;" loading="lazy" />`
        : `<iframe src="${getYoutubeEmbedUrl(youtubeId)}" title="${escapeHtml(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" style="width:100%;min-height:220px;border:0;border-radius:12px;"></iframe>`
      const overlay = thumb
        ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><span style="background:rgba(15,23,42,0.75);color:#f8fafc;padding:8px 14px;border-radius:999px;font-size:13px;">▶ ${escapeHtml(title)}</span></div>`
        : ''
      const hiddenEmbed = thumb
        ? `<iframe src="${getYoutubeEmbedUrl(youtubeId)}" title="${escapeHtml(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" style="position:absolute; inset:0; opacity:0;" tabindex="-1"></iframe>`
        : ''
      const snippet = `
<div style="position: relative; margin: 12px 0; border-radius: 14px; overflow: hidden; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.35);">
  ${preview}
  ${overlay}
  <div style="padding: 8px 12px; font-size: 12px; color: #cbd5f5;">${escapeHtml(title)}</div>
  ${hiddenEmbed}
</div>`
      insertAnnouncementHtml(snippet)
      handleAnnouncementYoutubeClose()
    },
    [handleAnnouncementYoutubeClose, insertAnnouncementHtml],
  )

  const handleAnnouncementPollOpen = useCallback(() => {
    setAnnouncementPollOverlay({ open: true, question: '', options: ['', ''], error: null })
  }, [])

  const handleAnnouncementPollClose = useCallback(() => {
    setAnnouncementPollOverlay({ open: false, question: '', options: ['', ''], error: null })
  }, [])

  const handleAnnouncementPollQuestionChange = useCallback((value) => {
    setAnnouncementPollOverlay((prev) => ({ ...prev, question: value }))
  }, [])

  const handleAnnouncementPollOptionChange = useCallback((index, value) => {
    setAnnouncementPollOverlay((prev) => {
      const next = [...prev.options]
      next[index] = value
      return { ...prev, options: next }
    })
  }, [])

  const handleAnnouncementPollAddOption = useCallback(() => {
    setAnnouncementPollOverlay((prev) => {
      if (prev.options.length >= ANNOUNCEMENT_POLL_MAX_OPTIONS) {
        return {
          ...prev,
          error: `최대 ${ANNOUNCEMENT_POLL_MAX_OPTIONS}개까지 선택지를 추가할 수 있습니다.`,
        }
      }
      return { ...prev, options: [...prev.options, ''], error: null }
    })
  }, [])

  const handleAnnouncementPollRemoveOption = useCallback((index) => {
    setAnnouncementPollOverlay((prev) => {
      if (prev.options.length <= ANNOUNCEMENT_POLL_MIN_OPTIONS) {
        return {
          ...prev,
          error: `최소 ${ANNOUNCEMENT_POLL_MIN_OPTIONS}개 이상의 선택지가 필요합니다.`,
        }
      }
      const next = prev.options.filter((_, optionIndex) => optionIndex !== index)
      return { ...prev, options: next, error: null }
    })
  }, [])

  const handleAnnouncementPollSubmit = useCallback(() => {
    setAnnouncementPollOverlay((prev) => {
      const question = (prev.question || '').trim()
      const options = prev.options.map((option) => option.trim()).filter(Boolean)
      if (!question) {
        return { ...prev, error: '투표 제목을 입력해 주세요.' }
      }
      if (options.length < ANNOUNCEMENT_POLL_MIN_OPTIONS) {
        return {
          ...prev,
          error: `최소 ${ANNOUNCEMENT_POLL_MIN_OPTIONS}개의 선택지가 필요합니다.`,
        }
      }
      const safeQuestion = escapeHtml(question.replace(/\n/g, ' '))
      const safeOptions = options.map((option) => escapeHtml(option.replace(/\n/g, ' ')))
      const optionsHtml = safeOptions
        .map(
          (option) =>
            `<li style="padding: 8px 10px; border-radius: 10px; background: rgba(15,23,42,0.55); margin-top: 6px; color: #e2e8f0; font-size: 13px;">${option}</li>`,
        )
        .join('')
      const snippet = `
<div style="margin: 12px 0; padding: 12px; border-radius: 12px; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148,163,184,0.35);" data-announcement-poll="true" data-poll-question="${safeQuestion}">
  <strong style="display:block;font-size:13px;color:#e2e8f0;">${safeQuestion}</strong>
  <ul style="list-style:none;padding:0;margin:6px 0 0;">${optionsHtml}</ul>
</div>`
      insertAnnouncementHtml(snippet)
      return { open: false, question: '', options: ['', ''], error: null }
    })
  }, [insertAnnouncementHtml])

  const handleDeleteAnnouncementComment = useCallback(
    async (comment) => {
      const commentId = comment?.id
      if (!commentId) return
      const confirmDelete = window.confirm('이 댓글을 삭제하시겠습니까?')
      if (!confirmDelete) return
      setAnnouncementDetail((prev) => ({ ...prev, loading: true, error: null }))
      try {
        await deleteChatRoomAnnouncementComment({ commentId })
        const detail = await fetchChatRoomAnnouncementDetail({ announcementId: announcementDetail.announcementId })
        setAnnouncementDetail((prev) => ({
          ...prev,
          loading: false,
          announcement: detail.announcement || prev.announcement,
          comments: detail.comments || [],
        }))
        if (context?.chatRoomId) {
          refreshRoomAnnouncements(context.chatRoomId)
        }
      } catch (error) {
        console.error('[chat] 공지 댓글 삭제 실패', error)
        setAnnouncementDetail((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || '댓글을 삭제할 수 없습니다.',
        }))
      }
    },
    [announcementDetail.announcementId, context?.chatRoomId, refreshRoomAnnouncements],
  )

  const handleAnnouncementComposerTogglePinned = useCallback(() => {
    setAnnouncementComposer((prev) => ({ ...prev, pinned: !prev.pinned }))
  }, [])

  const handleAnnouncementImageTrigger = useCallback(() => {
    if (announcementComposer.uploading) return
    const node = announcementImageInputRef.current
    if (node) {
      node.click()
    }
  }, [announcementComposer.uploading])

  const handleAnnouncementImageSelect = useCallback(
    async (event) => {
      if (!context?.chatRoomId) return
      const file = event.target?.files?.[0]
      if (event.target) {
        event.target.value = ''
      }
      if (!file) {
        return
      }
      setAnnouncementComposer((prev) => ({ ...prev, uploading: true, error: null }))
      try {
        const url = await uploadAnnouncementImage({ file, roomId: context.chatRoomId })
        setAnnouncementComposer((prev) => ({ ...prev, imageUrl: url, uploading: false }))
      } catch (error) {
        console.error('[chat] 공지 이미지 업로드 실패', error)
        setAnnouncementComposer((prev) => ({
          ...prev,
          uploading: false,
          error: error?.message || '공지 이미지를 업로드할 수 없습니다.',
        }))
      }
    },
    [context?.chatRoomId],
  )

  const handleAnnouncementImageClear = useCallback(() => {
    if (announcementImageInputRef.current) {
      announcementImageInputRef.current.value = ''
    }
    setAnnouncementComposer((prev) => ({ ...prev, imageUrl: '' }))
  }, [])

  const handleOpenAnnouncementList = useCallback(() => {
    if (!context?.chatRoomId) return
    setAnnouncementListOpen(true)
  }, [context?.chatRoomId])

  const handleCloseAnnouncementList = useCallback(() => {
    setAnnouncementListOpen(false)
  }, [])


  const announcementDetailHtml = useMemo(
    () => formatAnnouncementPreview(announcementDetail.announcement?.content || ''),
    [announcementDetail.announcement?.content],
  )

  const handleSubmitAnnouncement = useCallback(async () => {
    if (!context?.chatRoomId) return
    if (announcementComposer.uploading) {
      setAnnouncementComposer((prev) => ({
        ...prev,
        error: '이미지 업로드가 완료될 때까지 기다려 주세요.',
      }))
      return
    }
    const title = (announcementComposer.title || '').trim()
    const rawContent = announcementComposer.content || ''
    const content = sanitizeAnnouncementHtml(rawContent)
    const plain = getAnnouncementPlainText(content)
    if (!plain) {
      setAnnouncementComposer((prev) => ({ ...prev, error: '공지 내용을 입력해 주세요.' }))
      return
    }
    setAnnouncementComposer((prev) => ({ ...prev, submitting: true, error: null }))
    try {
      await createChatRoomAnnouncement({
        roomId: context.chatRoomId,
        title,
        content,
        imageUrl: announcementComposer.imageUrl || null,
        pinned: announcementComposer.pinned,
      })
      handleCloseAnnouncementComposer()
      await refreshRoomAnnouncements(context.chatRoomId)
    } catch (error) {
      console.error('[chat] 공지 등록 실패', error)
      setAnnouncementComposer((prev) => ({
        ...prev,
        submitting: false,
        error: error?.message || '공지를 등록할 수 없습니다.',
      }))
    }
  }, [
    announcementComposer.content,
    announcementComposer.imageUrl,
    announcementComposer.pinned,
    announcementComposer.title,
    announcementComposer.uploading,
    context?.chatRoomId,
    handleCloseAnnouncementComposer,
    refreshRoomAnnouncements,
  ])

  const handleOpenAnnouncementDetail = useCallback(
    async (announcement) => {
      if (!announcement?.id) return
      setAnnouncementDetail({
        open: true,
        loading: true,
        announcementId: announcement.id,
        announcement,
        comments: [],
        commentInput: '',
        error: null,
      })
      try {
        const detail = await fetchChatRoomAnnouncementDetail({ announcementId: announcement.id })
        setAnnouncementDetail((prev) => ({
          ...prev,
          loading: false,
          announcement: detail.announcement || prev.announcement,
          comments: detail.comments || [],
          error: null,
        }))
      } catch (error) {
        console.error('[chat] 공지 상세 불러오기 실패', error)
        setAnnouncementDetail((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || '공지 상세를 불러올 수 없습니다.',
        }))
      }
    },
    [],
  )

  const handleCloseAnnouncementDetail = useCallback(() => {
    setAnnouncementDetail({
      open: false,
      loading: false,
      announcementId: null,
      announcement: null,
      comments: [],
      commentInput: '',
      error: null,
    })
  }, [])

  const handleToggleAnnouncementReaction = useCallback(async () => {
    if (!announcementDetail.announcementId) return
    try {
      await toggleChatRoomAnnouncementReaction({ announcementId: announcementDetail.announcementId })
      if (announcementDetail.announcementId) {
        const detail = await fetchChatRoomAnnouncementDetail({ announcementId: announcementDetail.announcementId })
        setAnnouncementDetail((prev) => ({
          ...prev,
          announcement: detail.announcement || prev.announcement,
          comments: detail.comments || prev.comments,
        }))
      }
      if (context?.chatRoomId) {
        refreshRoomAnnouncements(context.chatRoomId)
      }
    } catch (error) {
      console.error('[chat] 공지 반응 토글 실패', error)
      setAnnouncementDetail((prev) => ({
        ...prev,
        error: error?.message || '하트를 추가/제거할 수 없습니다.',
      }))
    }
  }, [announcementDetail.announcementId, context?.chatRoomId, refreshRoomAnnouncements])

  const handleAnnouncementCommentChange = useCallback((value) => {
    setAnnouncementDetail((prev) => ({ ...prev, commentInput: value }))
  }, [])

  const handleSubmitAnnouncementComment = useCallback(async () => {
    if (!announcementDetail.announcementId) return
    const text = (announcementDetail.commentInput || '').trim()
    if (!text) {
      setAnnouncementDetail((prev) => ({ ...prev, error: '댓글을 입력해 주세요.' }))
      return
    }
    setAnnouncementDetail((prev) => ({ ...prev, loading: true, error: null }))
    try {
      await createChatRoomAnnouncementComment({
        announcementId: announcementDetail.announcementId,
        content: text,
      })
      const detail = await fetchChatRoomAnnouncementDetail({ announcementId: announcementDetail.announcementId })
      setAnnouncementDetail((prev) => ({
        ...prev,
        loading: false,
        commentInput: '',
        announcement: detail.announcement || prev.announcement,
        comments: detail.comments || [],
      }))
      if (context?.chatRoomId) {
        refreshRoomAnnouncements(context.chatRoomId)
      }
    } catch (error) {
      console.error('[chat] 공지 댓글 작성 실패', error)
      setAnnouncementDetail((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || '댓글을 저장할 수 없습니다.',
      }))
    }
  }, [announcementDetail.announcementId, announcementDetail.commentInput, context?.chatRoomId, refreshRoomAnnouncements])

  const handleDeleteAnnouncement = useCallback(
    async (announcement) => {
      const identifier = announcement?.id || announcementDetail.announcementId
      if (!identifier) return
      const confirmDelete = window.confirm('이 공지를 삭제하시겠습니까?')
      if (!confirmDelete) return
      try {
        await deleteChatRoomAnnouncement({ announcementId: identifier })
        if (context?.chatRoomId) {
          refreshRoomAnnouncements(context.chatRoomId)
        }
        if (announcementDetail.open && announcementDetail.announcementId === identifier) {
          handleCloseAnnouncementDetail()
        }
      } catch (error) {
        console.error('[chat] 공지 삭제 실패', error)
        setAnnouncementError(error?.message || '공지를 삭제할 수 없습니다.')
      }
    },
    [announcementDetail.announcementId, announcementDetail.open, context?.chatRoomId, handleCloseAnnouncementDetail, refreshRoomAnnouncements],
  )

  const handleToggleDrawer = useCallback(() => {
    if (!context?.chatRoomId) return
    setDrawerOpen((value) => !value)
  }, [context?.chatRoomId])

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false)
  }, [])

  const handleEnterMiniOverlay = useCallback(() => {
    setMiniOverlay((prev) => {
      const width = prev.size?.width || MINI_OVERLAY_WIDTH
      const height = prev.size?.height || MINI_OVERLAY_HEIGHT
      const position = clampMiniOverlayPosition(prev.position, viewport, width, height)
      if (prev.active) {
        const next = { ...prev, position }
        if (prev.mode !== 'reading') {
          next.mode = 'reading'
        }
        if (!prev.size || prev.size.width !== width || prev.size.height !== height) {
          next.size = { width, height }
        }
        return next
      }
      return {
        active: true,
        mode: 'reading',
        position,
        size: prev.size?.width
          ? { width: prev.size.width, height: prev.size.height }
          : { width: MINI_OVERLAY_WIDTH, height: MINI_OVERLAY_HEIGHT },
      }
    })
    setShowComposerPanel(false)
    setFriendOverlayOpen(false)
    setCreateModal((prev) => ({ ...prev, open: false }))
    setSearchModalOpen(false)
    setExpandedMessage(null)
    setShowMediaPicker(false)
    setAnnouncementComposer((prev) => ({ ...prev, open: false }))
    setAnnouncementDetail((prev) => ({ ...prev, open: false, announcementId: null }))
    setProfileSheet({ open: false, participant: null, busy: false, error: null })
    setSettingsOverlayOpen(false)
    setBanModal((prev) => ({ ...prev, open: false, submitting: false }))
    handleCloseDrawer()
    pinchStateRef.current = { initialDistance: null, triggered: true }
  }, [handleCloseDrawer, viewport])

  const handleRestoreToFullOverlay = useCallback(() => {
    setMiniOverlay((prev) => {
      if (!prev.active) return prev
      return { ...prev, active: false, mode: 'reading' }
    })
  }, [])

  const handleCloseMiniOverlay = useCallback(() => {
    setMiniOverlay((prev) => {
      if (!prev.active) return prev
      return { ...prev, active: false, mode: 'reading' }
    })
    if (open && typeof onClose === 'function') {
      onClose()
    }
  }, [onClose, open])

  const handleCollapseMiniOverlay = useCallback(() => {
    setMiniOverlay((prev) => {
      if (!prev.active || prev.mode === 'bar') {
        return prev
      }
      const width = prev.size?.width || MINI_OVERLAY_WIDTH
      const position = clampMiniOverlayPosition(prev.position, viewport, width, MINI_OVERLAY_BAR_HEIGHT)
      return { ...prev, mode: 'bar', position }
    })
  }, [viewport])

  const handleResumeMiniOverlay = useCallback(() => {
    setMiniOverlay((prev) => {
      if (!prev.active) {
        return prev
      }
      const width = prev.size?.width || MINI_OVERLAY_WIDTH
      const height = prev.size?.height || MINI_OVERLAY_HEIGHT
      const position = clampMiniOverlayPosition(prev.position, viewport, width, height)
      if (prev.mode === 'reading' && prev.position && prev.position.x === position.x && prev.position.y === position.y) {
        return prev
      }
      return { ...prev, mode: 'reading', position, size: { width, height } }
    })
  }, [viewport])

  const handleMiniOverlayPointerDown = useCallback(
    (event) => {
      if (typeof event?.preventDefault === 'function') {
        event.preventDefault()
      }
      if (!miniOverlay.active) return
      const width = miniOverlay.size?.width || MINI_OVERLAY_WIDTH
      const height =
        miniOverlay.mode === 'bar'
          ? MINI_OVERLAY_BAR_HEIGHT
          : miniOverlay.size?.height || MINI_OVERLAY_HEIGHT
      const basePosition = clampMiniOverlayPosition(miniOverlay.position, viewport, width, height)
      setMiniOverlay((prev) => {
        if (!prev.active) return prev
        if (
          !prev.position ||
          prev.position.x !== basePosition.x ||
          prev.position.y !== basePosition.y ||
          (prev.mode === 'bar' && miniOverlay.mode !== 'bar')
        ) {
          return { ...prev, position: basePosition }
        }
        return prev
      })
      miniOverlayDragRef.current = {
        pointerId: event.pointerId,
        originX: basePosition.x,
        originY: basePosition.y,
        startX: event.clientX,
        startY: event.clientY,
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch (error) {
        // ignore capture errors
      }
    },
    [miniOverlay.active, miniOverlay.mode, miniOverlay.position, miniOverlay.size, viewport],
  )

  const handleMiniOverlayPointerMove = useCallback(
    (event) => {
      const drag = miniOverlayDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }
      const nextX = drag.originX + (event.clientX - drag.startX)
      const nextY = drag.originY + (event.clientY - drag.startY)
      setMiniOverlay((prev) => {
        if (!prev.active) return prev
        const width = prev.size?.width || MINI_OVERLAY_WIDTH
        const height = prev.mode === 'bar' ? MINI_OVERLAY_BAR_HEIGHT : prev.size?.height || MINI_OVERLAY_HEIGHT
        const position = clampMiniOverlayPosition({ x: nextX, y: nextY }, viewport, width, height)
        if (!prev.position || prev.position.x !== position.x || prev.position.y !== position.y) {
          return { ...prev, position }
        }
        return prev
      })
    },
    [viewport],
  )

  const handleMiniOverlayPointerEnd = useCallback((event) => {
    const drag = miniOverlayDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch (error) {
      // ignore release errors
    }
    miniOverlayDragRef.current = { pointerId: null, originX: 0, originY: 0, startX: 0, startY: 0 }
  }, [])

  const handleMiniOverlayResizeStart = useCallback(
    (event) => {
      if (!miniOverlay.active || miniOverlay.mode !== 'reading') {
        return
      }
      miniOverlayResizeRef.current = {
        pointerId: event.pointerId,
        originHeight: miniOverlay.size?.height || MINI_OVERLAY_HEIGHT,
        startY: event.clientY,
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch (error) {
        // ignore capture errors
      }
    },
    [miniOverlay.active, miniOverlay.mode, miniOverlay.size?.height],
  )

  const handleMiniOverlayResizeMove = useCallback(
    (event) => {
      const state = miniOverlayResizeRef.current
      if (!state || state.pointerId !== event.pointerId) {
        return
      }
      const delta = event.clientY - state.startY
      setMiniOverlay((prev) => {
        if (!prev.active || prev.mode !== 'reading') {
          return prev
        }
        const width = prev.size?.width || MINI_OVERLAY_WIDTH
        const proposed = state.originHeight + delta
        const nextHeight = Math.max(
          MINI_OVERLAY_MIN_HEIGHT,
          Math.min(MINI_OVERLAY_MAX_HEIGHT, proposed),
        )
        const position = clampMiniOverlayPosition(prev.position, viewport, width, nextHeight)
        if (
          prev.size?.height === nextHeight &&
          prev.position &&
          prev.position.x === position.x &&
          prev.position.y === position.y
        ) {
          return prev
        }
        return {
          ...prev,
          size: { width, height: nextHeight },
          position,
        }
      })
    },
    [viewport],
  )

  const handleMiniOverlayResizeEnd = useCallback((event) => {
    const state = miniOverlayResizeRef.current
    if (!state || state.pointerId !== event.pointerId) {
      return
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch (error) {
      // ignore release errors
    }
    miniOverlayResizeRef.current = { pointerId: null, originHeight: MINI_OVERLAY_HEIGHT, startY: 0 }
  }, [])

  useEffect(() => {
    if (!miniOverlay.active || !miniOverlay.position) {
      return
    }
    const width = miniOverlay.size?.width || MINI_OVERLAY_WIDTH
    const height =
      miniOverlay.mode === 'bar'
        ? MINI_OVERLAY_BAR_HEIGHT
        : miniOverlay.size?.height || MINI_OVERLAY_HEIGHT
    const position = clampMiniOverlayPosition(miniOverlay.position, viewport, width, height)
    if (position.x === miniOverlay.position.x && position.y === miniOverlay.position.y) {
      return
    }
    setMiniOverlay((prev) => ({
      ...prev,
      position,
    }))
  }, [miniOverlay.active, miniOverlay.mode, miniOverlay.position, miniOverlay.size, viewport])

  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof window === 'undefined') {
      return undefined
    }
    if (!open || miniOverlay.active) {
      return undefined
    }

    const handleTouchStart = (event) => {
      if (event.touches.length === 2) {
        const [first, second] = event.touches
        const distance = distanceBetweenTouches(first, second)
        pinchStateRef.current = { initialDistance: distance, triggered: false }
      } else {
        pinchStateRef.current = { initialDistance: null, triggered: false }
      }
    }

    const handleTouchMove = (event) => {
      const state = pinchStateRef.current
      if (state.triggered) {
        return
      }
      if (event.touches.length !== 2) {
        return
      }
      const [first, second] = event.touches
      const distance = distanceBetweenTouches(first, second)
      if (!state.initialDistance) {
        pinchStateRef.current = { initialDistance: distance, triggered: false }
        return
      }
      const delta = state.initialDistance - distance
      if (delta > PINCH_MIN_DELTA && distance / state.initialDistance <= PINCH_TRIGGER_RATIO) {
        pinchStateRef.current = { initialDistance: null, triggered: true }
        if (event.cancelable) {
          event.preventDefault()
        }
        handleEnterMiniOverlay()
      }
    }

    const handleTouchEnd = () => {
      pinchStateRef.current = { initialDistance: null, triggered: false }
    }

    node.addEventListener('touchstart', handleTouchStart, { passive: true })
    node.addEventListener('touchmove', handleTouchMove, { passive: false })
    node.addEventListener('touchend', handleTouchEnd)
    node.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
      node.removeEventListener('touchend', handleTouchEnd)
      node.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [handleEnterMiniOverlay, miniOverlay.active, open])

  const handleLoadMoreMedia = useCallback(() => {
    setDrawerMediaLimit((value) => value + 20)
  }, [])

  const handleLoadMoreFiles = useCallback(() => {
    setDrawerFileLimit((value) => value + 20)
  }, [])

  const handleBanDurationChange = useCallback((value) => {
    setBanModal((prev) => ({ ...prev, duration: value }))
  }, [])

  const handleBanReasonChange = useCallback((value) => {
    setBanModal((prev) => ({ ...prev, reason: value }))
  }, [])

  const handleCloseBanModal = useCallback(() => {
    setBanModal({ open: false, participant: null, duration: '60', reason: '', submitting: false, error: null })
  }, [])

  const handleConfirmBan = useCallback(async () => {
    if (!context?.chatRoomId || !banModal.participant) {
      return
    }

    const ownerId =
      banModal.participant.ownerToken ||
      banModal.participant.owner_id ||
      banModal.participant.ownerId ||
      banModal.participant.user_id ||
      banModal.participant.userId

    if (!ownerId) {
      setBanModal((prev) => ({ ...prev, error: '참여자 정보를 확인할 수 없습니다.' }))
      return
    }

    if (!isValidUuid(context.chatRoomId)) {
      setBanModal((prev) => ({ ...prev, error: '채팅방 정보를 확인할 수 없습니다.' }))
      return
    }

    if (!isValidUuid(ownerId)) {
      setBanModal((prev) => ({ ...prev, error: '참여자 식별자가 올바르지 않습니다.' }))
      return
    }

    const parsedDuration = parseInt(banModal.duration, 10)
    const durationMinutes = Number.isFinite(parsedDuration) ? Math.max(parsedDuration, 0) : null

    setBanModal((prev) => ({ ...prev, submitting: true, error: null }))
    try {
      await manageChatRoomRole({
        roomId: String(context.chatRoomId).trim(),
        targetOwnerId: String(ownerId).trim(),
        action: 'ban',
        durationMinutes: durationMinutes && durationMinutes > 0 ? durationMinutes : null,
        reason: banModal.reason,
      })
      await refreshRoomBans(context.chatRoomId)
      await refreshRooms()
      handleCloseBanModal()
      setProfileSheet((prev) => ({ ...prev, open: false, participant: null, busy: false, error: null }))
    } catch (error) {
      console.error('[chat] 참여자 추방 실패', error)
      setBanModal((prev) => ({
        ...prev,
        submitting: false,
        error: error?.message || '추방을 진행할 수 없습니다.',
      }))
    }
  }, [banModal.duration, banModal.participant, banModal.reason, context?.chatRoomId, handleCloseBanModal, manageChatRoomRole, refreshRoomBans, refreshRooms])

  const handleUnbanEntry = useCallback(
    async (ban) => {
      if (!ban || !context?.chatRoomId) return
      const ownerId = ban.owner_id || ban.ownerId
      if (!ownerId) return
      if (!isValidUuid(context.chatRoomId) || !isValidUuid(ownerId)) {
        setSettingsError('추방 정보를 확인할 수 없습니다.')
        return
      }
      try {
        await manageChatRoomRole({
          roomId: String(context.chatRoomId).trim(),
          targetOwnerId: String(ownerId).trim(),
          action: 'unban',
        })
        await refreshRoomBans(context.chatRoomId)
        await refreshRooms()
      } catch (error) {
        console.error('[chat] 추방 해제 실패', error)
        setSettingsError(error?.message || '추방을 해제할 수 없습니다.')
      }
    },
    [context?.chatRoomId, manageChatRoomRole, refreshRoomBans, refreshRooms],
  )

  const handleAdjustBanEntry = useCallback(
    async (ban) => {
      if (!viewerOwnsRoom) {
        setSettingsError('추방 기간을 변경할 권한이 없습니다.')
        return
      }
      if (!ban || !context?.chatRoomId) return
      const ownerId = ban.owner_id || ban.ownerId
      if (!ownerId) return
      if (!isValidUuid(context.chatRoomId) || !isValidUuid(ownerId)) {
        setSettingsError('추방 정보를 확인할 수 없습니다.')
        return
      }

      const promptLabel =
        '새 추방 기간(분)을 입력해 주세요. 0을 입력하면 영구 차단으로 유지됩니다.'
      const input = window.prompt(promptLabel, '')
      if (input === null) {
        return
      }
      const trimmed = input.trim()
      if (!trimmed) {
        return
      }
      const minutes = Number(trimmed)
      if (!Number.isFinite(minutes) || minutes < 0) {
        alert('0 이상의 숫자를 입력해 주세요.')
        return
      }

      try {
        await updateChatRoomBan({
          roomId: String(context.chatRoomId).trim(),
          ownerId: String(ownerId).trim(),
          durationMinutes: minutes,
        })
        await refreshRoomBans(context.chatRoomId)
        setSettingsMessage('추방 기간을 업데이트했습니다.')
      } catch (error) {
        console.error('[chat] 추방 기간 조정 실패', error)
        setSettingsError(error?.message || '추방 기간을 변경할 수 없습니다.')
      }
    },
    [context?.chatRoomId, refreshRoomBans, updateChatRoomBan, viewerOwnsRoom],
  )

  const handleOpenParticipantProfile = useCallback((participant) => {
    if (!participant) return
    setProfileSheet({ open: true, participant, busy: false, error: null })
  }, [])

  const handleCloseParticipantProfile = useCallback(() => {
    setProfileSheet({ open: false, participant: null, busy: false, error: null })
  }, [])

  const handleRequestFriendFromProfile = useCallback(async () => {
    const target = profileSheet.participant
    if (!target?.heroId) {
      alert('이 참여자의 캐릭터 정보를 찾을 수 없습니다.')
      return
    }
    setProfileSheet((prev) => ({ ...prev, busy: true, error: null }))
    try {
      const result = await addFriend({ heroId: target.heroId })
      if (!result?.ok) {
        throw new Error(result?.error || '친구 요청을 보낼 수 없습니다.')
      }
      setProfileSheet((prev) => ({ ...prev, busy: false, error: null }))
    } catch (error) {
      console.error('[chat] 친구 요청 실패', error)
      setProfileSheet((prev) => ({ ...prev, busy: false, error: error?.message || '친구 요청을 보낼 수 없습니다.' }))
    }
  }, [addFriend, profileSheet.participant])

  const handleStartDirectMessage = useCallback(() => {
    alert('1대1 대화는 곧 지원될 예정입니다.')
  }, [])

  const handleBlockParticipant = useCallback(() => {
    alert('차단 기능은 곧 제공될 예정입니다.')
  }, [])

  const handleBanParticipant = useCallback(() => {
    if (!context?.chatRoomId || !profileSheet.participant) {
      return
    }
    if (!viewerIsModerator) {
      setProfileSheet((prev) => ({ ...prev, error: '추방 권한이 없습니다.' }))
      return
    }

    const defaultDuration =
      currentRoom?.default_ban_minutes ?? currentRoom?.defaultBanMinutes ?? 60

    setBanModal({
      open: true,
      participant: profileSheet.participant,
      duration: String(defaultDuration || ''),
      reason: '',
      submitting: false,
      error: null,
    })
    setProfileSheet((prev) => ({ ...prev, busy: false, error: null }))
  }, [context?.chatRoomId, currentRoom?.defaultBanMinutes, currentRoom?.default_ban_minutes, profileSheet.participant, viewerIsModerator])

  const handlePromoteModerator = useCallback(async () => {
    const participant = profileSheet.participant
    if (!participant || !context?.chatRoomId) return
    if (!viewerOwnsRoom) {
      setProfileSheet((prev) => ({ ...prev, error: '방장만 부방장을 임명할 수 있습니다.' }))
      return
    }
    const ownerId =
      participant.ownerToken ||
      participant.owner_id ||
      participant.ownerId ||
      participant.user_id ||
      participant.userId
    if (!ownerId) {
      setProfileSheet((prev) => ({ ...prev, error: '참여자 식별자를 찾을 수 없습니다.' }))
      return
    }

    if (!isValidUuid(context.chatRoomId)) {
      setProfileSheet((prev) => ({ ...prev, error: '채팅방 정보를 확인할 수 없습니다.' }))
      return
    }

    if (!isValidUuid(ownerId)) {
      setProfileSheet((prev) => ({ ...prev, error: '참여자 식별자가 올바르지 않습니다.' }))
      return
    }

    setProfileSheet((prev) => ({ ...prev, busy: true, error: null }))
    try {
      await manageChatRoomRole({
        roomId: String(context.chatRoomId).trim(),
        targetOwnerId: String(ownerId).trim(),
        action: 'promote',
      })
      await refreshRooms()
      setProfileSheet((prev) => ({
        ...prev,
        busy: false,
        error: null,
        participant: prev.participant
          ? { ...prev.participant, role: 'moderator' }
          : prev.participant,
      }))
    } catch (error) {
      console.error('[chat] 부방장 임명 실패', error)
      setProfileSheet((prev) => ({
        ...prev,
        busy: false,
        error: error?.message || '부방장을 임명할 수 없습니다.',
      }))
    }
  }, [context?.chatRoomId, manageChatRoomRole, profileSheet.participant, refreshRooms, viewerOwnsRoom])

  const handleDemoteModerator = useCallback(async () => {
    const participant = profileSheet.participant
    if (!participant || !context?.chatRoomId) return
    if (!viewerOwnsRoom) {
      setProfileSheet((prev) => ({ ...prev, error: '방장만 부방장을 해제할 수 있습니다.' }))
      return
    }
    const ownerId =
      participant.ownerToken ||
      participant.owner_id ||
      participant.ownerId ||
      participant.user_id ||
      participant.userId
    if (!ownerId) {
      setProfileSheet((prev) => ({ ...prev, error: '참여자 식별자를 찾을 수 없습니다.' }))
      return
    }

    if (!isValidUuid(context.chatRoomId)) {
      setProfileSheet((prev) => ({ ...prev, error: '채팅방 정보를 확인할 수 없습니다.' }))
      return
    }

    if (!isValidUuid(ownerId)) {
      setProfileSheet((prev) => ({ ...prev, error: '참여자 식별자가 올바르지 않습니다.' }))
      return
    }

    setProfileSheet((prev) => ({ ...prev, busy: true, error: null }))
    try {
      await manageChatRoomRole({
        roomId: String(context.chatRoomId).trim(),
        targetOwnerId: String(ownerId).trim(),
        action: 'demote',
      })
      await refreshRooms()
      setProfileSheet((prev) => ({
        ...prev,
        busy: false,
        error: null,
        participant: prev.participant
          ? { ...prev.participant, role: 'member' }
          : prev.participant,
      }))
    } catch (error) {
      console.error('[chat] 부방장 해제 실패', error)
      setProfileSheet((prev) => ({
        ...prev,
        busy: false,
        error: error?.message || '부방장 해제에 실패했습니다.',
      }))
    }
  }, [context?.chatRoomId, manageChatRoomRole, profileSheet.participant, refreshRooms, viewerOwnsRoom])

  const handleOpenSettings = useCallback(() => {
    setSettingsOverlayOpen(true)
  }, [])

  const handleCloseSettings = useCallback(() => {
    setSettingsOverlayOpen(false)
  }, [])

  const performRoomSearch = useCallback(
    async (query) => {
      const trimmed = (query || '').trim()
      if (!trimmed) {
        setSearchResults([])
        setSearchPerformed(true)
        setSearchLoading(false)
        setSearchError(null)
        return
      }

      setSearchLoading(true)
      setSearchError(null)
      try {
        const snapshot = await fetchChatRooms({ search: trimmed })
        const normalized = normalizeRoomCollections(snapshot)
        const patched = applyRoomOverrides(normalized)
        const available = Array.isArray(patched.available) ? patched.available : []
        const filtered = available.filter((room) => {
          const id = normalizeId(room?.id)
          if (!id) return false
          return id !== normalizeId(GLOBAL_ROOM.id)
        })
        const dedupedResults = sortRoomsByRecentActivity(dedupeRoomsById(filtered))
        setSearchResults(dedupedResults)
        setRoomSearchMeta((prev) => ({
          trending:
            Array.isArray(normalized.trendingKeywords) && normalized.trendingKeywords.length
              ? normalized.trendingKeywords
              : prev.trending,
          suggestions: Array.isArray(normalized.suggestedKeywords)
            ? normalized.suggestedKeywords
            : prev.suggestions,
        }))
      } catch (error) {
        console.error('[chat] 채팅방 검색 실패', error)
        setSearchError('채팅방을 검색할 수 없습니다. 잠시 후 다시 시도해 주세요.')
        setSearchResults([])
      } finally {
        setSearchLoading(false)
        setSearchPerformed(true)
      }
    },
    [applyRoomOverrides],
  )

  const handleSubmitSearch = useCallback(
    (event) => {
      event.preventDefault()
      performRoomSearch(searchQuery)
    },
    [performRoomSearch, searchQuery],
  )

  const handleSelectSearchKeyword = useCallback(
    (keyword) => {
      if (!keyword) return
      const term = String(keyword).trim()
      if (!term) return
      setSearchQuery(term)
      performRoomSearch(term)
    },
    [performRoomSearch],
  )

  const handleOpenFriends = useCallback(() => {
    setFriendOverlayOpen(true)
    if (typeof refreshSocial === 'function') {
      refreshSocial()
    }
  }, [refreshSocial])

  const handleCloseFriends = useCallback(() => {
    setFriendOverlayOpen(false)
  }, [])

  const handleSendMessage = useCallback(
    async (options = {}) => {
      if (!context) return null
      const textSource = typeof options.text === 'string' ? options.text : messageInput
      const text = (textSource || '').trim()
      const attachmentsSource = Array.isArray(options.attachments)
        ? options.attachments
        : composerAttachments
      const usingComposerAttachments = !Array.isArray(options.attachments)
      const pendingAttachments = attachmentsSource.filter((attachment) => attachment?.status === 'ready')
      const metadataOverride = options.metadata && typeof options.metadata === 'object' ? options.metadata : null
      const shouldResetComposer = options.resetComposer !== false && usingComposerAttachments

      if (!text && pendingAttachments.length === 0) {
        return null
      }

      setSending(true)
      setSendError(null)

      const updateAttachmentStatus = (statusUpdater) => {
        if (!usingComposerAttachments) return
        setComposerAttachments((prev) =>
          prev.map((attachment) => statusUpdater(attachment) || attachment),
        )
      }

      try {
        const rankRoomId =
          context && (context.scope === 'main' || context.scope === 'role')
            ? context.rankRoomId || null
            : null

        const uploadedAttachments = []
        if (pendingAttachments.length) {
          updateAttachmentStatus((attachment) =>
            pendingAttachments.includes(attachment)
              ? { ...attachment, status: 'uploading' }
              : null,
          )

          for (const attachment of pendingAttachments) {
            const uploaded = await uploadAttachmentDraft({
              blob: attachment.blob,
              name: attachment.name,
              encoding: attachment.encoding,
              contentType: attachment.contentType,
            })

            uploadedAttachments.push({
              id: attachment.id,
              type: attachment.type,
              name: attachment.name,
              bucket: uploaded.bucket,
              path: uploaded.path,
              encoding: uploaded.encoding,
              content_type: uploaded.content_type,
              size: uploaded.size,
              original_size: attachment.originalSize,
              preview_url: attachment.previewUrl || null,
              width: attachment.width || null,
              height: attachment.height || null,
              duration: attachment.duration || null,
              layout_hint: attachment.layoutHint || null,
              created_at: new Date().toISOString(),
            })
          }
        }

        const inserted = await insertMessage(
          {
            text,
            scope: context.scope || 'global',
            hero_id: selectedHero || null,
            attachments: uploadedAttachments,
            metadata: metadataOverride || undefined,
          },
          {
            sessionId: context.sessionId || null,
            matchInstanceId: context.matchInstanceId || null,
            chatRoomId: context.chatRoomId || null,
            roomId: rankRoomId,
          },
        )

        if (inserted) {
          setMessages((prev) => upsertMessageList(prev, inserted))
        }

        if (shouldResetComposer) {
          setMessageInput('')
          setComposerAttachments([])
          setAttachmentError(null)
        }

        return inserted || null
      } catch (error) {
        console.error('[chat] 메시지를 보낼 수 없습니다.', error)
        setSendError(error)
        updateAttachmentStatus((attachment) =>
          pendingAttachments.includes(attachment) ? { ...attachment, status: 'error' } : null,
        )
        return null
      } finally {
        setSending(false)
      }
    },
    [composerAttachments, context, messageInput, selectedHero],
  )

  const handleRemoveAttachment = useCallback((id) => {
    setComposerAttachments((prev) =>
      prev.filter((attachment) => attachment.id !== id || attachment.status === 'uploading'),
    )
  }, [])

  const handleCancelAiRequest = useCallback(() => {
    setAiRequest(null)
    setAttachmentError(null)
  }, [setAttachmentError])

  const prepareDraftsFromFiles = useCallback(
    async (files, action, { layoutHint } = {}) => {
      if (!files || !files.length) return
      const drafts = []
      let errorMessage = null

      for (const file of files) {
        if (!file) continue
        if (file.size > ATTACHMENT_SIZE_LIMIT) {
          errorMessage = '50MB 이하의 파일만 업로드할 수 있습니다.'
          continue
        }

        try {
          let draft
          if (action === 'photo') {
            draft = await createImageAttachmentDraft(file)
          } else if (action === 'video') {
            draft = await createVideoAttachmentDraft(file)
          } else {
            draft = await createFileAttachmentDraft(file)
          }
          drafts.push({ ...draft, status: 'ready', layoutHint: layoutHint || null })
        } catch (error) {
          console.error('[chat] 첨부 파일 준비 실패', error)
          errorMessage = error?.message || '첨부 파일을 준비할 수 없습니다.'
        }
      }

      if (drafts.length) {
        setComposerAttachments((prev) => [...prev, ...drafts])
      }
      setAttachmentError(errorMessage)
    },
    [],
  )

  const openFileDialogFallback = useCallback(
    (action) => {
      const input = document.createElement('input')
      input.type = 'file'
      if (action === 'photo') {
        input.accept = 'image/*'
        input.multiple = true
      } else if (action === 'video') {
        input.accept = 'video/*'
        input.multiple = false
      } else {
        input.accept = '*/*'
        input.multiple = true
      }

      input.onchange = async (event) => {
        const files = event.target?.files
        if (!files || !files.length) return
        await prepareDraftsFromFiles(Array.from(files), action, {
          layoutHint: action === 'photo' && files.length > 1 ? 'grid' : null,
        })
        input.value = ''
      }

      input.click()
    },
    [prepareDraftsFromFiles],
  )

  const loadMediaLibrary = useCallback(
    async (action, { append = false, cursor: cursorOverride } = {}) => {
      const targetAction = action || mediaLibrary.action
      if (!targetAction) return

      const nativeAvailable = hasNativeMediaBridge()
      if (!nativeAvailable) {
        const error = new Error(
          '네이티브 갤러리 브릿지가 활성화되어 있지 않습니다. 권한을 허용한 뒤 다시 시도해 주세요.',
        )
        error.code = 'bridge-missing'
        throw error
      }

      const permission = await requestNativeMediaPermission('read')
      if (permission.status === 'denied') {
        const error = new Error('사진/동영상 접근 권한을 허용해 주세요.')
        error.code = 'permission-denied'
        throw error
      }

      const mediaType = targetAction === 'video' ? 'video' : 'image'
      const cursor = append ? cursorOverride ?? mediaLibrary.cursor ?? null : null
      const timeline = await fetchNativeMediaTimeline({
        mediaType,
        cursor,
        limit: MEDIA_LOAD_LIMIT,
      })

      setMediaLibrary((prev) => {
        const baseEntries = append ? prev.entries : []
        const map = new Map()
        baseEntries.forEach((entry) => map.set(entry.id, entry))
        timeline.entries.forEach((entry) => map.set(entry.id, entry))
        const merged = Array.from(map.values())
        return {
          ...prev,
          status: merged.length ? 'ready' : 'empty',
          entries: merged,
          action: targetAction,
          error: merged.length ? null : '표시할 수 있는 항목이 없습니다.',
          errorCode: null,
          multiSelect: append ? prev.multiSelect : false,
          selection: append ? new Map(prev.selection) : new Map(),
          cursor: timeline.cursor || null,
          hasMore: Boolean(timeline.hasMore),
          source: 'native',
          loadingMore: false,
        }
      })
    },
    [mediaLibrary.action, mediaLibrary.cursor],
  )

  const clearMediaPickerTimer = useCallback(() => {
    const ref = mediaPickerLongPressRef.current
    if (ref.timer) {
      clearTimeout(ref.timer)
      ref.timer = null
    }
    ref.active = false
    ref.id = null
  }, [])

  const resolveFilesFromEntries = useCallback(async (entries, action) => {
    const files = []
    const failures = []
    if (!Array.isArray(entries) || !entries.length) {
      return { files, failures }
    }

    for (const entry of entries) {
      if (!entry) continue
      try {
        if (entry.source === 'native') {
          const asset = await fetchNativeMediaAsset({
            id: entry.id,
            mediaType: action === 'video' ? 'video' : 'image',
            quality: action === 'photo' ? 'high' : 'original',
          })
          const extensionGuess =
            asset.mimeType?.split('/')?.[1] ||
            (entry.displayType === 'video'
              ? 'mp4'
              : entry.displayType === 'image'
              ? 'jpg'
              : 'bin')
          const baseName = sanitizeFileName(asset.name || entry.name || entry.id)
          const fileName = baseName && baseName.includes('.')
            ? baseName
            : `${baseName || entry.id}.${extensionGuess}`
          const file = new File([asset.blob], fileName, {
            type: asset.mimeType || 'application/octet-stream',
            lastModified: Date.now(),
          })
          files.push(file)
          continue
        }

        if (entry.file instanceof File) {
          files.push(entry.file)
          continue
        }

        if (entry.handle?.getFile) {
          const file = await entry.handle.getFile()
          if (file) {
            files.push(file)
            continue
          }
        }

        if (entry.blob instanceof Blob) {
          const blobName = sanitizeFileName(entry.name || `${entry.id}.bin`)
          const derived = new File([entry.blob], blobName, {
            type: entry.type || 'application/octet-stream',
            lastModified: Date.now(),
          })
          files.push(derived)
          continue
        }

        throw new Error('선택한 항목을 불러올 수 없습니다.')
      } catch (error) {
        console.error('[chat] 미디어 항목 가져오기 실패', error)
        failures.push(entry.name || entry.id)
      }
    }

    return { files, failures }
  }, [])

  const closeMediaPicker = useCallback(() => {
    setShowMediaPicker(false)
    setMediaLibrary((prev) => ({
      ...prev,
      multiSelect: false,
      selection: new Map(),
      loadingMore: false,
    }))
    clearMediaPickerTimer()
  }, [clearMediaPickerTimer])

  const handleMediaEntryPointerDown = useCallback(
    (entry) => {
      clearMediaPickerTimer()
      if (!entry?.id) return
      const ref = mediaPickerLongPressRef.current
      ref.id = entry.id
      ref.timer = setTimeout(() => {
        ref.active = true
        setMediaLibrary((prev) => {
          const nextSelection = new Map(prev.selection)
          nextSelection.set(entry.id, true)
          return {
            ...prev,
            multiSelect: true,
            selection: nextSelection,
          }
        })
      }, LONG_PRESS_THRESHOLD)
    },
    [clearMediaPickerTimer],
  )

  const handleMediaEntryPointerLeave = useCallback(() => {
    const ref = mediaPickerLongPressRef.current
    if (ref.timer) {
      clearTimeout(ref.timer)
      ref.timer = null
    }
    ref.active = false
    ref.id = null
  }, [])

  const handleMediaEntryPointerUp = useCallback(
    async (entry) => {
      const ref = mediaPickerLongPressRef.current
      const isLongPress = ref.active && ref.id === entry?.id
      if (ref.timer) {
        clearTimeout(ref.timer)
        ref.timer = null
      }
      ref.active = false
      ref.id = null

      if (!entry?.id || isLongPress) {
        return
      }

      if (mediaLibrary.multiSelect) {
        setMediaLibrary((prev) => {
          const nextSelection = new Map(prev.selection)
          if (nextSelection.has(entry.id)) {
            nextSelection.delete(entry.id)
          } else {
            nextSelection.set(entry.id, true)
          }
          return {
            ...prev,
            selection: nextSelection,
          }
        })
        return
      }

      try {
        const { files, failures } = await resolveFilesFromEntries([entry], mediaLibrary.action)
        if (!files.length) {
          if (failures.length) {
            setAttachmentError('선택한 미디어를 불러올 수 없습니다.')
          }
        } else {
          await prepareDraftsFromFiles(files, mediaLibrary.action, { layoutHint: null })
          if (failures.length) {
            setAttachmentError('일부 항목을 불러올 수 없습니다.')
          }
        }
      } catch (error) {
        console.error('[chat] 미디어 첨부 준비 실패', error)
        setAttachmentError(error?.message || '첨부 파일을 준비할 수 없습니다.')
      } finally {
        closeMediaPicker()
      }
    },
    [
      mediaLibrary.multiSelect,
      mediaLibrary.action,
      prepareDraftsFromFiles,
      closeMediaPicker,
      resolveFilesFromEntries,
    ],
  )

  const handleMediaPickerConfirm = useCallback(async () => {
    const selectedIds = Array.from(mediaLibrary.selection.keys())
    if (!selectedIds.length) {
      closeMediaPicker()
      return
    }
    try {
      const selectedEntries = mediaLibrary.entries.filter((entry) => selectedIds.includes(entry.id))
      const { files, failures } = await resolveFilesFromEntries(selectedEntries, mediaLibrary.action)
      const layoutHint =
        mediaLibrary.action === 'photo' && selectedEntries.length > 1 ? 'grid' : null
      if (!files.length) {
        setAttachmentError(
          failures.length
            ? '선택한 미디어를 불러올 수 없습니다.'
            : '첨부할 수 있는 항목을 찾지 못했습니다.',
        )
      } else {
        await prepareDraftsFromFiles(files, mediaLibrary.action, { layoutHint })
        if (failures.length) {
          setAttachmentError('일부 항목을 불러올 수 없습니다.')
        }
      }
    } catch (error) {
      console.error('[chat] 여러 미디어 준비 실패', error)
      setAttachmentError(error?.message || '첨부 파일을 준비할 수 없습니다.')
    } finally {
      closeMediaPicker()
    }
  }, [mediaLibrary, prepareDraftsFromFiles, closeMediaPicker, resolveFilesFromEntries])

  const handleMediaPickerCancel = useCallback(() => {
    closeMediaPicker()
  }, [closeMediaPicker])

  const handleExitMultiSelect = useCallback(() => {
    setMediaLibrary((prev) => ({
      ...prev,
      multiSelect: false,
      selection: new Map(),
    }))
  }, [])

  const handleReloadMediaLibrary = useCallback(() => {
    if (!mediaLibrary.action) return
    setMediaLibrary((prev) => ({
      ...prev,
      status: 'loading',
      error: null,
      errorCode: null,
      loadingMore: false,
    }))
    loadMediaLibrary(mediaLibrary.action).catch((error) => {
      console.error('[chat] 미디어 라이브러리 재시도 실패', error)
      setMediaLibrary((prev) => ({
        ...prev,
        status: 'error',
        error: error?.message || '미디어를 불러올 수 없습니다.',
        errorCode: error?.code || null,
      }))
    })
  }, [mediaLibrary.action, loadMediaLibrary])

  const handleLoadMoreMediaLibrary = useCallback(() => {
    if (!mediaLibrary.action || !mediaLibrary.hasMore || mediaLibrary.loadingMore) {
      return
    }

    setMediaLibrary((prev) => ({
      ...prev,
      loadingMore: true,
      error: null,
      errorCode: null,
    }))

    loadMediaLibrary(mediaLibrary.action, {
      append: true,
      cursor: mediaLibrary.cursor,
    }).catch((error) => {
      console.error('[chat] 미디어 추가 로드 실패', error)
      setMediaLibrary((prev) => ({
        ...prev,
        loadingMore: false,
        status: prev.entries?.length ? prev.status : 'error',
        error: error?.message || '추가 미디어를 불러올 수 없습니다.',
        errorCode: error?.code || null,
      }))
    })
  }, [
    mediaLibrary.action,
    mediaLibrary.hasMore,
    mediaLibrary.loadingMore,
    mediaLibrary.cursor,
    loadMediaLibrary,
  ])

  const handleOpenNativeMediaSettings = useCallback(() => {
    openNativeMediaSettings().catch((error) => {
      console.error('[chat] 미디어 설정을 열 수 없습니다.', error)
      setAttachmentError(error?.message || '설정을 열 수 없습니다.')
    })
  }, [setAttachmentError])

  const handleAttachmentAction = useCallback(
    (action) => {
      if (action === 'ai') {
        if (!context) {
          setAttachmentError('먼저 채팅을 선택해 주세요.')
          return
        }
        setShowComposerPanel(false)
        setAttachmentError(null)
        setAiRequest({
          active: true,
          status: 'idle',
          prompt: messageInput,
          requestId: null,
          error: null,
        })
        return
      }

      if (!context) {
        setAttachmentError('먼저 채팅을 선택해 주세요.')
        return
      }

      setShowComposerPanel(false)

      if (action === 'photo' || action === 'video') {
        if (!hasNativeMediaBridge()) {
          openFileDialogFallback(action)
          return
        }

        setShowMediaPicker(true)
        setMediaLibrary((prev) => ({
          ...prev,
          status: 'loading',
          action,
          error: null,
          errorCode: null,
          multiSelect: false,
          selection: new Map(),
          cursor: null,
          hasMore: false,
          source: 'native',
          loadingMore: false,
        }))

        loadMediaLibrary(action).catch((error) => {
          console.error('[chat] 미디어 라이브러리 로드 실패', error)
          if (error?.name === 'AbortError') {
            setShowMediaPicker(false)
            return
          }
          setMediaLibrary((prev) => ({
            ...prev,
            status: 'error',
            error: error?.message || '미디어를 불러올 수 없습니다.',
            errorCode: error?.code || null,
            loadingMore: false,
          }))
        })

        return
      }

      openFileDialogFallback(action)
    },
    [context, loadMediaLibrary, messageInput, openFileDialogFallback, setAiRequest, setAttachmentError],
  )

  const handleSubmitAiRequest = useCallback(async () => {
    if (!context) return
    const promptText = messageInput.trim()
    if (!promptText) {
      setAttachmentError('AI 응답을 받을 내용을 입력해 주세요.')
      return
    }

    const requestId = createLocalId('ai-request')
    setAiRequest({ active: true, status: 'loading', prompt: promptText, requestId, error: null })

    try {
      await handleSendMessage({
        text: promptText,
        metadata: {
          ai: {
            type: 'prompt',
            status: 'submitted',
            requestId,
            prompt: promptText,
          },
        },
      })
    } catch (error) {
      console.error('[chat] 프롬프트 전송 실패', error)
      setAiRequest({ active: false, status: 'error', prompt: promptText, requestId, error })
      setAttachmentError(error?.message || 'AI 프롬프트를 보낼 수 없습니다.')
      return
    }

    setAiRequest(null)

    const placeholderId = createLocalId('ai-response')
    aiPendingMessageRef.current = placeholderId
    const pendingMessage = {
      local_id: placeholderId,
      created_at: new Date().toISOString(),
      username: AI_ASSISTANT_NAME,
      hero_name: AI_ASSISTANT_NAME,
      metadata: {
        ai: {
          type: 'response',
          status: 'pending',
          requestId,
          prompt: promptText,
        },
      },
      text: '',
    }
    setMessages((prev) => upsertMessageList(prev, pendingMessage))

    const rankRoomId =
      context && (context.scope === 'main' || context.scope === 'role')
        ? context.rankRoomId || null
        : null

    try {
      const session = await supabase.auth.getSession()
      const token = session?.data?.session?.access_token
      if (!token) {
        throw new Error('로그인 세션을 확인할 수 없습니다.')
      }

      const response = await fetch('/api/chat/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: promptText,
          context: {
            scope: context.scope || 'global',
            sessionId: context.sessionId || null,
            matchInstanceId: context.matchInstanceId || null,
            chatRoomId: context.chatRoomId || null,
          },
        }),
      })

      const payload = await response.json()
      if (!response.ok || !payload?.text) {
        throw new Error(payload?.error || 'AI 응답을 받을 수 없습니다.')
      }

      const aiText = String(payload.text || '')
      const inserted = await insertMessage(
        {
          text: aiText,
          scope: context.scope || 'global',
          hero_id: selectedHero || null,
          attachments: [],
          metadata: {
            ai: {
              type: 'response',
              status: 'complete',
              requestId,
              prompt: promptText,
              source: payload.source || 'ai-proxy',
            },
          },
        },
        {
          sessionId: context.sessionId || null,
          matchInstanceId: context.matchInstanceId || null,
          chatRoomId: context.chatRoomId || null,
          roomId: rankRoomId,
        },
      )

      setMessages((prev) => prev.filter((message) => message.local_id !== placeholderId))
      if (inserted) {
        setMessages((prev) => upsertMessageList(prev, inserted))
      }
    } catch (error) {
      console.error('[chat] AI 응답 수신 실패', error)
      setMessages((prev) =>
        prev.map((message) =>
          message.local_id === placeholderId
            ? {
                ...message,
                metadata: {
                  ai: {
                    type: 'response',
                    status: 'error',
                    requestId,
                    prompt: promptText,
                  },
                },
                text: 'AI 응답을 불러올 수 없습니다.',
              }
            : message,
        ),
      )
      setAttachmentError(error?.message || 'AI 응답을 불러올 수 없습니다.')
    } finally {
      if (aiPendingMessageRef.current === placeholderId) {
        aiPendingMessageRef.current = null
      }
    }
  }, [
    context,
    handleSendMessage,
    insertMessage,
    messageInput,
    selectedHero,
    setAttachmentError,
    setAiRequest,
    setMessages,
    supabase,
  ])

  const handleMessageInputChange = useCallback((event) => {
    const value = event.target.value
    setMessageInput(value)
    setAiRequest((prev) => (prev?.active ? { ...prev, prompt: value } : prev))
  }, [])

  const handleComposerSubmit = useCallback(() => {
    if (!context) return
    if (aiRequest?.active) {
      handleSubmitAiRequest()
      return
    }
    handleSendMessage()
  }, [aiRequest?.active, context, handleSendMessage, handleSubmitAiRequest])

  const handleDownloadAttachment = useCallback(async (attachment) => {
    if (!attachment) return
    const key = getAttachmentCacheKey(attachment)
    try {
      let cached = attachmentCacheRef.current.get(key)
      if (!cached) {
        const blob = await fetchAttachmentBlob(attachment)
        const url = URL.createObjectURL(blob)
        cached = { url, blob }
        attachmentCacheRef.current.set(key, cached)
      }

      const blob = cached.blob
      const url = cached.url || (blob ? URL.createObjectURL(blob) : null)
      if (!url) {
        throw new Error('첨부 파일 URL을 준비할 수 없습니다.')
      }

      const link = document.createElement('a')
      link.href = url
      link.download = attachment.name || 'attachment'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('[chat] 첨부 파일 다운로드 실패', error)
      alert('첨부 파일을 다운로드할 수 없습니다.')
    }
  }, [])

  const handleOpenAttachment = useCallback(
    async (message, attachment) => {
      if (!attachment) return
      const key = getAttachmentCacheKey(attachment)
      setViewerAttachment({
        messageId: message?.id || message?.local_id || null,
        attachment,
        status: 'loading',
        url: null,
        error: null,
      })

      try {
        let cached = attachmentCacheRef.current.get(key)
        if (!cached) {
          const blob = await fetchAttachmentBlob(attachment)
          const url = URL.createObjectURL(blob)
          cached = { url, blob }
          attachmentCacheRef.current.set(key, cached)
        }

        setViewerAttachment({
          messageId: message?.id || message?.local_id || null,
          attachment,
          status: 'ready',
          url: cached.url,
          error: null,
        })
      } catch (error) {
        console.error('[chat] 첨부 파일 열기 실패', error)
        setViewerAttachment({
          messageId: message?.id || message?.local_id || null,
          attachment,
          status: 'error',
          url: null,
          error,
        })
      }
    },
    [],
  )

  const handleAttachmentPointerDown = useCallback(
    (attachment) => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
      longPressActiveRef.current = false
      longPressTimerRef.current = setTimeout(async () => {
        longPressActiveRef.current = true
        try {
          await handleDownloadAttachment(attachment)
        } finally {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
          }
        }
      }, 600)
    },
    [handleDownloadAttachment],
  )

  const handleAttachmentPointerUp = useCallback(
    (message, attachment) => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      const triggered = longPressActiveRef.current
      longPressActiveRef.current = false
      if (!triggered) {
        handleOpenAttachment(message, attachment)
      }
    },
    [handleOpenAttachment],
  )

  const handleAttachmentPointerLeave = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressActiveRef.current = false
  }, [])

  const handleCloseViewer = useCallback(() => {
    setViewerAttachment(null)
  }, [])

  const handleDrawerMediaSelect = useCallback(
    (entry) => {
      if (!entry) return
      handleOpenAttachment(entry.message || { id: entry.messageId }, entry)
    },
    [handleOpenAttachment],
  )

  const handleDrawerFileSelect = useCallback(
    (entry) => {
      if (!entry) return
      handleDownloadAttachment(entry)
    },
    [handleDownloadAttachment],
  )

  const handleVideoInteraction = useCallback(() => {
    setVideoControlsVisible(true)
    if (videoControlTimerRef.current) {
      clearTimeout(videoControlTimerRef.current)
    }
    videoControlTimerRef.current = setTimeout(() => {
      setVideoControlsVisible(false)
    }, 3000)
  }, [])

  const renderAttachmentPreview = useCallback(
    (message, attachment, mine = false) => {
      if (!attachment) return null
      const sizeLabel = formatBytes(attachment.original_size || attachment.size || 0)
      const icon = ATTACHMENT_ICONS[attachment.type] || '📎'
      const previewUrl = attachment.preview_url || attachment.previewUrl || null
      const hasPreview = Boolean(previewUrl)
      const gridLayout = attachment.layoutHint === 'grid'
      const containerStyle = gridLayout
        ? overlayStyles.messageAttachmentGrid(mine)
        : overlayStyles.messageAttachment(mine)
      return (
        <div
          key={attachment.id}
          style={containerStyle}
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault()
            handleAttachmentPointerDown(attachment)
          }}
          onPointerUp={(event) => {
            event.preventDefault()
            handleAttachmentPointerUp(message, attachment)
          }}
          onPointerLeave={handleAttachmentPointerLeave}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              handleOpenAttachment(message, attachment)
            }
          }}
          onClick={(event) => event.preventDefault()}
        >
          {gridLayout ? (
            <>
              <div style={overlayStyles.messageAttachmentGridPreviewWrapper}>
                {hasPreview ? (
                  <img
                    src={previewUrl}
                    alt={attachment.name}
                    style={overlayStyles.messageAttachmentGridPreview}
                  />
                ) : (
                  <div style={overlayStyles.mediaPickerPlaceholder}>{icon}</div>
                )}
              </div>
              <span style={overlayStyles.messageAttachmentChip}>{sizeLabel}</span>
              {attachment.type === 'video' && Number.isFinite(attachment.duration) ? (
                <span style={{ ...overlayStyles.attachmentDuration, left: 8, right: 'auto' }}>
                  {formatDuration(attachment.duration)}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <div style={overlayStyles.messageAttachmentPreviewWrapper}>
                {hasPreview ? (
                  <img
                    src={previewUrl}
                    alt={attachment.name}
                    style={overlayStyles.messageAttachmentPreview}
                  />
                ) : (
                  <div
                    style={{
                      ...overlayStyles.attachmentThumb,
                      width: '100%',
                      height: 160,
                      fontSize: 28,
                      borderRadius: 0,
                    }}
                  >
                    {icon}
                  </div>
                )}
                {attachment.type === 'video' && Number.isFinite(attachment.duration) ? (
                  <span style={{ ...overlayStyles.attachmentDuration, right: 12, bottom: 10 }}>
                    {formatDuration(attachment.duration)}
                  </span>
                ) : null}
              </div>
              <div style={overlayStyles.messageAttachmentMeta}>
                <span style={{ fontWeight: 600 }}>{attachment.name}</span>
                <span style={{ fontSize: 11, color: '#cbd5f5' }}>{sizeLabel}</span>
              </div>
            </>
          )}
        </div>
      )
    },
    [
      handleAttachmentPointerDown,
      handleAttachmentPointerLeave,
      handleAttachmentPointerUp,
      handleOpenAttachment,
    ],
  )

  const handleCloseExpandedMessage = useCallback(() => {
    setExpandedMessage(null)
  }, [])

  const renderInfoTab = () => {
    const focusedHeroId = infoHeroFocus || selectedHero || (heroes[0]?.id ?? null)
    const focusedHero = heroes.find((hero) => hero.id === focusedHeroId) || null
    const friendPreview = Array.isArray(friends) ? friends.slice(0, 4) : []

    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={overlayStyles.section}>
          <h3 style={overlayStyles.sectionTitle}>내 캐릭터</h3>
          {heroes.length ? (
            <>
              <div style={overlayStyles.heroGrid}>
                {heroes.map((hero) => {
                  const active = focusedHeroId === hero.id
                  const name = hero.name || '이름 없는 캐릭터'
                  const cover = hero.image_url || hero.avatar_url || null
                  return (
                    <button
                      key={hero.id}
                      type="button"
                      onClick={() => handleSelectHero(hero.id)}
                      style={overlayStyles.heroCard(active)}
                    >
                      {cover ? (
                        <img src={cover} alt={name} style={overlayStyles.heroCardImage} />
                      ) : null}
                      <span style={overlayStyles.heroCardOverlay}>{name}</span>
                    </button>
                  )
                })}
              </div>
              {focusedHero ? (
                <div style={overlayStyles.heroCardDetails}>
                  <span style={{ fontWeight: 700, color: '#f1f5f9' }}>
                    {focusedHero.name || '이름 없는 캐릭터'}
                  </span>
                  {focusedHero.role ? (
                    <span>{`역할: ${focusedHero.role}`}</span>
                  ) : null}
                  {focusedHero.description ? (
                    <span>{focusedHero.description}</span>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <span style={overlayStyles.mutedText}>등록된 캐릭터가 없습니다.</span>
          )}
        </section>
        <section style={overlayStyles.section}>
          <h3 style={overlayStyles.sectionTitle}>친구</h3>
          {friendError ? (
            <span style={{ ...overlayStyles.mutedText, color: '#fca5a5' }}>{friendError}</span>
          ) : friendLoading ? (
            <span style={overlayStyles.mutedText}>친구 정보를 불러오는 중입니다…</span>
          ) : friendPreview.length ? (
            <div style={overlayStyles.friendList}>
              {friendPreview.map((friend) => {
                const name = getFriendDisplayName(friend)
                const avatar =
                  friend?.friendHeroAvatar ||
                  friend?.currentHeroAvatar ||
                  friend?.avatarUrl ||
                  friend?.avatar_url ||
                  null
                return (
                  <div key={friend?.friendOwnerId || friend?.ownerId || name} style={overlayStyles.friendItem}>
                    <div style={overlayStyles.friendAvatar}>
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        name.slice(0, 2)
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <span style={overlayStyles.friendName}>{name}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        {friend?.online ? '온라인' : '오프라인'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <span style={overlayStyles.mutedText}>친구 목록이 비어 있습니다.</span>
          )}
        </section>
        <section style={overlayStyles.section}>
          <h3 style={overlayStyles.sectionTitle}>참여중인 세션</h3>
          <div style={overlayStyles.roomList}>
            {(dashboard?.sessions || []).map((session) => {
              const key = session.session_id || session.id
              const active = activeSessionId && key === activeSessionId
              const latestAt =
                session.latestMessage?.created_at || session.latest_message_at || session.updated_at
              const timeLabel = latestAt ? formatTime(latestAt) : ''
              return (
                <div
                  key={key}
                  style={overlayStyles.roomCard(active)}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectSession(session)}
                >
                  <div style={overlayStyles.roomCardBody}>
                    <div style={overlayStyles.roomCardHeader}>
                      <span style={overlayStyles.roomCardTitle}>{session.game_name || '매치 세션'}</span>
                    </div>
                    <div style={overlayStyles.roomCardStats}>
                      <span>{timeLabel}</span>
                      <span>세션 채팅</span>
                    </div>
                  </div>
                </div>
              )
            })}
            {!(dashboard?.sessions || []).length ? (
              <span style={overlayStyles.mutedText}>참여중인 세션이 없습니다.</span>
            ) : null}
          </div>
        </section>
      </div>
    )
  }

  const renderRoomList = (visibility) => {
    const joined = Array.isArray(rooms.joined) ? rooms.joined : []
    const globalId = normalizeId(GLOBAL_ROOM.id)

    let filtered = joined.filter((room) => {
      const roomId = normalizeId(room?.id)
      const isGlobal = room?.builtin === 'global' || roomId === globalId
      const roomVisibility = (room?.visibility || '').toLowerCase()
      if (visibility === 'open') {
        return isGlobal || roomVisibility === 'public' || roomVisibility === 'open'
      }
      if (visibility === 'private') {
        return !isGlobal && roomVisibility !== 'public' && roomVisibility !== 'open'
      }
      return true
    })

    if (visibility === 'open') {
      const hasGlobal = filtered.some((room) => {
        const roomId = normalizeId(room?.id)
        return room?.builtin === 'global' || roomId === globalId
      })
      if (!hasGlobal) {
        filtered = [{ ...GLOBAL_ROOM }, ...filtered]
      }
    }

    if (!filtered.length) {
      return <span style={overlayStyles.mutedText}>표시할 채팅방이 없습니다.</span>
    }

    const sorted = [...filtered].sort((a, b) => {
      const aId = normalizeId(a?.id)
      const bId = normalizeId(b?.id)
      const aGlobal = a?.builtin === 'global' || aId === globalId
      const bGlobal = b?.builtin === 'global' || bId === globalId
      if (aGlobal !== bGlobal) {
        return aGlobal ? -1 : 1
      }
      const aTime = toChrono(a?.last_message_at || a?.updated_at || a?.created_at)
      const bTime = toChrono(b?.last_message_at || b?.updated_at || b?.created_at)
      return bTime - aTime
    })

    return (
      <div style={overlayStyles.roomListScroll}>
        {sorted.map((room) => {
          const roomId = normalizeId(room.id)
          const isGlobal = room.builtin === 'global' || roomId === globalId
          const active = isGlobal ? viewingGlobal : activeRoomId === room.id
          const cover = room.cover_url || room.coverUrl || null
          const latestAt = room.last_message_at || room.updated_at || room.created_at || null
          const timeLabel = formatRelativeLastActivity(latestAt)
          const memberCount = Number(room.member_count) || 0
          const joinedStatus = joinedRoomIds.has(roomId)
          const latestMessage = room.latestMessage || room.latest_message || null
          const previewAuthor = latestMessage?.hero_name || latestMessage?.username || ''
          const previewTextRaw = latestMessage ? extractMessageText(latestMessage) : ''
          const previewText = previewTextRaw.trim()
            ? previewTextRaw.trim()
            : latestMessage && getMessageAttachments(latestMessage).length
              ? '첨부 파일이 포함되었습니다.'
              : ''
          const previewLabel = previewAuthor
            ? `${previewAuthor}${previewText ? ': ' : ''}${previewText}`
            : previewText
          const previewDisplay = previewLabel.length > 80 ? `${previewLabel.slice(0, 80)}…` : previewLabel
          const unreadCount = resolveRoomUnread(room)
          const showUnreadBadge = unreadCount > 0

          return (
            <div
              key={room.id || roomId}
              style={overlayStyles.roomCard(active)}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectRoom(room, visibility)}
            >
              <div style={overlayStyles.roomCardBackdrop(cover)} />
              <div style={overlayStyles.roomCardScrim} />
              <div style={overlayStyles.roomCardBody}>
                <div style={overlayStyles.roomCardHeader}>
                  <span style={overlayStyles.roomCardTitle}>{room.name || '채팅방'}</span>
                  {showUnreadBadge ? (
                    <span style={overlayStyles.roomCardUnreadBadge}>{unreadCount}</span>
                  ) : null}
                </div>
                <div
                  style={overlayStyles.roomCardPreview}
                  title={previewLabel || '최근 메시지가 없습니다.'}
                >
                  {previewLabel ? (
                    <>
                      {previewAuthor ? (
                        <span style={overlayStyles.roomCardPreviewAuthor}>{previewAuthor}</span>
                      ) : null}
                      <span style={overlayStyles.roomCardPreviewText}>
                        {previewAuthor && previewText ? previewText : previewDisplay || '내용 없음'}
                      </span>
                    </>
                  ) : (
                    <span style={overlayStyles.roomCardPreviewPlaceholder}>최근 메시지가 없습니다.</span>
                  )}
                </div>
                <div style={overlayStyles.roomCardStats}>
                  <span>{timeLabel || '최근 채팅 없음'}</span>
                  <div style={overlayStyles.roomCardStatsRight}>
                    {memberCount ? <span>{memberCount}명</span> : null}
                    {joinedStatus ? <span>참여중</span> : null}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const frameStyle = useMemo(() => {
    const safeTop = Math.max(0, Number.isFinite(viewport.safeAreaTop) ? viewport.safeAreaTop : 0)
    const safeBottom = Math.max(0, Number.isFinite(viewport.safeAreaBottom) ? viewport.safeAreaBottom : 0)
    const numericHeight =
      typeof viewport.height === 'number' && Number.isFinite(viewport.height) ? viewport.height : null
    const viewportHeightValue = numericHeight ? Math.max(240, Math.round(numericHeight)) : null

    if (!isCompactLayout) {
      const style = {
        ...overlayStyles.frame,
        padding: `${28 + Math.round(safeTop)}px 28px calc(48px + var(--chat-overlay-safe-bottom, env(safe-area-inset-bottom, 16px)))`,
        '--chat-overlay-safe-bottom': `${Math.round(safeBottom)}px`,
      }
      if (viewportHeightValue) {
        style['--chat-overlay-viewport-height'] = `${viewportHeightValue}px`
      }
      return style
    }

    const compactTop = (isUltraCompactLayout ? 24 : 26) + Math.round(safeTop)
    const compactPadding = `${compactTop}px 14px calc(${isUltraCompactLayout ? 32 : 34}px + var(--chat-overlay-safe-bottom, env(safe-area-inset-bottom, 16px)))`
    const fallbackHeight = viewportHeightValue ? `${viewportHeightValue}px` : '100dvh'

    const style = {
      ...overlayStyles.frame,
      borderRadius: isUltraCompactLayout ? 0 : 22,
      padding: compactPadding,
      minHeight: fallbackHeight,
      height: fallbackHeight,
      maxHeight: fallbackHeight,
      width: '100%',
      maxWidth: '100%',
      alignItems: 'stretch',
      '--chat-overlay-safe-bottom': `${Math.round(safeBottom)}px`,
    }

    if (viewportHeightValue) {
      style['--chat-overlay-viewport-height'] = `${viewportHeightValue}px`
    }

    return style
  }, [isCompactLayout, isUltraCompactLayout, viewport.height, viewport.safeAreaBottom, viewport.safeAreaTop])

  const overlayContainerStyle = useMemo(() => {
    const offsetTop = Math.max(0, Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0)
    const safeTop = Math.max(0, Number.isFinite(viewport.safeAreaTop) ? viewport.safeAreaTop : 0)
    const safeBottom = Math.max(0, Number.isFinite(viewport.safeAreaBottom) ? viewport.safeAreaBottom : 0)
    const numericHeight =
      typeof viewport.height === 'number' && Number.isFinite(viewport.height) ? viewport.height : null

    const marginTopValue = Math.round(Math.max(offsetTop, safeTop))
    const marginBottomValue = Math.round(safeBottom)
    const extraBottomSpacing = isCompactLayout ? 24 : 36

    const style = {
      alignSelf: 'flex-start',
      width: '100%',
      transition: 'margin 0.2s ease',
    }

    if (marginTopValue > 0) {
      style.marginTop = `${marginTopValue}px`
    }

    if (marginBottomValue > 0) {
      style.marginBottom = `${marginBottomValue}px`
    }

    style.paddingBottom = `${marginBottomValue + extraBottomSpacing}px`

    if (numericHeight) {
      style.minHeight = `${Math.max(260, Math.round(numericHeight + marginTopValue + marginBottomValue))}px`
    }

    return style
  }, [
    isCompactLayout,
    viewport.offsetTop,
    viewport.safeAreaTop,
    viewport.safeAreaBottom,
    viewport.height,
  ])

  const overlayViewportHeight = useMemo(() => {
    const numericHeight =
      typeof viewport.height === 'number' && Number.isFinite(viewport.height) ? viewport.height : null
    if (!numericHeight) {
      return null
    }
    return `${Math.max(260, Math.round(numericHeight))}px`
  }, [viewport.height])

  const sidePanelStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.sidePanel
    }
    return {
      ...overlayStyles.sidePanel,
      borderRadius: isUltraCompactLayout ? 14 : 20,
      minHeight: 0,
    }
  }, [isCompactLayout, isUltraCompactLayout])

  const sideActionsStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.sideActions
    }
    return {
      ...overlayStyles.sideActions,
      padding: '10px 12px 6px',
    }
  }, [isCompactLayout])

  const sideContentStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.sideContent
    }
    return {
      ...overlayStyles.sideContent,
      padding: '0 12px 16px',
    }
  }, [isCompactLayout])

  const tabBarStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.tabBar
    }
    return {
      ...overlayStyles.tabBar,
      padding: '10px 12px 12px',
      gap: 8,
    }
  }, [isCompactLayout])

  const conversationStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.conversation
    }
    return {
      ...overlayStyles.conversation,
      borderRadius: isUltraCompactLayout ? 0 : 20,
    }
  }, [isCompactLayout, isUltraCompactLayout])

  const conversationHeaderStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.conversationHeader
    }
    return {
      ...overlayStyles.conversationHeader,
      padding: '12px 16px',
    }
  }, [isCompactLayout])

  const messageViewportStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.messageViewport
    }
    return {
      ...overlayStyles.messageViewport,
      padding: '16px 4px 18px',
    }
  }, [isCompactLayout])

  const composerContainerStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.composerContainer
    }
    return {
      ...overlayStyles.composerContainer,
      borderTop: '1px solid rgba(71, 85, 105, 0.45)',
    }
  }, [isCompactLayout])

  const composerStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.composer
    }
    return {
      ...overlayStyles.composer,
      padding: '9px 12px 10px',
      gap: 8,
    }
  }, [isCompactLayout])

  const attachmentStripStyle = useMemo(() => {
    if (!isCompactLayout) {
      return overlayStyles.attachmentStrip
    }
    return {
      ...overlayStyles.attachmentStrip,
      padding: '8px 12px 0',
    }
  }, [isCompactLayout])

  const renderListColumn = () => {
    const visibility = activeTab === 'open' ? 'open' : activeTab === 'private' ? 'private' : null

    let content
    if (activeTab === 'info') {
      content = loadingDashboard ? (
        <span style={overlayStyles.mutedText}>정보를 불러오는 중...</span>
      ) : dashboardError ? (
        <span style={{ ...overlayStyles.mutedText, color: '#fca5a5' }}>
          대시보드를 불러오지 못했습니다.
        </span>
      ) : (
        renderInfoTab()
      )
    } else {
      content = (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={overlayStyles.listHeader}>
            <strong style={overlayStyles.sectionTitle}>
              {visibility === 'open' ? '공개 채팅' : '비공개 채팅'}
            </strong>
          </div>
          {visibility === 'open' ? (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              검색과 방 만들기는 상단 아이콘을 이용해 주세요.
            </span>
          ) : null}
          {roomError ? (
            <span style={{ ...overlayStyles.mutedText, color: '#fca5a5' }}>
              채팅방을 불러올 수 없습니다.
            </span>
          ) : loadingRooms ? (
            <span style={overlayStyles.mutedText}>채팅방을 불러오는 중...</span>
          ) : (
            renderRoomList(visibility)
          )}
        </div>
      )
    }

    const actions = []
    if (activeTab === 'info') {
      actions.push({ key: 'friends', icon: '👥', label: '친구 관리', onClick: handleOpenFriends })
    }
    if (activeTab === 'private') {
      actions.push({
        key: 'create-private',
        icon: '＋',
        label: '방 만들기',
        onClick: () => handleOpenCreateRoom('private'),
      })
    }
    if (activeTab === 'open') {
      actions.push({
        key: 'search',
        icon: '🔍',
        label: '방 검색',
        onClick: handleOpenSearchOverlay,
        active: searchModalOpen,
      })
      actions.push({
        key: 'create-open',
        icon: '＋',
        label: '방 만들기',
        onClick: () => handleOpenCreateRoom('public'),
      })
    }

    return (
      <aside style={sidePanelStyle}>
        <div style={sideActionsStyle}>
          <div style={overlayStyles.sideActionsLeft}>
            <button
              type="button"
              onClick={onClose}
              style={overlayStyles.lobbyCloseButton}
              aria-label="채팅 닫기"
            >
              × 닫기
            </button>
          </div>
          <div style={overlayStyles.sideActionsRight}>
            {actions.length ? (
              actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  title={action.label}
                  style={overlayStyles.actionIconButton(action.active)}
                  onClick={action.onClick}
                >
                  {action.icon}
                </button>
              ))
            ) : null}
          </div>
        </div>
        <div style={sideContentStyle}>{content}</div>
        <div style={tabBarStyle}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              style={overlayStyles.tabButton(activeTab === tab.key)}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </aside>
    )
  }

  const renderMessageColumn = () => {
    const label = hasContext ? context.label || '채팅' : '채팅'
    const subtitle = hasContext
      ? context.type === 'session'
        ? '세션 채팅'
        : context.type === 'global'
          ? '전체 채널'
          : context.visibility === 'open'
            ? '공개 채팅방'
            : '비공개 채팅방'
      : '좌측에서 채팅방을 선택해 주세요.'
    const showDrawer = context?.type === 'chat-room' && Boolean(context.chatRoomId || currentRoom)
    const isRoomContext = context?.type === 'chat-room'
    const mediaItems = showDrawer ? roomAssets.media.slice(0, drawerMediaLimit) : []
    const fileItems = showDrawer ? roomAssets.files.slice(0, drawerFileLimit) : []
    const hasMoreMedia = showDrawer && roomAssets.media.length > mediaItems.length
    const hasMoreFiles = showDrawer && roomAssets.files.length > fileItems.length
    const drawerParticipants = showDrawer ? participantList : []
    const coverImage = showDrawer ? currentRoom?.cover_url || currentRoom?.coverUrl || null : null
    const viewerIsOwner = Boolean(isRoomContext && viewerOwnsRoom)
    const showAnnouncements = isRoomContext
    const announcementList = showAnnouncements ? nonPinnedAnnouncements : []
    const themeBubbleColor = roomTheme.bubbleColor
    const themeTextColor = roomTheme.textColor
    const themeBackgroundValue = roomTheme.backgroundValue
    return (
      <section ref={conversationRef} style={conversationStyle}>
        <div style={overlayStyles.conversationBackground(themeBackgroundValue)} />
        <header style={conversationHeaderStyle}>
          <div style={overlayStyles.headerLeft}>
            {hasContext ? (
              <button
                type="button"
                onClick={() => setContext(null)}
                style={overlayStyles.headerButton('ghost')}
              >
                ← 목록
              </button>
            ) : null}
            <div style={overlayStyles.headerMeta}>
              <span style={overlayStyles.headerTitle}>{label}</span>
              <span style={overlayStyles.headerSubtitle}>{subtitle}</span>
            </div>
          </div>
          <div style={overlayStyles.headerButtons}>
            {showDrawer ? (
              <button
                type="button"
                onClick={handleToggleDrawer}
                style={overlayStyles.headerIconButton(drawerOpen)}
                aria-label="채팅방 패널 열기"
              >
                ☰
              </button>
            ) : null}
          </div>
        </header>
        <div ref={messageListRef} style={messageViewportStyle}>
          {showAnnouncements ? (
            <div style={overlayStyles.pinnedAnnouncementContainer}>
              <div style={overlayStyles.pinnedAnnouncementBackdrop} aria-hidden />
              <div style={overlayStyles.pinnedAnnouncementContent}>
                {announcementError ? (
                  <span style={{ fontSize: 11, color: '#fca5a5' }}>{announcementError}</span>
                ) : null}
                {pinnedAnnouncement ? (
                <div style={overlayStyles.pinnedAnnouncementCard(Boolean(pinnedAnnouncement.image_url || pinnedAnnouncement.imageUrl))}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={overlayStyles.pinnedAnnouncementHeaderRow}>
                      <span style={overlayStyles.pinnedAnnouncementBadge}>📌 공지</span>
                      <span style={overlayStyles.pinnedAnnouncementTimestamp}>
                        {pinnedAnnouncement.updated_at
                          ? `${formatTime(pinnedAnnouncement.updated_at)} 업데이트`
                          : pinnedAnnouncement.created_at
                            ? `${formatTime(pinnedAnnouncement.created_at)} 등록`
                            : '방장이 고정했습니다.'}
                      </span>
                    </div>
                    <div style={overlayStyles.pinnedAnnouncementText}>
                      {pinnedAnnouncement.title ? (
                        <strong style={overlayStyles.pinnedAnnouncementTitle}>
                          {pinnedAnnouncement.title}
                        </strong>
                      ) : null}
                      <span style={overlayStyles.pinnedAnnouncementPreview}>
                        {
                          truncateText(
                            pinnedAnnouncement.content || '',
                            ANNOUNCEMENT_PREVIEW_LENGTH,
                          ).text || '내용 없음'
                        }
                      </span>
                    </div>
                    <div style={overlayStyles.pinnedAnnouncementActions}>
                      <button
                        type="button"
                        style={overlayStyles.pinnedAnnouncementActionButton('primary')}
                        onClick={() => handleOpenAnnouncementDetail(pinnedAnnouncement)}
                      >
                        상세 보기
                      </button>
                      {(announcementList.length || roomAnnouncementsHasMore) ? (
                        <button
                          type="button"
                          style={overlayStyles.pinnedAnnouncementActionButton()}
                          onClick={handleOpenAnnouncementList}
                        >
                          공지 목록
                        </button>
                      ) : null}
                      {viewerIsModerator ? (
                        <button
                          type="button"
                          style={overlayStyles.pinnedAnnouncementActionButton()}
                          onClick={handleOpenAnnouncementComposer}
                        >
                          새 공지
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {pinnedAnnouncement.image_url || pinnedAnnouncement.imageUrl ? (
                    <button
                      type="button"
                      style={overlayStyles.pinnedAnnouncementImageButton}
                      onClick={() => handleOpenAnnouncementDetail(pinnedAnnouncement)}
                    >
                      <div style={overlayStyles.pinnedAnnouncementImageWrapper}>
                        <img
                          src={pinnedAnnouncement.image_url || pinnedAnnouncement.imageUrl}
                          alt={pinnedAnnouncement.title ? `${pinnedAnnouncement.title} 이미지` : '공지 이미지'}
                          style={overlayStyles.pinnedAnnouncementImage}
                        />
                      </div>
                    </button>
                  ) : null}
                </div>
              ) : (
                <div style={overlayStyles.pinnedAnnouncementEmpty}>
                  <span>{viewerIsModerator ? '고정된 공지가 없습니다.' : '현재 고정된 공지가 없습니다.'}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(announcementList.length || roomAnnouncementsHasMore) ? (
                      <button
                        type="button"
                        style={overlayStyles.pinnedAnnouncementActionButton()}
                        onClick={handleOpenAnnouncementList}
                      >
                        공지 목록
                      </button>
                    ) : null}
                    {viewerIsModerator ? (
                      <button
                        type="button"
                        style={overlayStyles.pinnedAnnouncementActionButton('primary')}
                        onClick={handleOpenAnnouncementComposer}
                      >
                        공지 작성
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
          {hasContext ? (
            loadingMessages ? (
              <span style={overlayStyles.mutedText}>메시지를 불러오는 중...</span>
            ) : timelineEntries.length ? (
              timelineEntries.map((entry) => {
                if (entry.type === 'date') {
                  return (
                    <div key={entry.key} style={overlayStyles.dateDividerWrapper}>
                      <span style={overlayStyles.dateDivider}>{entry.label}</span>
                    </div>
                  )
                }

                const { mine, displayName, avatarUrl, initials, messages: groupMessages, participant } = entry
                const participantClickable = Boolean(participant)
                const openParticipantProfile = participantClickable
                  ? () => handleOpenParticipantProfile(participant)
                  : undefined
                const avatarNode = !mine ? (
                  <div
                    style={{
                      ...overlayStyles.messageAvatarButton,
                      cursor: participantClickable ? 'pointer' : 'default',
                      border: participantClickable
                        ? '1px solid rgba(59, 130, 246, 0.35)'
                        : '1px solid rgba(59, 130, 246, 0)',
                    }}
                    role={participantClickable ? 'button' : undefined}
                    tabIndex={participantClickable ? 0 : undefined}
                    onClick={openParticipantProfile}
                    onKeyDown={participantClickable ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openParticipantProfile()
                      }
                    } : undefined}
                  >
                    <div style={overlayStyles.messageAvatar}>
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={displayName}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        initials
                      )}
                    </div>
                  </div>
                ) : null

                return (
                  <div key={entry.key} style={overlayStyles.messageGroup(mine)}>
                    {avatarNode}
                    <div style={overlayStyles.messageContent(mine)}>
                      <span
                        style={overlayStyles.messageName(mine, participantClickable, roomTheme.accentColor)}
                        role={participantClickable ? 'button' : undefined}
                        tabIndex={participantClickable ? 0 : undefined}
                        onClick={openParticipantProfile}
                        onKeyDown={participantClickable ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openParticipantProfile()
                          }
                        } : undefined}
                      >
                        {displayName}
                      </span>
                      <div style={overlayStyles.messageStack(mine)}>
                        {groupMessages.map((message, index) => {
                          const attachments = getMessageAttachments(message)
                          const text = extractMessageText(message)
                          const { text: truncatedText, truncated } = truncateText(text)
                          let displayText = truncatedText
                          let showViewMore = truncated
                          const aiMeta = getAiMetadata(message)
                          let bubbleVariant = 'default'
                          let labelVariant = 'prompt'
                          let labelText = null

                          const memberTotalCandidates = [
                            message.room_member_total,
                            message.roomMemberTotal,
                            roomStats?.participantCount,
                          ]
                          let messageMemberTotal = 0
                          memberTotalCandidates.forEach((candidate) => {
                            const parsed = parseUnreadValue(candidate)
                            if (parsed > messageMemberTotal) {
                              messageMemberTotal = parsed
                            }
                          })
                          const unreadCandidates = [
                            message.room_unread_count,
                            message.roomUnreadCount,
                          ]
                          let unreadParticipants = 0
                          unreadCandidates.forEach((candidate) => {
                            const parsed = parseUnreadValue(candidate)
                            if (parsed > unreadParticipants) {
                              unreadParticipants = parsed
                            }
                          })
                          const showUnreadState =
                            isRoomContext && unreadParticipants > 0 && messageMemberTotal > 0

                          if (aiMeta?.type === 'prompt') {
                            bubbleVariant = 'aiPrompt'
                            labelVariant = 'prompt'
                            labelText = '프롬프트'
                          } else if (aiMeta?.type === 'response') {
                            labelVariant = aiMeta.status === 'error' ? 'error' : 'response'
                            if (aiMeta.status === 'pending') {
                              bubbleVariant = 'aiPending'
                              labelText = 'AI 응답'
                              displayText = '응답 생성 중...'
                              showViewMore = false
                            } else if (aiMeta.status === 'error') {
                              bubbleVariant = 'aiError'
                              labelText = 'AI 응답 실패'
                            } else {
                              bubbleVariant = 'aiResponse'
                              labelText = 'AI 응답'
                            }
                          }

                          const created = formatTime(message.created_at)
                          const showTimestamp =
                            index === 0 || !sameMinute(message.created_at, groupMessages[index - 1]?.created_at)
                          const timestampNode = created ? (
                            <span style={overlayStyles.messageTimestamp(mine)}>{created}</span>
                          ) : null
                          const messageKey =
                            message.id || message.local_id || `${message.created_at || 'message'}-${index}`
                          return (
                            <div key={messageKey} style={overlayStyles.messageItem(mine)}>
                              {mine && showTimestamp ? timestampNode : null}
                              {(() => {
                                const bubbleStyle = overlayStyles.messageBubble(mine, bubbleVariant, roomTheme)
                                if (bubbleVariant === 'default') {
                                  if (themeBubbleColor) {
                                    bubbleStyle.background = themeBubbleColor
                                    bubbleStyle.border = '1px solid rgba(71, 85, 105, 0.35)'
                                  }
                                  if (themeTextColor) {
                                    bubbleStyle.color = themeTextColor
                                  }
                                }
                                return (
                                  <div style={bubbleStyle}>
                                    {labelText ? (
                                      <span style={overlayStyles.messageLabel(labelVariant)}>{labelText}</span>
                                    ) : null}
                                    {attachments.length ? (
                                      <div
                                        style={
                                          attachments.every((item) => item.layoutHint === 'grid')
                                            ? overlayStyles.messageAttachmentsGrid
                                            : overlayStyles.messageAttachments
                                        }
                                      >
                                        {attachments.map((attachment) =>
                                          renderAttachmentPreview(message, attachment, mine),
                                        )}
                                      </div>
                                    ) : null}
                                    {displayText ? (
                                      <p style={messageTextStyle}>{displayText || ' '}</p>
                                    ) : aiMeta?.status === 'pending' ? (
                                      <span style={overlayStyles.messagePendingText}>응답을 생성하고 있습니다…</span>
                                    ) : null}
                                    {showViewMore ? (
                                      <button
                                        type="button"
                                        style={overlayStyles.viewMoreButton}
                                        onClick={() => setExpandedMessage(message)}
                                      >
                                        전체보기
                                      </button>
                                    ) : null}
                                  </div>
                                )
                              })()}
                              {showUnreadState ? (
                                <div style={overlayStyles.messageUnreadRow(mine)}>
                                  <span style={overlayStyles.messageUnreadDot(mine)} />
                                  <span style={overlayStyles.messageUnreadText(mine)}>
                                    아직 {unreadParticipants}
                                    {messageMemberTotal ? `/${messageMemberTotal}` : ''}명이 읽지 않았어요
                                  </span>
                                </div>
                              ) : null}
                              {!mine && showTimestamp ? timestampNode : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <span style={overlayStyles.mutedText}>아직 메시지가 없습니다.</span>
            )
          ) : (
            <div style={overlayStyles.placeholder}>채팅방 또는 세션을 선택해 주세요.</div>
          )}
        </div>
        <div style={composerContainerStyle}>
          {composerAttachments.length ? (
            <div style={attachmentStripStyle}>
              {composerAttachments.map((attachment) => {
                const status = attachment.status || 'ready'
                const baseStyle = overlayStyles.attachmentPreview
                const tone =
                  status === 'uploading'
                    ? '1px solid rgba(59, 130, 246, 0.75)'
                    : status === 'error'
                      ? '1px solid rgba(248, 113, 113, 0.85)'
                      : '1px solid rgba(59, 130, 246, 0.45)'
                return (
                  <div key={attachment.id} style={{ ...baseStyle, border: tone }}>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(attachment.id)}
                      style={{
                        ...overlayStyles.attachmentRemove,
                        cursor: status === 'uploading' ? 'not-allowed' : 'pointer',
                        opacity: status === 'uploading' ? 0.6 : 1,
                      }}
                      disabled={status === 'uploading'}
                    >
                      ×
                    </button>
                    <div style={overlayStyles.attachmentThumb}>
                      {attachment.previewUrl ? (
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        ATTACHMENT_ICONS[attachment.type] || '📎'
                      )}
                      {attachment.type === 'video' && Number.isFinite(attachment.duration) ? (
                        <span style={overlayStyles.attachmentDuration}>
                          {formatDuration(attachment.duration)}
                        </span>
                      ) : null}
                    </div>
                    <div style={overlayStyles.attachmentInfo}>
                      <span style={overlayStyles.attachmentName}>{attachment.name || '첨부'}</span>
                      <span style={overlayStyles.attachmentMeta}>
                        {status === 'uploading'
                          ? '업로드 중'
                          : status === 'error'
                            ? '실패'
                            : formatBytes(attachment.originalSize || attachment.size || 0)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
          {aiActive ? (
            <div style={overlayStyles.aiRequestBanner}>
              <div style={{ display: 'grid', gap: 2 }}>
                <span style={overlayStyles.aiRequestLabel}>AI 응답 요청</span>
                <span style={overlayStyles.aiRequestPreview}>
                  {promptPreview && promptPreview.text
                    ? promptPreview.text
                    : '입력창에 작성한 문장이 프롬프트로 전달됩니다.'}
                  {promptPreview?.truncated ? '…' : ''}
                </span>
              </div>
              <button type="button" style={overlayStyles.aiRequestCancel} onClick={handleCancelAiRequest}>
                ×
              </button>
            </div>
          ) : null}
          {showComposerPanel ? (
            <div ref={composerPanelRef} style={overlayStyles.attachmentPanel}>
              <strong style={overlayStyles.attachmentPanelTitle}>빠른 작업</strong>
              <div style={overlayStyles.attachmentActions}>
                <button
                  type="button"
                  style={overlayStyles.attachmentButton}
                  onClick={() => handleAttachmentAction('photo')}
                >
                  <span>📷 사진 첨부</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>이미지를 업로드합니다.</span>
                </button>
                <button
                  type="button"
                  style={overlayStyles.attachmentButton}
                  onClick={() => handleAttachmentAction('file')}
                >
                  <span>📎 파일 공유</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>문서나 기타 파일을 첨부합니다.</span>
                </button>
                <button
                  type="button"
                  style={overlayStyles.attachmentButton}
                  onClick={() => handleAttachmentAction('video')}
                >
                  <span>🎞️ 동영상 전송</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>클립이나 녹화를 공유합니다.</span>
                </button>
                <button
                  type="button"
                  style={{
                    ...overlayStyles.attachmentButton,
                    opacity: hasContext ? 1 : 0.55,
                    cursor: hasContext ? 'pointer' : 'not-allowed',
                  }}
                  onClick={() => hasContext && handleAttachmentAction('ai')}
                >
                  <span>🤖 AI 응답 요청</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                    현재 대화에 대한 AI 제안을 받아요.
                  </span>
                </button>
              </div>
            </div>
          ) : null}
          <div style={composerStyle}>
            <button
              ref={composerToggleRef}
              type="button"
              onClick={() => hasContext && setShowComposerPanel((prev) => !prev)}
              style={overlayStyles.composerToggle(showComposerPanel, !hasContext)}
              aria-expanded={hasContext && showComposerPanel}
              aria-label="추가 옵션"
              disabled={!hasContext}
            >
              +
            </button>
            <textarea
              value={messageInput}
              onChange={handleMessageInputChange}
              placeholder="메시지를 입력하세요"
              style={overlayStyles.textarea}
              disabled={!hasContext || sending}
            />
            <button
              type="button"
              onClick={handleComposerSubmit}
              disabled={disableSend}
              style={overlayStyles.actionButton('primary', disableSend)}
            >
              보내기
            </button>
          </div>
          {attachmentError ? (
            <div style={{ ...overlayStyles.errorText, paddingTop: 8 }}>{attachmentError}</div>
          ) : null}
        </div>
        {sendError ? (
          <div style={overlayStyles.errorText}>메시지를 전송할 수 없습니다.</div>
        ) : null}
        {showDrawer ? (
          <>
            <div
              style={overlayStyles.drawerScrim(drawerOpen, isCompactLayout)}
              onClick={handleCloseDrawer}
              role="presentation"
            />
            <aside style={overlayStyles.drawerContainer(drawerOpen, isCompactLayout)}>
              <div style={overlayStyles.drawerPanel}>
                <div style={overlayStyles.drawerHeader}>
                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    style={overlayStyles.drawerCloseButton}
                    aria-label="서랍 닫기"
                  >
                    ×
                  </button>
                  <span style={overlayStyles.drawerHeaderLabel}>패널 닫기</span>
                </div>
                <div style={overlayStyles.drawerCover}>
                  {coverImage ? (
                    <img src={coverImage} alt="채팅방 커버" style={overlayStyles.drawerCoverImage} />
                  ) : (
                    <span style={{ color: '#64748b', fontSize: 12 }}>커버 이미지가 없습니다.</span>
                  )}
                </div>
                <div style={overlayStyles.drawerScrollArea}>
                  <section style={overlayStyles.drawerSection}>
                    <h4 style={overlayStyles.drawerSectionTitle}>사진 · 동영상</h4>
                    {mediaItems.length ? (
                      <>
                        <div style={overlayStyles.drawerMediaGrid}>
                          {mediaItems.map((item) => {
                            const key = item.id || `${item.messageId || 'media'}-${item.path || item.preview_url}`
                            const label = item.kind === 'video' ? '동영상' : '사진'
                            return (
                              <div
                                key={key}
                                style={overlayStyles.drawerMediaItem}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleDrawerMediaSelect(item)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    handleDrawerMediaSelect(item)
                                  }
                                }}
                              >
                                {item.preview_url ? (
                                  <img
                                    src={item.preview_url}
                                    alt={item.name || label}
                                    style={overlayStyles.drawerMediaThumb}
                                  />
                                ) : (
                                  <span style={{ fontSize: 18, color: '#94a3b8' }}>
                                    {item.kind === 'video' ? '🎬' : '🖼️'}
                                  </span>
                                )}
                                {item.kind === 'video' ? (
                                  <span style={overlayStyles.drawerMediaBadge}>VIDEO</span>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                        {hasMoreMedia ? (
                          <button
                            type="button"
                            style={overlayStyles.drawerMoreButton}
                            onClick={handleLoadMoreMedia}
                          >
                            더 보기
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span style={overlayStyles.mutedText}>첨부된 미디어가 없습니다.</span>
                    )}
                  </section>
                  <section style={overlayStyles.drawerSection}>
                    <h4 style={overlayStyles.drawerSectionTitle}>파일</h4>
                    {fileItems.length ? (
                      <>
                        <div style={overlayStyles.drawerFileList}>
                          {fileItems.map((item) => {
                            const key = item.id || `${item.messageId || 'file'}-${item.path || item.name}`
                            return (
                              <div
                                key={key}
                                style={overlayStyles.drawerFileItem}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleDrawerFileSelect(item)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    handleDrawerFileSelect(item)
                                  }
                                }}
                              >
                                <span
                                  style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {item.name || '첨부 파일'}
                                </span>
                                <span>{formatBytes(item.size || 0)}</span>
                              </div>
                            )
                          })}
                        </div>
                        {hasMoreFiles ? (
                          <button
                            type="button"
                            style={overlayStyles.drawerMoreButton}
                            onClick={handleLoadMoreFiles}
                          >
                            더 보기
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span style={overlayStyles.mutedText}>공유된 파일이 없습니다.</span>
                    )}
                  </section>
                  <section style={overlayStyles.drawerSection}>
                    <h4 style={overlayStyles.drawerSectionTitle}>참여자</h4>
                    {drawerParticipants.length ? (
                      <div style={overlayStyles.drawerParticipants}>
                        {drawerParticipants.map((participant) => {
                          const name = participant.displayName || '참여자'
                          const initials = name.slice(0, 2)
                          const timeLabel = participant.lastMessageAt ? formatTime(participant.lastMessageAt) : ''
                          const roleLabel =
                            participant.role === 'owner'
                              ? '방장'
                              : participant.role === 'moderator'
                                ? '부방장'
                                : '참여자'
                          return (
                            <div
                              key={participant.ownerToken || `${name}-${timeLabel}`}
                              style={overlayStyles.drawerParticipant(participant.role)}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleOpenParticipantProfile(participant)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  handleOpenParticipantProfile(participant)
                                }
                              }}
                            >
                              <div style={overlayStyles.drawerParticipantAvatar(participant.role)}>
                                {participant.avatarUrl ? (
                                  <img
                                    src={participant.avatarUrl}
                                    alt={name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  initials
                                )}
                              </div>
                              <div style={overlayStyles.drawerParticipantMeta}>
                                <span style={overlayStyles.drawerParticipantName}>{name}</span>
                                <span style={overlayStyles.drawerParticipantSub}>
                                  {roleLabel}
                                  {timeLabel ? ` · ${timeLabel}` : ''}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <span style={overlayStyles.mutedText}>아직 대화한 참여자가 없습니다.</span>
                    )}
                  </section>
                </div>
                <div style={overlayStyles.drawerFooter}>
                  <button
                    type="button"
                    style={overlayStyles.drawerFooterButton(viewerIsOwner ? 'danger' : 'ghost')}
                    onClick={async () => {
                      const success = await handleLeaveRoom(
                        currentRoom || {
                          id: context?.chatRoomId,
                          visibility: context?.visibility || 'private',
                          builtin: context?.builtin,
                        },
                        { asOwner: viewerIsOwner },
                      )
                      if (success) {
                        handleCloseDrawer()
                      }
                    }}
                  >
                    {viewerIsOwner ? '🗑 방 삭제' : '나가기'}
                  </button>
                  <button
                    type="button"
                    style={overlayStyles.drawerFooterButton('ghost')}
                    onClick={() => {
                      handleCloseDrawer()
                      handleOpenSettings()
                    }}
                  >
                    ⚙️ 설정
                  </button>
                </div>
              </div>
            </aside>
          </>
        ) : null}
      </section>
    )
  }

  const miniOverlayLabel = useMemo(() => {
    if (context?.label) return context.label
    if (context?.type === 'global') return '전체 채팅'
    if (context?.type === 'session') return '세션 채팅'
    return '채팅'
  }, [context?.label, context?.type])

  const miniOverlayFeed = useMemo(() => {
    if (!timelineEntries.length) {
      return []
    }
    const feed = []
    timelineEntries.forEach((entry) => {
      if (entry.type === 'date') {
        feed.push({ type: 'date', key: entry.key, label: entry.label })
        return
      }
      entry.messages.forEach((message, index) => {
        const attachments = getMessageAttachments(message)
        const baseText = extractMessageText(message).trim()
        const aiMeta = getAiMetadata(message)
        let text = baseText ? truncateText(baseText, 140).text : ''
        if (!text && aiMeta?.type === 'response') {
          if (aiMeta.status === 'error') {
            text = 'AI 응답 실패'
          } else if (aiMeta.status === 'pending') {
            text = 'AI 응답 생성 중...'
          } else {
            text = 'AI 응답'
          }
        }
        if (!text && attachments.length) {
          text = attachments.length === 1 ? '첨부 1개' : `첨부 ${attachments.length}개`
        }
        if (!text) {
          text = '메시지 내용이 없습니다.'
        }
        feed.push({
          type: 'message',
          key: `${entry.key}-${message.id || message.local_id || index}`,
          mine: entry.mine,
          author: entry.mine ? '나' : entry.displayName || '알 수 없음',
          timestamp: formatTime(message.created_at),
          text,
        })
      })
    })
    return feed.slice(-80)
  }, [timelineEntries])

  const miniOverlayLatest = useMemo(() => {
    for (let index = miniOverlayFeed.length - 1; index >= 0; index -= 1) {
      const entry = miniOverlayFeed[index]
      if (entry?.type === 'message') {
        return entry
      }
    }
    return null
  }, [miniOverlayFeed])

  const miniOverlayBarSnippet = useMemo(() => {
    if (!miniOverlayLatest) {
      return '최근 메시지 없음'
    }
    const { text } = truncateText(miniOverlayLatest.text || '', 60)
    return text || '최근 메시지 없음'
  }, [miniOverlayLatest])

  const miniOverlayUnread = 0

  const focused = Boolean(context)

  const rootStyle = useMemo(
    () => overlayStyles.root(focused, isCompactLayout, viewport.height),
    [focused, isCompactLayout, viewport.height],
  )

  const detailAttachments = expandedMessage ? getMessageAttachments(expandedMessage) : []
  const mediaSelectionCount = mediaLibrary.selection?.size || 0
  const mediaPickerTitle = mediaLibrary.action === 'video' ? '최근 동영상' : '최근 사진'
  const overlayOpen = open && !miniOverlay.active
  const miniOverlayBadge = null
  const miniOverlayWidth = miniOverlay.size?.width || MINI_OVERLAY_WIDTH
  const miniOverlayHeight =
    miniOverlay.mode === 'bar'
      ? MINI_OVERLAY_BAR_HEIGHT
      : miniOverlay.size?.height || MINI_OVERLAY_HEIGHT
  const miniOverlayStyle =
    miniOverlay.active && miniOverlay.position
      ? overlayStyles.miniOverlayShell(
          miniOverlay.position.x,
          miniOverlay.position.y,
          miniOverlayWidth,
          miniOverlayHeight,
          miniOverlay.mode,
        )
      : null
  const mediaPickerOverlay = showMediaPicker ? (
    <div style={overlayStyles.mediaPickerBackdrop} onClick={handleMediaPickerCancel}>
      <div
        style={overlayStyles.mediaPickerPanel}
        onClick={(event) => event.stopPropagation()}
      >
        <header style={overlayStyles.mediaPickerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" style={overlayStyles.mediaPickerClose} onClick={handleMediaPickerCancel}>
              닫기
            </button>
            <strong>{mediaPickerTitle}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {mediaLibrary.multiSelect ? (
              <>
                <span style={overlayStyles.mediaPickerHint}>{mediaSelectionCount}개 선택됨</span>
                <button
                  type="button"
                  style={overlayStyles.mediaPickerAction(mediaSelectionCount === 0)}
                  disabled={mediaSelectionCount === 0}
                  onClick={handleMediaPickerConfirm}
                >
                  보내기
                </button>
                <button type="button" style={overlayStyles.mediaPickerSecondary} onClick={handleExitMultiSelect}>
                  선택 취소
                </button>
              </>
            ) : (
              <span style={overlayStyles.mediaPickerHint}>길게 눌러 여러 항목을 선택할 수 있어요.</span>
            )}
          </div>
        </header>
        <div style={overlayStyles.mediaPickerBody}>
          {mediaLibrary.status === 'loading' ? (
            <span style={overlayStyles.mediaPickerStatus}>미디어를 불러오는 중...</span>
          ) : mediaLibrary.status === 'error' ? (
            <div style={overlayStyles.mediaPickerStatus}>
              <span style={{ color: '#fca5a5', fontWeight: 600 }}>{mediaLibrary.error || '미디어를 불러올 수 없습니다.'}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={overlayStyles.mediaPickerSecondary} onClick={handleReloadMediaLibrary}>
                  다시 시도
                </button>
                {mediaLibrary.errorCode === 'permission-denied' ? (
                  <button
                    type="button"
                    style={overlayStyles.mediaPickerSecondary}
                    onClick={handleOpenNativeMediaSettings}
                  >
                    설정 열기
                  </button>
                ) : null}
              </div>
            </div>
          ) : mediaLibrary.status === 'empty' ? (
            <span style={overlayStyles.mediaPickerStatus}>표시할 항목이 없습니다.</span>
          ) : (
            <>
              <div style={overlayStyles.mediaPickerGrid}>
                {mediaLibrary.entries.map((entry) => {
                  const selected = mediaLibrary.selection?.has(entry.id)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      style={overlayStyles.mediaPickerItem(selected)}
                      onPointerDown={() => handleMediaEntryPointerDown(entry)}
                      onPointerUp={() => handleMediaEntryPointerUp(entry)}
                      onPointerLeave={handleMediaEntryPointerLeave}
                    >
                      {entry.previewUrl ? (
                        <img
                          src={entry.previewUrl}
                          alt={entry.name}
                          style={overlayStyles.mediaPickerThumb}
                        />
                      ) : (
                        <div style={overlayStyles.mediaPickerPlaceholder}>
                          {entry.type?.startsWith('video/') ? '🎬' : '🖼️'}
                        </div>
                      )}
                      <span style={overlayStyles.mediaPickerMeta}>{formatBytes(entry.size)}</span>
                    </button>
                  )
                })}
              </div>
              {mediaLibrary.hasMore || (mediaLibrary.error && mediaLibrary.status === 'ready') ? (
                <div style={overlayStyles.mediaPickerFooterRow}>
                  {mediaLibrary.error && mediaLibrary.status === 'ready' ? (
                    <span style={{ ...overlayStyles.mediaPickerInlineError, flex: 1 }}>
                      {mediaLibrary.error}
                    </span>
                  ) : (
                    <span style={{ flex: 1 }} />
                  )}
                  {mediaLibrary.hasMore ? (
                    <button
                      type="button"
                      style={overlayStyles.mediaPickerLoadMore(mediaLibrary.loadingMore)}
                      onClick={handleLoadMoreMediaLibrary}
                      disabled={mediaLibrary.loadingMore}
                    >
                      {mediaLibrary.loadingMore ? '불러오는 중…' : '더 불러오기'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  ) : null
  const expandedMessageOverlay = expandedMessage ? (
    <div style={modalStyles.backdrop} onClick={handleCloseExpandedMessage}>
      <div
        style={{ ...modalStyles.panel, maxWidth: 'min(540px, 92vw)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={modalStyles.header}>
          <strong style={{ fontSize: 16 }}>전체 메시지</strong>
          <button type="button" style={modalStyles.closeButton} onClick={handleCloseExpandedMessage}>
            닫기
          </button>
        </div>
        <div style={modalStyles.body}>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{extractMessageText(expandedMessage) || ' '}</p>
          {detailAttachments.length ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {detailAttachments.map((attachment) =>
                renderAttachmentPreview(expandedMessage, attachment, false),
              )}
            </div>
          ) : null}
        </div>
        <div style={modalStyles.footer}>
          <span>{formatDateLabel(expandedMessage.created_at)}</span>
          <span>{formatTime(expandedMessage.created_at)}</span>
        </div>
      </div>
    </div>
  ) : null

  const attachmentViewerOverlay = viewerAttachment ? (
    <div style={modalStyles.backdrop} onClick={handleCloseViewer}>
      <div
        style={{ ...modalStyles.panel, maxWidth: 'min(720px, 96vw)', gap: 16 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={modalStyles.header}>
          <strong style={{ fontSize: 16 }}>{viewerAttachment.attachment?.name || '첨부 파일'}</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{ ...modalStyles.closeButton, background: 'rgba(37, 99, 235, 0.3)' }}
              onClick={() => handleDownloadAttachment(viewerAttachment.attachment)}
            >
              다운로드
            </button>
            <button type="button" style={modalStyles.closeButton} onClick={handleCloseViewer}>
              닫기
            </button>
          </div>
        </div>
        <div style={{ ...modalStyles.body, alignItems: 'center' }}>
          {viewerAttachment.status === 'loading' ? (
            <span style={{ color: '#cbd5f5' }}>불러오는 중...</span>
          ) : viewerAttachment.status === 'error' ? (
            <span style={{ color: '#fca5a5' }}>첨부 파일을 열 수 없습니다.</span>
          ) : viewerAttachment.attachment?.type === 'image' ? (
            <img
              src={viewerAttachment.url}
              alt={viewerAttachment.attachment?.name}
              style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: 18 }}
            />
          ) : viewerAttachment.attachment?.type === 'video' ? (
            <video
              src={viewerAttachment.url}
              controls={videoControlsVisible}
              onPlay={handleVideoInteraction}
              onPause={handleVideoInteraction}
              onClick={handleVideoInteraction}
              onPointerMove={handleVideoInteraction}
              style={{ width: '100%', maxHeight: '65vh', borderRadius: 18, background: '#000' }}
            />
          ) : viewerAttachment.url ? (
            <a
              href={viewerAttachment.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#93c5fd', fontWeight: 600 }}
            >
              파일 열기
            </a>
          ) : null}
        </div>
        <div style={modalStyles.footer}>
          <span>{formatBytes(viewerAttachment.attachment?.original_size || viewerAttachment.attachment?.size || 0)}</span>
          <span>{formatTime(viewerAttachment.attachment?.created_at || expandedMessage?.created_at)}</span>
        </div>
      </div>
    </div>
  ) : null

  const createRoomOverlay = (
    <SurfaceOverlay
      open={createModal.open}
      onClose={handleCloseCreateRoom}
      title={createModal.visibility === 'public' ? '오픈채팅 만들기' : '채팅방 만들기'}
      width={420}
      zIndex={1510}
    >
      <form onSubmit={handleSubmitCreateRoom} style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>방 이름</span>
          <input
            type="text"
            value={createForm.name}
            onChange={(event) => handleChangeCreateField('name', event.target.value)}
            placeholder="채팅방 이름"
            required
            style={{
              borderRadius: 12,
              border: '1px solid rgba(71, 85, 105, 0.6)',
              background: 'rgba(15, 23, 42, 0.75)',
              padding: '10px 12px',
              color: '#f8fafc',
              fontSize: 13,
            }}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>설명 (선택)</span>
          <textarea
            value={createForm.description}
            onChange={(event) => handleChangeCreateField('description', event.target.value)}
            placeholder="방 소개를 입력해 주세요."
            rows={3}
            style={{
              borderRadius: 12,
              border: '1px solid rgba(71, 85, 105, 0.6)',
              background: 'rgba(15, 23, 42, 0.75)',
              padding: '10px 12px',
              color: '#f8fafc',
              fontSize: 13,
              resize: 'vertical',
            }}
          />
        </label>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5f5' }}>
            <input
              type="checkbox"
              checked={Boolean(createForm.allowAi)}
              onChange={(event) => handleChangeCreateField('allowAi', event.target.checked)}
            />
            AI 응답 허용
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5f5' }}>
            <input
              type="checkbox"
              checked={Boolean(createForm.requireApproval)}
              onChange={(event) => handleChangeCreateField('requireApproval', event.target.checked)}
            />
            참여 승인 필요
          </label>
        </div>
        {createError ? <span style={{ fontSize: 12, color: '#fca5a5' }}>{createError}</span> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={handleCloseCreateRoom}
            style={{
              borderRadius: 12,
              border: '1px solid rgba(148, 163, 184, 0.45)',
              background: 'rgba(15, 23, 42, 0.7)',
              color: '#cbd5f5',
              padding: '8px 14px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={createSubmitting}
            style={{
              borderRadius: 12,
              border: '1px solid rgba(59, 130, 246, 0.7)',
              background: createSubmitting ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.85)',
              color: '#f8fafc',
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: createSubmitting ? 'progress' : 'pointer',
            }}
          >
            {createSubmitting ? '생성 중…' : '생성하기'}
          </button>
        </div>
      </form>
    </SurfaceOverlay>
  )

  const searchOverlay = (
    <SurfaceOverlay
      open={searchModalOpen}
      onClose={handleCloseSearchOverlay}
      title="오픈채팅 검색"
      width={520}
      zIndex={1505}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <form onSubmit={handleSubmitSearch} style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="채팅방 이름 또는 설명 검색"
            style={{
              flex: 1,
              borderRadius: 12,
              border: '1px solid rgba(71, 85, 105, 0.6)',
              background: 'rgba(15, 23, 42, 0.75)',
              padding: '10px 12px',
              color: '#f8fafc',
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            style={{
              borderRadius: 12,
              border: '1px solid rgba(59, 130, 246, 0.7)',
              background: 'rgba(59, 130, 246, 0.85)',
              color: '#f8fafc',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            검색
          </button>
        </form>
        {resolvedSearchKeywords.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#cbd5f5', fontWeight: 600 }}>
              {trimmedSearchQuery ? '추천 검색어' : '실시간 검색어'}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {resolvedSearchKeywords.map((item) => (
                <button
                  key={item.keyword}
                  type="button"
                  onClick={() => handleSelectSearchKeyword(item.keyword)}
                  style={{
                    borderRadius: 999,
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    background: 'rgba(30, 41, 59, 0.75)',
                    color: '#e2e8f0',
                    fontSize: 12,
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <span>#{item.keyword}</span>
                  {Number.isFinite(item.searchCount) && item.searchCount ? (
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{item.searchCount}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {searchError ? <span style={{ fontSize: 12, color: '#fca5a5' }}>{searchError}</span> : null}
        {searchLoading ? (
          <span style={overlayStyles.mutedText}>검색 중입니다…</span>
        ) : (
          (() => {
            const roomsToRender = trimmedSearchQuery ? searchResults : baselineAvailableRooms
            if (trimmedSearchQuery && !searchPerformed) {
              return (
                <span style={overlayStyles.mutedText}>검색 버튼을 눌러 채팅방을 찾아보세요.</span>
              )
            }

            if (!roomsToRender.length) {
              return (
                <span style={overlayStyles.mutedText}>
                  {trimmedSearchQuery ? '검색 결과가 없습니다.' : '표시할 공개 채팅방이 없습니다.'}
                </span>
              )
            }

            return (
              <div style={{ display: 'grid', gap: 12 }}>
                {roomsToRender.map((room) => {
                  const roomId = normalizeId(room.id)
                  const joined = joinedRoomIds.has(roomId)
                  const memberCount = Number(room.member_count) || 0
                  return (
                    <div
                      key={room.id || roomId}
                      style={{
                        ...overlayStyles.roomCard(false),
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (joined) {
                          handleSelectRoom(room, 'open')
                          handleCloseSearchOverlay()
                        }
                      }}
                    >
                      <div style={overlayStyles.roomCardBody}>
                        <div style={overlayStyles.roomCardHeader}>
                          <span style={overlayStyles.roomCardTitle}>{room.name || '채팅방'}</span>
                          {joined ? (
                            <span style={{ fontSize: 11, color: '#cbd5f5' }}>참여중</span>
                          ) : null}
                        </div>
                        {room.description ? (
                          <span style={{ fontSize: 12, color: '#cbd5f5' }}>
                            {truncateText(room.description, 80).text}
                          </span>
                        ) : null}
                        <div style={overlayStyles.roomCardStats}>
                          <span>{memberCount ? `${memberCount}명` : '새 채팅방'}</span>
                          <button
                            type="button"
                            disabled={joined}
                            onClick={(event) => {
                              event.stopPropagation()
                              if (!joined) {
                                handleJoinRoom(room)
                              }
                            }}
                            style={{
                              borderRadius: 999,
                              border: '1px solid rgba(59, 130, 246, 0.65)',
                              background: joined
                                ? 'rgba(37, 99, 235, 0.25)'
                                : 'rgba(59, 130, 246, 0.8)',
                              color: '#e0f2fe',
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '5px 12px',
                              cursor: joined ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {joined ? '참여중' : '참여하기'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}
      </div>
    </SurfaceOverlay>
  )

  const friendOverlay = (
    <FriendOverlay
      open={friendOverlayOpen}
      onClose={handleCloseFriends}
      viewer={socialViewer || heroViewerHint || {}}
      friends={friends}
      friendRequests={friendRequests}
      loading={friendLoading}
      error={friendError}
      onAddFriend={addFriend}
      onRemoveFriend={removeFriend}
      onAcceptRequest={acceptFriendRequest}
      onDeclineRequest={declineFriendRequest}
      onCancelRequest={cancelFriendRequest}
      overlayZIndex={1525}
    />
  )

  const participantOverlay = (
    <SurfaceOverlay
      open={profileSheet.open}
      onClose={handleCloseParticipantProfile}
      title="참여자 정보"
      width="min(420px, 92vw)"
      zIndex={1530}
    >
      {profileSheet.participant ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 24,
                overflow: 'hidden',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(71, 85, 105, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                color: '#cbd5f5',
              }}
            >
              {profileSheet.participant.avatarUrl ? (
                <img
                  src={profileSheet.participant.avatarUrl}
                  alt={profileSheet.participant.displayName || '참여자'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                (profileSheet.participant.displayName || '참여자').slice(0, 2)
              )}
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <strong style={{ fontSize: 16, color: '#f1f5f9' }}>
                {profileSheet.participant.displayName || '참여자'}
              </strong>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {profileSheet.participant.role === 'owner'
                  ? '방장'
                  : profileSheet.participant.role === 'moderator'
                    ? '부방장'
                    : '참여자'}
              </span>
              {profileSheet.participant.heroId ? (
                <span style={{ fontSize: 11, color: '#cbd5f5' }}>
                  캐릭터 ID: {profileSheet.participant.heroId}
                </span>
              ) : null}
            </div>
          </div>
          {profileSheet.error ? (
            <span style={{ fontSize: 12, color: '#fca5a5' }}>{profileSheet.error}</span>
          ) : null}
          <div style={{ display: 'grid', gap: 10 }}>
            <button
              type="button"
              style={overlayStyles.actionButton('ghost', profileSheet.busy)}
              disabled={profileSheet.busy}
              onClick={handleRequestFriendFromProfile}
            >
              친구 요청 보내기
            </button>
            <button
              type="button"
              style={overlayStyles.actionButton('ghost', profileSheet.busy)}
              disabled={profileSheet.busy}
              onClick={handleStartDirectMessage}
            >
              1대1 대화 시작
            </button>
            <button
              type="button"
              style={overlayStyles.actionButton('ghost', profileSheet.busy)}
              disabled={profileSheet.busy}
              onClick={handleBlockParticipant}
            >
              차단하기
            </button>
            {viewerOwnsRoom && profileSheet.participant.role !== 'owner' ? (
              <>
                <button
                  type="button"
                  style={overlayStyles.actionButton('ghost', profileSheet.busy)}
                  disabled={profileSheet.busy}
                  onClick={handleBanParticipant}
                >
                  추방하기
                </button>
                {profileSheet.participant.role === 'moderator' ? (
                  <button
                    type="button"
                    style={overlayStyles.actionButton('ghost', profileSheet.busy)}
                    disabled={profileSheet.busy}
                    onClick={handleDemoteModerator}
                  >
                    부방장 해제
                  </button>
                ) : (
                  <button
                    type="button"
                    style={overlayStyles.actionButton('ghost', profileSheet.busy)}
                    disabled={profileSheet.busy}
                    onClick={handlePromoteModerator}
                  >
                    부방장 임명
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <span style={overlayStyles.mutedText}>참여자 정보를 불러오지 못했습니다.</span>
      )}
    </SurfaceOverlay>
  )

  const settingsOverlay = (
    <SurfaceOverlay
      open={settingsOverlayOpen}
      onClose={handleCloseSettings}
      title="채팅방 설정"
      width="min(640px, 96vw)"
      zIndex={1800}
    >
      <div style={{ display: 'grid', gap: 18 }}>
        <nav style={overlayStyles.settingsTabs}>
          {viewerOwnsRoom ? (
            <button
              type="button"
              style={overlayStyles.settingsTabButton(settingsTab === 'owner')}
              onClick={() => setSettingsTab('owner')}
            >
              방장 도구
            </button>
          ) : null}
          <button
            type="button"
            style={overlayStyles.settingsTabButton(settingsTab === 'preferences')}
            onClick={() => setSettingsTab('preferences')}
          >
            개인 설정
          </button>
          <button
            type="button"
            style={overlayStyles.settingsTabButton(settingsTab === 'api')}
            onClick={() => setSettingsTab('api')}
          >
            AI API 키
          </button>
        </nav>
        {settingsMessage ? <span style={{ fontSize: 12, color: '#34d399' }}>{settingsMessage}</span> : null}
        {settingsError ? <span style={{ fontSize: 12, color: '#fca5a5' }}>{settingsError}</span> : null}
        {settingsTab === 'owner' && viewerOwnsRoom ? (
          <div style={{ display: 'grid', gap: 18 }}>
            <section style={overlayStyles.section}>
              <h3 style={overlayStyles.sectionTitle}>방 테마</h3>
              <div style={overlayStyles.themePreview(ownerThemePreview.backgroundValue)}>
                <div
                  style={overlayStyles.themePreviewMessage(
                    ownerThemePreview.bubbleColor,
                    ownerThemePreview.textColor,
                  )}
                >
                  <span>이런 느낌으로 보여요</span>
                  <span style={overlayStyles.themePreviewAccent(ownerThemePreview.accentColor)} />
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  기본 배경과 말풍선/글자색이 테마에 맞춰 보정됩니다.
                </span>
              </div>
              <div style={overlayStyles.themeModeTabs}>
                {[
                  { key: 'preset', label: '추천 테마' },
                  { key: 'color', label: '단색 배경' },
                  { key: 'image', label: '이미지 업로드' },
                  { key: 'none', label: '배경 없음' },
                ].map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    style={overlayStyles.themeModeButton(roomSettingsDraft.themeMode === entry.key)}
                    onClick={() => handleOwnerThemeModeChange(entry.key)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              {roomSettingsDraft.themeMode === 'preset' ? (
                <div style={overlayStyles.themePresetGrid}>
                  {ROOM_THEME_LIBRARY.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      style={overlayStyles.themePresetButton(roomSettingsDraft.themePresetId === preset.id)}
                      onClick={() => handleOwnerSelectPreset(preset.id)}
                    >
                      <div style={overlayStyles.themePresetPreview(preset.value)} />
                      <div style={overlayStyles.themePresetLabel}>
                        <span>{preset.label}</span>
                        <span style={overlayStyles.themePreviewAccent(preset.recommended.accentColor)} />
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              {roomSettingsDraft.themeMode === 'color' ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={overlayStyles.fieldLabel}>
                    배경 색상
                    <div style={overlayStyles.colorRow}>
                      <input
                        type="color"
                        value={ownerBackgroundColorValue}
                        onChange={(event) =>
                          updateOwnerThemeDraft({ themeBackgroundColor: event.target.value }, true)
                        }
                        style={overlayStyles.colorInput()}
                      />
                      <input
                        type="text"
                        value={roomSettingsDraft.themeBackgroundColor}
                        onChange={(event) =>
                          updateOwnerThemeDraft({ themeBackgroundColor: event.target.value }, true)
                        }
                        placeholder="#0f172a"
                        style={overlayStyles.input}
                      />
                    </div>
                  </label>
                </div>
              ) : null}
              {roomSettingsDraft.themeMode === 'image' ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <span style={overlayStyles.fieldLabel}>배경 이미지</span>
                  <div style={overlayStyles.imageUploadTile(Boolean(roomSettingsDraft.themeBackgroundUrl))}>
                    {roomSettingsDraft.themeBackgroundUrl ? (
                      <div style={overlayStyles.imageUploadPreview(roomSettingsDraft.themeBackgroundUrl)} />
                    ) : (
                      <div style={overlayStyles.imageUploadPlaceholder}>
                        <strong style={{ color: '#cbd5f5', fontSize: 12 }}>이미지를 업로드해 주세요</strong>
                        <span>최대 50MB 이미지 파일을 사용할 수 있어요.</span>
                      </div>
                    )}
                    <div style={overlayStyles.imageUploadActions}>
                      <button
                        type="button"
                        style={overlayStyles.imageUploadButton('primary', roomThemeUploadBusy)}
                        onClick={() => roomBackgroundInputRef.current?.click()}
                        disabled={roomThemeUploadBusy}
                      >
                        {roomThemeUploadBusy ? '업로드 중…' : '이미지 선택'}
                      </button>
                      {roomSettingsDraft.themeBackgroundUrl ? (
                        <button
                          type="button"
                          style={overlayStyles.imageUploadButton('ghost', roomThemeUploadBusy)}
                          onClick={handleOwnerBackgroundClear}
                          disabled={roomThemeUploadBusy}
                        >
                          제거
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {roomSettingsDraft.themeBackgroundUrl ? (
                    <span style={overlayStyles.imageUploadHint}>{roomSettingsDraft.themeBackgroundUrl}</span>
                  ) : (
                    <span style={overlayStyles.imageUploadHint}>Supabase 저장소에 업로드된 이미지를 바로 사용할 수 있습니다.</span>
                  )}
                  <input
                    ref={roomBackgroundInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleOwnerBackgroundFileChange}
                  />
                </div>
              ) : null}
              <div>
                <span style={overlayStyles.fieldLabel}>포인트 색상</span>
                <div style={overlayStyles.themeAccentPalette}>
                  {ACCENT_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      style={overlayStyles.themeAccentSwatch(
                        swatch,
                        swatch.toLowerCase() === (roomSettingsDraft.accentColor || '').toLowerCase(),
                      )}
                      onClick={() => handleOwnerAccentChange(swatch)}
                    />
                  ))}
                </div>
                <div style={overlayStyles.colorRow}>
                  <input
                    type="color"
                    value={ownerAccentPickerValue}
                    onChange={(event) => handleOwnerAccentChange(event.target.value)}
                    style={overlayStyles.colorInput()}
                  />
                <input
                  type="text"
                  value={roomSettingsDraft.accentColor}
                  onChange={(event) => handleOwnerAccentChange(event.target.value)}
                  placeholder="#38bdf8"
                  style={overlayStyles.input}
                />
                </div>
              </div>
              <label style={overlayStyles.themeAutoRow}>
                <input
                  type="checkbox"
                  checked={roomSettingsDraft.autoContrast}
                  onChange={(event) => handleOwnerAutoContrastToggle(event.target.checked)}
                />
                자동 대비 및 가독성 보정
              </label>
              <label style={overlayStyles.fieldLabel}>
                말풍선 색상
                <div style={overlayStyles.colorRow}>
                  <input
                    type="color"
                    value={ownerBubblePickerValue}
                    onChange={(event) => handleOwnerBubbleInput(event.target.value)}
                    style={overlayStyles.colorInput(roomSettingsDraft.autoContrast)}
                    disabled={roomSettingsDraft.autoContrast}
                  />
                  <input
                    type="text"
                    value={roomSettingsDraft.bubbleColor}
                    onChange={(event) => handleOwnerBubbleInput(event.target.value)}
                    placeholder="#1f2937"
                    style={overlayStyles.input}
                    disabled={roomSettingsDraft.autoContrast}
                  />
                </div>
              </label>
              <label style={overlayStyles.fieldLabel}>
                글자 색상
                <div style={overlayStyles.colorRow}>
                  <input
                    type="color"
                    value={ownerTextPickerValue}
                    onChange={(event) => handleOwnerTextInput(event.target.value)}
                    style={overlayStyles.colorInput(roomSettingsDraft.autoContrast)}
                    disabled={roomSettingsDraft.autoContrast}
                  />
                  <input
                    type="text"
                    value={roomSettingsDraft.textColor}
                    onChange={(event) => handleOwnerTextInput(event.target.value)}
                    placeholder="#f8fafc"
                    style={overlayStyles.input}
                    disabled={roomSettingsDraft.autoContrast}
                  />
                </div>
              </label>
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={overlayStyles.fieldLabel}>기본 추방 시간(분)</span>
                <div style={overlayStyles.banPresetGrid}>
                  {BAN_DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      style={overlayStyles.banPresetButton(
                        preset.minutes === null
                          ? roomSettingsDraft.defaultBanMinutes === ''
                          : Number(roomSettingsDraft.defaultBanMinutes || '0') === preset.minutes,
                      )}
                      onClick={() =>
                        setRoomSettingsDraft((prev) => ({
                          ...prev,
                          defaultBanMinutes:
                            preset.minutes === null ? '' : String(Math.max(0, preset.minutes)),
                        }))
                      }
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  value={roomSettingsDraft.defaultBanMinutes}
                  onChange={(event) =>
                    setRoomSettingsDraft((prev) => ({ ...prev, defaultBanMinutes: event.target.value }))
                  }
                  placeholder="예: 60"
                  style={overlayStyles.input}
                />
              </div>
              <button
                type="button"
                style={overlayStyles.actionButton('primary')}
                onClick={async () => {
                  if (!context?.chatRoomId) return
                  setSettingsMessage(null)
                  setSettingsError(null)
                  try {
                    const palette = buildThemePaletteFromDraft(roomSettingsDraft, {
                      fallback: ownerThemeFallback,
                      fallbackBackgroundUrl: ownerThemeFallback.backgroundUrl,
                    })
                    const settings = await updateChatRoomSettings({
                      roomId: context.chatRoomId,
                      settings: {
                        defaultBanMinutes: roomSettingsDraft.defaultBanMinutes
                          ? Number(roomSettingsDraft.defaultBanMinutes)
                          : null,
                        defaultBackgroundUrl:
                          palette.descriptor.type === 'image' ? palette.backgroundValue : null,
                        defaultTheme: {
                          mode: roomSettingsDraft.themeMode,
                          presetId: palette.presetId,
                          backgroundUrl:
                            roomSettingsDraft.themeMode === 'image'
                              ? roomSettingsDraft.themeBackgroundUrl || null
                              : null,
                          backgroundColor:
                            roomSettingsDraft.themeMode === 'color'
                              ? roomSettingsDraft.themeBackgroundColor || null
                              : null,
                          accentColor: palette.accentColor,
                          bubbleColor: palette.bubbleColor,
                          textColor: palette.textColor,
                          autoContrast: roomSettingsDraft.autoContrast !== false,
                        },
                      },
                    })
                    setSettingsMessage('방 테마를 저장했습니다.')
                    if (settings) {
                      updateRoomMetadata(context.chatRoomId, settings)
                    }
                  } catch (error) {
                    console.error('[chat] 방 설정 저장 실패', error)
                    setSettingsError(error?.message || '방 설정을 저장할 수 없습니다.')
                  }
                }}
              >
                저장하기
              </button>
            </section>
            <section style={overlayStyles.section}>
              <header style={overlayStyles.sectionHeader}>
                <h3 style={overlayStyles.sectionTitle}>공지 관리</h3>
                <button type="button" style={overlayStyles.secondaryButton} onClick={handleOpenAnnouncementComposer}>
                  새 공지 작성
                </button>
              </header>
              {announcementError ? (
                <span style={{ fontSize: 12, color: '#fca5a5' }}>{announcementError}</span>
              ) : null}
              {pinnedAnnouncement ? (
                <button
                  type="button"
                  style={overlayStyles.announcementListItem(true)}
                  onClick={() => handleOpenAnnouncementDetail(pinnedAnnouncement)}
                >
                  <strong>
                    📌 {pinnedAnnouncement.title || truncateText(pinnedAnnouncement.content || '', 80).text || '제목 없는 공지'}
                  </strong>
                  {pinnedAnnouncement.title && pinnedAnnouncement.content ? (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      {truncateText(pinnedAnnouncement.content || '', ANNOUNCEMENT_PREVIEW_LENGTH).text}
                    </span>
                  ) : null}
                  <span style={overlayStyles.announcementMeta}>
                    최근 업데이트: {formatTime(pinnedAnnouncement.updated_at)} · ♥ {pinnedAnnouncement.heart_count || 0} · 💬{' '}
                    {pinnedAnnouncement.comment_count || 0}
                  </span>
                </button>
              ) : null}
              {roomAnnouncements.length ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {roomAnnouncements.map((announcement) => (
                    <button
                      key={announcement.id}
                      type="button"
                      style={overlayStyles.announcementListItem(false)}
                      onClick={() => handleOpenAnnouncementDetail(announcement)}
                    >
                      <strong>
                        {announcement.title || truncateText(announcement.content || '', 80).text || '제목 없는 공지'}
                      </strong>
                      {announcement.title && announcement.content ? (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          {truncateText(announcement.content || '', ANNOUNCEMENT_PREVIEW_LENGTH).text}
                        </span>
                      ) : null}
                      <span style={overlayStyles.announcementMeta}>
                        ♥ {announcement.heart_count || 0} · 💬 {announcement.comment_count || 0}
                      </span>
                    </button>
                  ))}
                  {roomAnnouncementsHasMore ? (
                    <button type="button" style={overlayStyles.drawerMoreButton} onClick={handleLoadMoreAnnouncements}>
                      더 보기
                    </button>
                  ) : null}
                </div>
              ) : !pinnedAnnouncement ? (
                <span style={overlayStyles.mutedText}>등록된 공지가 없습니다.</span>
              ) : null}
            </section>
            <section style={overlayStyles.section}>
              <header style={overlayStyles.sectionHeader}>
                <h3 style={overlayStyles.sectionTitle}>추방된 참여자</h3>
              </header>
              {roomBansLoading ? (
                <span style={overlayStyles.mutedText}>차단 목록을 불러오는 중...</span>
              ) : roomBans.length ? (
                <div style={overlayStyles.banList}>
                  {roomBans.map((ban) => (
                    <div key={`${ban.room_id}-${ban.owner_id}`} style={overlayStyles.banListItem}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <strong>{ban.owner_name || ban.owner_id}</strong>
                        <div style={overlayStyles.announcementMeta}>
                          {ban.expires_at ? `만료: ${formatDateLabel(ban.expires_at)}` : '영구 차단'}
                        </div>
                        {ban.reason ? <div style={{ fontSize: 12, color: '#cbd5f5' }}>{ban.reason}</div> : null}
                      </div>
                      <div style={overlayStyles.banListActions}>
                        <button type="button" style={overlayStyles.secondaryButton} onClick={() => handleAdjustBanEntry(ban)}>
                          기간 조정
                        </button>
                        <button type="button" style={overlayStyles.secondaryButton} onClick={() => handleUnbanEntry(ban)}>
                          추방 해제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={overlayStyles.mutedText}>추방된 참여자가 없습니다.</span>
              )}
            </section>
            <section style={overlayStyles.section}>
              <h3 style={overlayStyles.sectionTitle}>채팅 통계</h3>
              {roomStatsLoading ? (
                <span style={overlayStyles.mutedText}>통계를 불러오는 중...</span>
              ) : roomStats ? (
                <>
                  <dl style={overlayStyles.statList}>
                    <div>
                      <dt>총 메시지</dt>
                      <dd>{roomStats.messageCount ?? 0}</dd>
                    </div>
                    <div>
                      <dt>최근 24시간</dt>
                      <dd>{roomStats.messagesLast24h ?? 0}</dd>
                    </div>
                    <div>
                      <dt>첨부 수</dt>
                      <dd>{roomStats.attachmentCount ?? 0}</dd>
                    </div>
                    <div>
                      <dt>참여자</dt>
                      <dd>{roomStats.participantCount ?? 0}</dd>
                    </div>
                    <div>
                      <dt>부방장</dt>
                      <dd>{roomStats.moderatorCount ?? 0}</dd>
                    </div>
                    <div>
                      <dt>마지막 메시지</dt>
                      <dd>{roomStats.lastMessageAt ? formatDateLabel(roomStats.lastMessageAt) : '정보 없음'}</dd>
                    </div>
                  </dl>
                  {Array.isArray(roomStats.contributions) && roomStats.contributions.length ? (
                    <div style={overlayStyles.statContributionList}>
                      {roomStats.contributions.map((entry, index) => (
                        <div
                          key={entry.ownerId || `${entry.displayName || 'member'}-${index}`}
                          style={overlayStyles.statContributionItem}
                        >
                          <div style={overlayStyles.statContributionLabel}>
                            <span>{entry.displayName || entry.ownerId || '참여자'}</span>
                            <span style={overlayStyles.announcementMeta}>
                              {(entry.messageCount ?? 0).toLocaleString()}개 ·{' '}
                              {Number.isFinite(entry.share) ? `${entry.share}%` : '0%'}
                            </span>
                          </div>
                          <div style={overlayStyles.statContributionBar}>
                            <div style={overlayStyles.statContributionBarFill(entry.share)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={overlayStyles.mutedText}>참여자별 통계를 확인할 수 없습니다.</span>
                  )}
                </>
              ) : (
                <span style={overlayStyles.mutedText}>통계 정보를 확인할 수 없습니다.</span>
              )}
            </section>
          </div>
        ) : null}
        {settingsTab === 'preferences' ? (
          <section style={overlayStyles.section}>
            <h3 style={overlayStyles.sectionTitle}>개인 설정</h3>
            {preferencesError ? <span style={{ fontSize: 12, color: '#fca5a5' }}>{preferencesError}</span> : null}
            <div style={overlayStyles.themePreview(personalThemePreview.backgroundValue)}>
              <div
                style={overlayStyles.themePreviewMessage(
                  personalThemePreview.bubbleColor,
                  personalThemePreview.textColor,
                )}
              >
                <span>내 화면에 이렇게 보입니다</span>
                <span style={overlayStyles.themePreviewAccent(personalThemePreview.accentColor)} />
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                방을 나가기 전까지 개인 테마가 유지됩니다.
              </span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5f5', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={preferencesDraft.useRoomBackground}
                onChange={(event) => handleMemberUseRoomBackgroundChange(event.target.checked)}
              />
              방 기본 배경 사용
            </label>
            <div style={overlayStyles.themeModeTabs}>
              {[
                { key: 'preset', label: '추천 테마' },
                { key: 'color', label: '단색 배경' },
                { key: 'image', label: '이미지 업로드' },
                { key: 'none', label: '배경 없음' },
              ].map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  style={overlayStyles.themeModeButton(preferencesDraft.themeMode === entry.key)}
                  onClick={() => handleMemberThemeModeChange(entry.key)}
                  disabled={preferencesDraft.useRoomBackground}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            {!preferencesDraft.useRoomBackground && preferencesDraft.themeMode === 'preset' ? (
              <div style={overlayStyles.themePresetGrid}>
                {ROOM_THEME_LIBRARY.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    style={overlayStyles.themePresetButton(preferencesDraft.themePresetId === preset.id)}
                    onClick={() => handleMemberSelectPreset(preset.id)}
                  >
                    <div style={overlayStyles.themePresetPreview(preset.value)} />
                    <div style={overlayStyles.themePresetLabel}>
                      <span>{preset.label}</span>
                      <span style={overlayStyles.themePreviewAccent(preset.recommended.accentColor)} />
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
            {!preferencesDraft.useRoomBackground && preferencesDraft.themeMode === 'color' ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={overlayStyles.fieldLabel}>
                  배경 색상
                  <div style={overlayStyles.colorRow}>
                    <input
                      type="color"
                      value={personalBackgroundColorValue}
                      onChange={(event) =>
                        updateMemberThemeDraft({ backgroundColor: event.target.value }, true)
                      }
                      style={overlayStyles.colorInput()}
                    />
                    <input
                      type="text"
                      value={preferencesDraft.backgroundColor}
                      onChange={(event) =>
                        updateMemberThemeDraft({ backgroundColor: event.target.value }, true)
                      }
                      placeholder="#0f172a"
                      style={overlayStyles.input}
                    />
                  </div>
                </label>
              </div>
            ) : null}
            {!preferencesDraft.useRoomBackground && preferencesDraft.themeMode === 'image' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <span style={overlayStyles.fieldLabel}>개인 배경 이미지</span>
                <div style={overlayStyles.imageUploadTile(Boolean(preferencesDraft.backgroundUrl))}>
                  {preferencesDraft.backgroundUrl ? (
                    <div style={overlayStyles.imageUploadPreview(preferencesDraft.backgroundUrl)} />
                  ) : (
                    <div style={overlayStyles.imageUploadPlaceholder}>
                      <strong style={{ color: '#cbd5f5', fontSize: 12 }}>내 화면에서 사용할 이미지를 선택하세요</strong>
                      <span>방을 나가기 전까지 개인 배경이 유지됩니다.</span>
                    </div>
                  )}
                  <div style={overlayStyles.imageUploadActions}>
                    <button
                      type="button"
                      style={overlayStyles.imageUploadButton('primary', memberThemeUploadBusy)}
                      onClick={() => memberBackgroundInputRef.current?.click()}
                      disabled={memberThemeUploadBusy}
                    >
                      {memberThemeUploadBusy ? '업로드 중…' : '이미지 선택'}
                    </button>
                    {preferencesDraft.backgroundUrl ? (
                      <button
                        type="button"
                        style={overlayStyles.imageUploadButton('ghost', memberThemeUploadBusy)}
                        onClick={handleMemberBackgroundClear}
                        disabled={memberThemeUploadBusy}
                      >
                        제거
                      </button>
                    ) : null}
                  </div>
                </div>
                {preferencesDraft.backgroundUrl ? (
                  <span style={overlayStyles.imageUploadHint}>{preferencesDraft.backgroundUrl}</span>
                ) : (
                  <span style={overlayStyles.imageUploadHint}>업로드한 이미지는 Supabase 저장소에 개인 영역으로 보관됩니다.</span>
                )}
                <input
                  ref={memberBackgroundInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleMemberBackgroundFileChange}
                />
              </div>
            ) : null}
            <div>
              <span style={overlayStyles.fieldLabel}>포인트 색상</span>
              <div style={overlayStyles.themeAccentPalette}>
                {ACCENT_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    style={overlayStyles.themeAccentSwatch(
                      swatch,
                      swatch.toLowerCase() === (preferencesDraft.accentColor || '').toLowerCase(),
                    )}
                    onClick={() => handleMemberAccentChange(swatch)}
                  />
                ))}
              </div>
              <div style={overlayStyles.colorRow}>
                <input
                  type="color"
                  value={personalAccentPickerValue}
                  onChange={(event) => handleMemberAccentChange(event.target.value)}
                  style={overlayStyles.colorInput()}
                />
                <input
                  type="text"
                  value={preferencesDraft.accentColor}
                  onChange={(event) => handleMemberAccentChange(event.target.value)}
                  placeholder="#38bdf8"
                  style={overlayStyles.input}
                />
              </div>
            </div>
            <label style={overlayStyles.themeAutoRow}>
              <input
                type="checkbox"
                checked={preferencesDraft.autoContrast}
                onChange={(event) => handleMemberAutoContrastToggle(event.target.checked)}
              />
              자동 대비 및 가독성 보정
            </label>
            <label style={overlayStyles.fieldLabel}>
              말풍선 색상
              <div style={overlayStyles.colorRow}>
                <input
                  type="color"
                  value={personalBubblePickerValue}
                  onChange={(event) => handleMemberBubbleInput(event.target.value)}
                  style={overlayStyles.colorInput(preferencesDraft.autoContrast)}
                  disabled={preferencesDraft.autoContrast}
                />
                <input
                  type="text"
                  value={preferencesDraft.bubbleColor}
                  onChange={(event) => handleMemberBubbleInput(event.target.value)}
                  placeholder="#1f2937"
                  style={overlayStyles.input}
                  disabled={preferencesDraft.autoContrast}
                />
              </div>
            </label>
            <label style={overlayStyles.fieldLabel}>
              글자 색상
              <div style={overlayStyles.colorRow}>
                <input
                  type="color"
                  value={personalTextPickerValue}
                  onChange={(event) => handleMemberTextInput(event.target.value)}
                  style={overlayStyles.colorInput(preferencesDraft.autoContrast)}
                  disabled={preferencesDraft.autoContrast}
                />
                <input
                  type="text"
                  value={preferencesDraft.textColor}
                  onChange={(event) => handleMemberTextInput(event.target.value)}
                  placeholder="#f8fafc"
                  style={overlayStyles.input}
                  disabled={preferencesDraft.autoContrast}
                />
              </div>
            </label>
            <button
              type="button"
              style={overlayStyles.actionButton('primary', savingPreferences)}
              disabled={savingPreferences}
              onClick={async () => {
                if (!context?.chatRoomId) return
                setPreferencesError(null)
                setSavingPreferences(true)
                try {
                  const palette = buildThemePaletteFromDraft(
                    {
                      themeMode: preferencesDraft.themeMode,
                      themePresetId: preferencesDraft.themePresetId,
                      themeBackgroundUrl: preferencesDraft.backgroundUrl,
                      themeBackgroundColor: preferencesDraft.backgroundColor,
                      accentColor: preferencesDraft.accentColor,
                      bubbleColor: preferencesDraft.bubbleColor,
                      textColor: preferencesDraft.textColor,
                      autoContrast: preferencesDraft.autoContrast,
                    },
                    {
                      fallback: memberThemeFallback,
                      fallbackBackgroundUrl: memberThemeFallback.backgroundUrl || ownerThemeFallback.backgroundUrl,
                    },
                  )
                  const personalBackgroundUrl =
                    preferencesDraft.useRoomBackground
                      ? null
                      : preferencesDraft.themeMode === 'image'
                        ? preferencesDraft.backgroundUrl || null
                        : null
                  const preferences = await saveChatMemberPreferences({
                    roomId: context.chatRoomId,
                    preferences: {
                      bubble_color: palette.bubbleColor || null,
                      text_color: palette.textColor || null,
                      background_url: personalBackgroundUrl,
                      use_room_background: preferencesDraft.useRoomBackground,
                      metadata: {
                        ...(preferencesDraft.metadata || {}),
                        theme: {
                          mode: preferencesDraft.themeMode,
                          presetId: palette.presetId,
                          backgroundUrl:
                            preferencesDraft.themeMode === 'image'
                              ? preferencesDraft.backgroundUrl || null
                              : null,
                          backgroundColor:
                            preferencesDraft.themeMode === 'color'
                              ? preferencesDraft.backgroundColor || null
                              : null,
                          accentColor: palette.accentColor,
                          bubbleColor: palette.bubbleColor,
                          textColor: palette.textColor,
                          autoContrast: preferencesDraft.autoContrast !== false,
                        },
                      },
                    },
                  })
                  setRoomPreferences(preferences)
                  setSettingsMessage('개인 설정을 저장했습니다.')
                } catch (error) {
                  console.error('[chat] 개인 설정 저장 실패', error)
                  setPreferencesError(error?.message || '개인 설정을 저장할 수 없습니다.')
                } finally {
                  setSavingPreferences(false)
                }
              }}
            >
              개인 설정 저장
            </button>
          </section>
        ) : null}
        {settingsTab === 'api' ? (
          <section style={overlayStyles.section}>
            <h3 style={overlayStyles.sectionTitle}>AI API 키 관리</h3>
            {apiKeyError ? <span style={{ fontSize: 12, color: '#fca5a5' }}>{apiKeyError}</span> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                placeholder="API 키를 입력해 주세요"
                style={{ ...overlayStyles.input, flex: 1 }}
              />
              <button
                type="button"
                style={overlayStyles.actionButton('primary', apiKeySubmitting)}
                disabled={apiKeySubmitting}
                onClick={handleAddApiKey}
              >
                추가
              </button>
            </div>
            {apiKeysLoading ? (
              <span style={overlayStyles.mutedText}>API 키를 불러오는 중...</span>
            ) : apiKeys.length ? (
              <ul style={overlayStyles.apiKeyList}>
                {apiKeys.map((entry) => (
                  <li key={entry.id} style={overlayStyles.apiKeyItem}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{entry.label || entry.modelLabel || entry.provider || '사용자 키'}</strong>
                        <span style={overlayStyles.apiKeyStatusBadge(entry.isActive)}>
                          {entry.isActive ? '사용중' : '미사용'}
                        </span>
                      </div>
                      <div style={overlayStyles.announcementMeta}>
                        {(entry.provider || 'custom').toUpperCase()} · {entry.keySample || '샘플 없음'}
                      </div>
                      <div style={overlayStyles.announcementMeta}>
                        등록: {entry.createdAt ? formatDateLabel(entry.createdAt) : '알 수 없음'}
                      </div>
                    </div>
                    <div style={overlayStyles.apiKeyActions}>
                      <button
                        type="button"
                        style={overlayStyles.secondaryButton}
                        onClick={() => handleToggleApiKey(entry, entry.isActive ? 'deactivate' : 'activate')}
                      >
                        {entry.isActive ? '사용 해제' : '사용하기'}
                      </button>
                      <button
                        type="button"
                        style={overlayStyles.secondaryButton}
                        onClick={() => handleDeleteApiKey(entry.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <span style={overlayStyles.mutedText}>등록된 API 키가 없습니다.</span>
            )}
          </section>
        ) : null}
      </div>
    </SurfaceOverlay>
  )

  const announcementListOverlay = (
    <SurfaceOverlay
      open={announcementListOpen}
      onClose={handleCloseAnnouncementList}
      title="공지 목록"
      width="min(520px, 96vw)"
      zIndex={1512}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>최근 공지를 한눈에 확인할 수 있습니다.</span>
          {viewerIsModerator ? (
            <button type="button" style={overlayStyles.secondaryButton} onClick={handleOpenAnnouncementComposer}>
              새 공지 작성
            </button>
          ) : null}
        </div>
        {announcementError ? (
          <span style={{ fontSize: 12, color: '#fca5a5' }}>{announcementError}</span>
        ) : null}
        {pinnedAnnouncement ? (
          <button
            type="button"
            style={overlayStyles.announcementListItem(true)}
            onClick={() => handleOpenAnnouncementDetail(pinnedAnnouncement)}
          >
            <strong>
              📌 {pinnedAnnouncement.title || truncateText(pinnedAnnouncement.content || '', 80).text || '제목 없는 공지'}
            </strong>
            {pinnedAnnouncement.title && pinnedAnnouncement.content ? (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {truncateText(pinnedAnnouncement.content || '', ANNOUNCEMENT_PREVIEW_LENGTH).text}
              </span>
            ) : null}
            <span style={overlayStyles.announcementMeta}>
              ♥ {pinnedAnnouncement.heart_count || 0} · 💬 {pinnedAnnouncement.comment_count || 0}
            </span>
          </button>
        ) : null}
        {nonPinnedAnnouncements.length ? (
          nonPinnedAnnouncements.map((announcement) => (
            <button
              key={announcement.id}
              type="button"
              style={overlayStyles.announcementListItem(false)}
              onClick={() => handleOpenAnnouncementDetail(announcement)}
            >
              <strong>{announcement.title || truncateText(announcement.content || '', 80).text || '제목 없는 공지'}</strong>
              {announcement.title && announcement.content ? (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  {truncateText(announcement.content || '', ANNOUNCEMENT_PREVIEW_LENGTH).text}
                </span>
              ) : null}
              <span style={overlayStyles.announcementMeta}>
                ♥ {announcement.heart_count || 0} · 💬 {announcement.comment_count || 0}
              </span>
            </button>
          ))
        ) : !pinnedAnnouncement ? (
          <span style={overlayStyles.mutedText}>등록된 공지가 없습니다.</span>
        ) : null}
        {roomAnnouncementsHasMore ? (
          <button type="button" style={overlayStyles.drawerMoreButton} onClick={handleLoadMoreAnnouncements}>
            더 보기
          </button>
        ) : null}
      </div>
    </SurfaceOverlay>
  )

  const announcementComposerOverlay = (
    <SurfaceOverlay
      open={announcementComposer.open}
      onClose={handleCloseAnnouncementComposer}
      title="새 공지 작성"
      width="min(680px, 96vw)"
      zIndex={1520}
      contentStyle={{
        paddingBottom: `calc(${ANNOUNCEMENT_TOOLBAR_OVERLAY_SAFE_PADDING}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={overlayStyles.fieldLabel}>공지 제목 (선택)</label>
          <input
            type="text"
            value={announcementComposer.title}
            onChange={(event) => handleAnnouncementTitleChange(event.target.value)}
            placeholder="예: 업데이트 안내"
            style={overlayStyles.input}
            disabled={announcementComposer.submitting}
          />
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <span style={overlayStyles.fieldLabel}>공지 이미지 (선택)</span>
          {announcementComposer.imageUrl ? (
            <div style={overlayStyles.announcementImagePreview}>
              <img
                src={announcementComposer.imageUrl}
                alt={announcementComposer.title ? `${announcementComposer.title} 이미지` : '공지 이미지 미리보기'}
                style={overlayStyles.announcementImagePreviewImage}
              />
              <button
                type="button"
                style={overlayStyles.announcementImageRemoveButton}
                onClick={handleAnnouncementImageClear}
                disabled={announcementComposer.uploading || announcementComposer.submitting}
              >
                이미지 제거
              </button>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              공지와 함께 보여줄 이미지를 선택할 수 있습니다. 최대 20MB까지 업로드할 수 있습니다.
            </span>
          )}
          <div style={overlayStyles.announcementImageUploadRow}>
            <button
              type="button"
              style={overlayStyles.imageUploadButton('primary', announcementComposer.uploading || announcementComposer.submitting)}
              onClick={handleAnnouncementImageTrigger}
              disabled={announcementComposer.uploading || announcementComposer.submitting}
            >
              {announcementComposer.uploading ? '업로드 중…' : '이미지 업로드'}
            </button>
            {announcementComposer.imageUrl ? (
              <button
                type="button"
                style={overlayStyles.imageUploadButton('ghost', announcementComposer.uploading || announcementComposer.submitting)}
                onClick={handleAnnouncementImageClear}
                disabled={announcementComposer.uploading || announcementComposer.submitting}
              >
                제거
              </button>
            ) : null}
          </div>
          <input
            ref={announcementImageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAnnouncementImageSelect}
          />
          <input
            ref={announcementAttachmentInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(event) => handleAnnouncementAttachmentSelect(event, 'image')}
          />
          <input
            ref={announcementVideoInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(event) => handleAnnouncementAttachmentSelect(event, 'video')}
          />
        </div>
        <div style={overlayStyles.announcementEditorWrapper}>
          {!getAnnouncementPlainText(announcementComposer.content || '') ? (
            <span style={overlayStyles.announcementEditorPlaceholder}>
              공지 내용을 입력해 주세요. 이미지와 동영상, 유튜브, 투표를 바로 삽입할 수 있습니다.
            </span>
          ) : null}
          <div
            ref={announcementEditorRef}
            contentEditable
            suppressContentEditableWarning
            style={overlayStyles.announcementEditor}
            onInput={handleAnnouncementEditorInput}
            onPaste={handleAnnouncementEditorPaste}
            data-placeholder="공지 내용을 입력해 주세요."
          />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#cbd5f5', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={announcementComposer.pinned}
            onChange={handleAnnouncementComposerTogglePinned}
            disabled={announcementComposer.submitting}
          />
          공지를 상단에 고정하기
        </label>
        {announcementComposer.error ? (
          <span style={{ fontSize: 12, color: '#fca5a5' }}>{announcementComposer.error}</span>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={overlayStyles.secondaryButton} onClick={handleCloseAnnouncementComposer}>
            취소
          </button>
          <button
            type="button"
            style={overlayStyles.actionButton('primary', announcementComposer.submitting)}
            disabled={announcementComposer.submitting}
            onClick={handleSubmitAnnouncement}
          >
            등록
          </button>
        </div>
      </div>
    </SurfaceOverlay>
  )

  const announcementToolbarOverlayNode = announcementComposer.open ? (
    <div
      style={overlayStyles.announcementToolbarOverlay(true)}
      aria-hidden={!announcementComposer.open}
    >
      <div
        style={overlayStyles.announcementToolbarRow}
        role="toolbar"
        aria-label="공지 서식 도구"
      >
        <button
          type="button"
          style={overlayStyles.announcementToolbarItem(false)}
          onClick={() => handleAnnouncementAttachmentTrigger('image')}
          disabled={announcementComposer.attachmentUploading || announcementComposer.submitting}
        >
          <span style={overlayStyles.announcementToolbarItemIcon}>🖼️</span>
          <span style={overlayStyles.announcementToolbarItemLabel}>이미지 첨부</span>
        </button>
        <button
          type="button"
          style={overlayStyles.announcementToolbarItem(false)}
          onClick={() => handleAnnouncementAttachmentTrigger('video')}
          disabled={announcementComposer.attachmentUploading || announcementComposer.submitting}
        >
          <span style={overlayStyles.announcementToolbarItemIcon}>🎬</span>
          <span style={overlayStyles.announcementToolbarItemLabel}>동영상 첨부</span>
        </button>
        <button
          type="button"
          style={overlayStyles.announcementToolbarItem(false)}
          onClick={handleAnnouncementYoutubeOpen}
        >
          <span style={overlayStyles.announcementToolbarItemIcon}>📺</span>
          <span style={overlayStyles.announcementToolbarItemLabel}>유튜브</span>
        </button>
        <button
          type="button"
          style={overlayStyles.announcementToolbarItem(false)}
          onClick={handleAnnouncementPollOpen}
        >
          <span style={overlayStyles.announcementToolbarItemIcon}>🗳️</span>
          <span style={overlayStyles.announcementToolbarItemLabel}>투표</span>
        </button>
        <button
          type="button"
          style={overlayStyles.announcementToolbarItem(announcementToolbarState.bold)}
          onClick={() => handleAnnouncementToolbarCommand('bold')}
          aria-pressed={announcementToolbarState.bold}
        >
          <span style={overlayStyles.announcementToolbarItemIcon}>𝐁</span>
          <span style={overlayStyles.announcementToolbarItemLabel}>굵게</span>
        </button>
        <button
          type="button"
          style={overlayStyles.announcementToolbarItem(announcementToolbarState.italic)}
          onClick={() => handleAnnouncementToolbarCommand('italic')}
          aria-pressed={announcementToolbarState.italic}
        >
          <span style={overlayStyles.announcementToolbarItemIcon}>𝑰</span>
          <span style={overlayStyles.announcementToolbarItemLabel}>기울임</span>
        </button>
        <button
          type="button"
          style={overlayStyles.announcementToolbarItem(announcementToolbarState.highlight)}
          onClick={() => handleAnnouncementToolbarCommand('highlight')}
          aria-pressed={announcementToolbarState.highlight}
        >
          <span style={overlayStyles.announcementToolbarItemIcon}>✨</span>
          <span style={overlayStyles.announcementToolbarItemLabel}>강조</span>
        </button>
        <button
          type="button"
          style={overlayStyles.announcementToolbarItem(announcementToolbarState.panel === 'color')}
          onClick={() => handleAnnouncementToolbarPanelToggle('color')}
          aria-expanded={announcementToolbarState.panel === 'color'}
        >
          <span style={overlayStyles.announcementToolbarItemIcon}>🎨</span>
          <span style={overlayStyles.announcementToolbarItemLabel}>글자색</span>
        </button>
        <button
          type="button"
          style={overlayStyles.announcementToolbarItem(announcementToolbarState.panel === 'size')}
          onClick={() => handleAnnouncementToolbarPanelToggle('size')}
          aria-expanded={announcementToolbarState.panel === 'size'}
        >
          <span style={overlayStyles.announcementToolbarItemIcon}>🔠</span>
          <span style={overlayStyles.announcementToolbarItemLabel}>글자 크기</span>
        </button>
      </div>
      {announcementToolbarState.panel === 'color' ? (
        <div style={overlayStyles.announcementToolbarPaletteRow} role="group" aria-label="글자색 선택">
          {ANNOUNCEMENT_TOOLBAR_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              style={overlayStyles.announcementToolbarColorButton(
                color,
                getColorPickerValue(color, color) === (announcementToolbarState.color || ''),
              )}
              onClick={() => handleAnnouncementColorPick(color)}
              aria-label={`글자색 ${color}`}
            />
          ))}
        </div>
      ) : null}
      {announcementToolbarState.panel === 'size' ? (
        <div style={overlayStyles.announcementToolbarSizeRow} role="group" aria-label="글자 크기 선택">
          {ANNOUNCEMENT_TOOLBAR_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              style={overlayStyles.announcementToolbarSizeButton(announcementToolbarState.size === size.id)}
              onClick={() => handleAnnouncementSizePick(size.id)}
            >
              {size.label}
            </button>
          ))}
        </div>
      ) : null}
      <div style={overlayStyles.announcementToolbarStatusRow}>
        {announcementComposer.attachmentUploading ? (
          <span>첨부 파일을 업로드하는 중입니다…</span>
        ) : (
          <span style={overlayStyles.announcementToolbarHint}>
            아이콘을 눌러 서식을 토글하면 입력하는 동안 바로 적용됩니다.
          </span>
        )}
      </div>
    </div>
  ) : null

  const announcementYoutubeOverlayNode = (
    <SurfaceOverlay
      open={announcementYoutubeOverlay.open}
      onClose={handleAnnouncementYoutubeClose}
      title="유튜브 영상 추가"
      width="min(520px, 92vw)"
      zIndex={1635}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={announcementYoutubeOverlay.query}
            onChange={(event) => handleAnnouncementYoutubeQueryChange(event.target.value)}
            placeholder="영상 제목이나 채널을 입력해 주세요"
            style={overlayStyles.input}
            disabled={announcementYoutubeOverlay.loading}
          />
          <button
            type="button"
            style={overlayStyles.secondaryButton}
            onClick={() => handleAnnouncementYoutubeSearch(announcementYoutubeOverlay.query)}
            disabled={announcementYoutubeOverlay.loading}
          >
            {announcementYoutubeOverlay.loading ? '검색 중…' : '검색'}
          </button>
        </div>
        {announcementYoutubeOverlay.error ? (
          <span style={{ fontSize: 12, color: '#fca5a5' }}>{announcementYoutubeOverlay.error}</span>
        ) : null}
        <div style={{ display: 'grid', gap: 10 }}>
          {announcementYoutubeOverlay.results.map((video) => {
            const thumb = video.thumbnail || video.thumbnailUrl || (Array.isArray(video.thumbnails) ? video.thumbnails[0]?.url : null)
            return (
              <button
                key={video.id || video.videoId || video.url || `${video.title}-${video.publishedAt || ''}`}
                type="button"
                style={overlayStyles.announcementYoutubeResult}
                onClick={() => handleAnnouncementYoutubeSelect(video)}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={video.title || '유튜브 썸네일'}
                    style={overlayStyles.announcementYoutubeThumb}
                  />
                ) : (
                  <div style={{ ...overlayStyles.announcementYoutubeThumb, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>
                    썸네일 없음
                  </div>
                )}
                <div style={overlayStyles.announcementYoutubeInfo}>
                  <strong style={{ fontSize: 13, color: '#f8fafc' }}>
                    {video.title || '제목 없는 영상'}
                  </strong>
                  {video.author ? (
                    <span style={overlayStyles.announcementMeta}>{video.author}</span>
                  ) : null}
                  {video.duration ? (
                    <span style={overlayStyles.announcementMeta}>{video.duration}</span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </SurfaceOverlay>
  )

  const announcementPollOverlayNode = (
    <SurfaceOverlay
      open={announcementPollOverlay.open}
      onClose={handleAnnouncementPollClose}
      title="투표 만들기"
      width="min(480px, 88vw)"
      zIndex={1630}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={overlayStyles.fieldLabel}>
          투표 제목
          <input
            type="text"
            value={announcementPollOverlay.question}
            onChange={(event) => handleAnnouncementPollQuestionChange(event.target.value)}
            placeholder="예: 다음 이벤트 날짜를 골라주세요"
            style={overlayStyles.input}
          />
        </label>
        <div style={overlayStyles.announcementPollOptionList}>
          {announcementPollOverlay.options.map((option, index) => (
            <div key={`poll-option-${index}`} style={overlayStyles.announcementPollOptionRow}>
              <input
                type="text"
                value={option}
                onChange={(event) => handleAnnouncementPollOptionChange(index, event.target.value)}
                placeholder={`선택지 ${index + 1}`}
                style={{ ...overlayStyles.input, flex: 1 }}
              />
              <button
                type="button"
                style={overlayStyles.secondaryButton}
                onClick={() => handleAnnouncementPollRemoveOption(index)}
                disabled={announcementPollOverlay.options.length <= ANNOUNCEMENT_POLL_MIN_OPTIONS}
              >
                제거
              </button>
            </div>
          ))}
          <button
            type="button"
            style={overlayStyles.secondaryButton}
            onClick={handleAnnouncementPollAddOption}
            disabled={announcementPollOverlay.options.length >= ANNOUNCEMENT_POLL_MAX_OPTIONS}
          >
            선택지 추가
          </button>
        </div>
        {announcementPollOverlay.error ? (
          <span style={{ fontSize: 12, color: '#fca5a5' }}>{announcementPollOverlay.error}</span>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={overlayStyles.secondaryButton} onClick={handleAnnouncementPollClose}>
            취소
          </button>
          <button
            type="button"
            style={overlayStyles.actionButton('primary', false)}
            onClick={handleAnnouncementPollSubmit}
          >
            삽입
          </button>
        </div>
      </div>
    </SurfaceOverlay>
  )

  const announcementDetailOverlay = (
    <SurfaceOverlay
      open={announcementDetail.open}
      onClose={handleCloseAnnouncementDetail}
      title="공지 상세"
      width="min(520px, 92vw)"
      zIndex={1650}
    >
      {announcementDetail.loading ? (
        <span style={overlayStyles.mutedText}>공지 내용을 불러오는 중...</span>
      ) : announcementDetail.announcement ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {announcementDetail.announcement.title ? (
              <strong style={{ color: '#e2e8f0', fontSize: 16 }}>
                {announcementDetail.announcement.title}
              </strong>
            ) : null}
            <span style={overlayStyles.announcementMeta}>
              작성: {announcementDetail.announcement.author_name || '알 수 없음'} ·{' '}
              {formatDateLabel(announcementDetail.announcement.created_at)}
            </span>
            {announcementDetail.announcement.image_url ? (
              <div style={overlayStyles.announcementImagePreview}>
                <img
                  src={announcementDetail.announcement.image_url}
                  alt={announcementDetail.announcement.title ? `${announcementDetail.announcement.title} 이미지` : '공지 이미지'}
                  style={overlayStyles.announcementImagePreviewImage}
                />
              </div>
            ) : null}
            <div
              style={overlayStyles.announcementPreviewBody}
              dangerouslySetInnerHTML={{
                __html:
                  announcementDetailHtml ||
                  '<span style="color:#94a3b8;">공지 내용이 비어 있습니다.</span>',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" style={overlayStyles.secondaryButton} onClick={handleToggleAnnouncementReaction}>
              {announcementDetail.announcement.viewer_reacted ? '하트 취소' : '하트 남기기'}
            </button>
            <span style={overlayStyles.announcementMeta}>
              ♥ {announcementDetail.announcement.heart_count || 0} · 💬{' '}
              {announcementDetail.announcement.comment_count || 0}
            </span>
            {viewerIsModerator ? (
              <button
                type="button"
                style={overlayStyles.secondaryButton}
                onClick={() => handleDeleteAnnouncement(announcementDetail.announcement)}
              >
                삭제
              </button>
            ) : null}
          </div>
          <section style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ fontSize: 12, color: '#cbd5f5' }}>댓글</h4>
            {announcementDetail.comments.length ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {announcementDetail.comments.map((comment) => (
                  <li
                    key={comment.id}
                    style={{
                      borderRadius: 12,
                      border: '1px solid rgba(71, 85, 105, 0.5)',
                      padding: '8px 12px',
                      background: 'rgba(15, 23, 42, 0.7)',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <strong style={{ fontSize: 12, color: '#e2e8f0' }}>
                      {comment.owner_name || '참여자'}
                    </strong>
                    <span style={overlayStyles.announcementMeta}>
                      {formatDateLabel(comment.created_at)}
                    </span>
                    <p style={{ color: '#cbd5f5', fontSize: 13, whiteSpace: 'pre-wrap' }}>{comment.content}</p>
                    {(viewerIsModerator ||
                      (normalizedViewerId &&
                        normalizedViewerId === normalizeId(comment.owner_id || comment.ownerId))) ? (
                      <div style={overlayStyles.announcementCommentActions}>
                        <button
                          type="button"
                          style={overlayStyles.announcementCommentDelete}
                          onClick={() => handleDeleteAnnouncementComment(comment)}
                        >
                          삭제
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <span style={overlayStyles.mutedText}>아직 댓글이 없습니다.</span>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              <textarea
                rows={3}
                value={announcementDetail.commentInput}
                onChange={(event) => handleAnnouncementCommentChange(event.target.value)}
                placeholder="댓글을 입력해 주세요."
                style={overlayStyles.textarea}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  style={overlayStyles.actionButton('primary', announcementDetail.loading)}
                  disabled={announcementDetail.loading}
                  onClick={handleSubmitAnnouncementComment}
                >
                  댓글 등록
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <span style={overlayStyles.mutedText}>공지 정보를 찾을 수 없습니다.</span>
      )}
    </SurfaceOverlay>
  )

  const banOverlay = (
    <SurfaceOverlay
      open={banModal.open}
      onClose={handleCloseBanModal}
      title="참여자 추방"
      width="min(420px, 90vw)"
    >
      {banModal.participant ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ color: '#cbd5f5', fontSize: 13 }}>
            <strong>{banModal.participant.displayName || '참여자'}</strong> 님을 추방합니다.
          </p>
          <label style={overlayStyles.fieldLabel}>
            추방 기간 (분)
            <input
              type="number"
              min="0"
              value={banModal.duration}
              onChange={(event) => handleBanDurationChange(event.target.value)}
              style={overlayStyles.input}
            />
          </label>
          <label style={overlayStyles.fieldLabel}>
            추방 사유
            <textarea
              rows={3}
              value={banModal.reason}
              onChange={(event) => handleBanReasonChange(event.target.value)}
              placeholder="선택 사항"
              style={overlayStyles.textarea}
            />
          </label>
          {banModal.error ? <span style={{ fontSize: 12, color: '#fca5a5' }}>{banModal.error}</span> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" style={overlayStyles.secondaryButton} onClick={handleCloseBanModal}>
              취소
            </button>
            <button
              type="button"
              style={overlayStyles.actionButton('primary', banModal.submitting)}
              disabled={banModal.submitting}
              onClick={handleConfirmBan}
            >
              추방하기
            </button>
          </div>
        </div>
      ) : (
        <span style={overlayStyles.mutedText}>참여자 정보를 불러오지 못했습니다.</span>
      )}
    </SurfaceOverlay>
  )

  return (
    <>
      {createRoomOverlay}
      {searchOverlay}
      {mediaPickerOverlay}
      {expandedMessageOverlay}
      {attachmentViewerOverlay}
      {friendOverlay}
      {announcementListOverlay}
      {announcementComposerOverlay}
      {announcementToolbarOverlayNode}
      {announcementYoutubeOverlayNode}
      {announcementPollOverlayNode}
      {announcementDetailOverlay}
      {banOverlay}
      {participantOverlay}
      {settingsOverlay}
      {miniOverlay.active && miniOverlayStyle ? (
        miniOverlay.mode === 'bar' ? (
          <div
            style={miniOverlayStyle}
            role="button"
            tabIndex={0}
            aria-label="간소화된 채팅 바"
            onClick={handleResumeMiniOverlay}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleResumeMiniOverlay()
              }
            }}
            onPointerDown={handleMiniOverlayPointerDown}
            onPointerMove={handleMiniOverlayPointerMove}
            onPointerUp={handleMiniOverlayPointerEnd}
            onPointerCancel={handleMiniOverlayPointerEnd}
          >
            <span style={overlayStyles.miniOverlayBarLabel}>
              {miniOverlayLabel} · {miniOverlayBarSnippet}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {miniOverlayBadge ? <span style={overlayStyles.miniOverlayBarBadge}>{miniOverlayBadge}</span> : null}
              <button
                type="button"
                style={overlayStyles.miniOverlayBarClose}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  handleCloseMiniOverlay()
                }}
                aria-label="채팅 닫기"
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <div style={miniOverlayStyle} role="dialog" aria-label="간소화된 채팅창">
            <div
              style={overlayStyles.miniOverlayHeader}
              onPointerDown={(event) => {
                const target = event.target
                if (target && typeof target.closest === 'function' && target.closest('button')) {
                  return
                }
                handleMiniOverlayPointerDown(event)
              }}
              onPointerMove={handleMiniOverlayPointerMove}
              onPointerUp={handleMiniOverlayPointerEnd}
              onPointerCancel={handleMiniOverlayPointerEnd}
            >
              <span style={overlayStyles.miniOverlayTitle}>{miniOverlayLabel}</span>
              <div style={overlayStyles.miniOverlayHeaderActions}>
                {miniOverlayBadge ? <span style={overlayStyles.miniOverlayBadge}>{miniOverlayBadge}</span> : null}
                <button
                  type="button"
                  style={overlayStyles.miniOverlayAction}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={handleCollapseMiniOverlay}
                  aria-label="채팅 바 형태로 접기"
                >
                  ⬇
                </button>
                <button
                  type="button"
                  style={overlayStyles.miniOverlayAction}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={handleRestoreToFullOverlay}
                  aria-label="전체 채팅 열기"
                >
                  ↗
                </button>
                <button
                  type="button"
                  style={overlayStyles.miniOverlayAction}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={handleCloseMiniOverlay}
                  aria-label="채팅 닫기"
                >
                  ×
                </button>
              </div>
            </div>
            <div style={overlayStyles.miniOverlayMessages}>
              {miniOverlayFeed.length ? (
                miniOverlayFeed.map((entry) =>
                  entry.type === 'date' ? (
                    <span key={entry.key} style={{ fontSize: 10, color: '#64748b', textAlign: 'center' }}>
                      {entry.label}
                    </span>
                  ) : (
                    <div key={entry.key} style={overlayStyles.miniOverlayMessageRow(entry.mine)}>
                      <div style={overlayStyles.miniOverlayMessageMeta}>
                        <span style={overlayStyles.miniOverlayMessageAuthor(entry.mine)}>{entry.author}</span>
                        {entry.timestamp ? <span>{entry.timestamp}</span> : null}
                      </div>
                      <div style={overlayStyles.miniOverlayMessageBody}>{entry.text}</div>
                    </div>
                  ),
                )
              ) : (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>최근 메시지가 없습니다.</span>
              )}
            </div>
            <div style={overlayStyles.miniOverlayComposer}>
              <textarea
                value={messageInput}
                onChange={handleMessageInputChange}
                placeholder={hasContext ? '메시지를 입력하세요' : '채팅방이 선택되지 않았습니다.'}
                style={overlayStyles.miniOverlayComposerInput}
                disabled={!hasContext || sending}
              />
              <button
                type="button"
                onClick={handleComposerSubmit}
                disabled={disableSend}
                style={overlayStyles.actionButton('primary', disableSend)}
              >
                보내기
              </button>
            </div>
            <div
              style={overlayStyles.miniOverlayResizeHandle}
              onPointerDown={handleMiniOverlayResizeStart}
              onPointerMove={handleMiniOverlayResizeMove}
              onPointerUp={handleMiniOverlayResizeEnd}
              onPointerCancel={handleMiniOverlayResizeEnd}
            >
              <div style={overlayStyles.miniOverlayResizeBar} />
            </div>
          </div>
        )
      ) : null}
      <SurfaceOverlay
        open={overlayOpen}
        onClose={onClose}
        title="채팅"
        width="min(1320px, 98vw)"
        hideHeader
        contentStyle={{
          padding: 0,
          background: 'transparent',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
        frameStyle={{
          border: 'none',
          background: 'transparent',
          boxShadow: 'none',
          maxHeight: 'none',
          height: 'auto',
          minHeight: 'auto',
        }}
        verticalAlign="flex-start"
        containerStyle={overlayContainerStyle}
        viewportHeight={overlayViewportHeight}
      >
        <div ref={rootRef} style={frameStyle}>
          <div style={rootStyle}>
            {!focused ? renderListColumn() : null}
            {focused ? renderMessageColumn() : null}
          </div>
        </div>
      </SurfaceOverlay>
    </>
  )
}
