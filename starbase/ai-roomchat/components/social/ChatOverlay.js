'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import SurfaceOverlay from '@/components/common/SurfaceOverlay'
import {
  createChatRoom,
  fetchChatDashboard,
  fetchChatRooms,
  joinChatRoom,
  leaveChatRoom,
} from '@/lib/chat/rooms'
import {
  fetchRecentMessages,
  getCurrentUser,
  insertMessage,
  subscribeToMessages,
} from '@/lib/chat/messages'
import { supabase } from '@/lib/supabase'
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
const MEDIA_LOAD_LIMIT = 120
const LONG_PRESS_THRESHOLD = 400
const ATTACHMENT_ICONS = {
  image: '🖼️',
  video: '🎬',
  file: '📄',
}

const AI_ASSISTANT_NAME = 'AI 어시스턴트'

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

function truncateText(value = '', limit = MAX_MESSAGE_PREVIEW_LENGTH) {
  if (!value) return { text: '', truncated: false }
  if (value.length <= limit) {
    return { text: value, truncated: false }
  }
  return { text: `${value.slice(0, limit)}…`, truncated: true }
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
    background: 'rgba(15, 23, 42, 0.94)',
    borderRadius: 30,
    border: '1px solid rgba(71, 85, 105, 0.45)',
    padding: '40px 0',
    minHeight: 'min(92vh, 820px)',
    display: 'flex',
    width: '100%',
    boxSizing: 'border-box',
    justifyContent: 'center',
  },
  root: (focused) => ({
    display: 'grid',
    gridTemplateColumns: focused ? 'minmax(0, 1fr)' : '300px minmax(0, 1fr)',
    gap: focused ? 14 : 16,
    height: 'min(88vh, 760px)',
    minHeight: 560,
    width: '100%',
    padding: 0,
    boxSizing: 'border-box',
  }),
  sidePanel: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    background: 'rgba(12, 20, 45, 0.92)',
    borderRadius: 22,
    border: '1px solid rgba(71, 85, 105, 0.45)',
    overflow: 'hidden',
  },
  sideTabs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
    padding: '10px 12px 8px',
    background: 'rgba(15, 23, 42, 0.96)',
  },
  sideTabButton: (active) => ({
    borderRadius: 10,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.6)'
      : '1px solid rgba(71, 85, 105, 0.5)',
    background: active ? 'rgba(37, 99, 235, 0.28)' : 'rgba(15, 23, 42, 0.7)',
    color: active ? '#e0f2fe' : '#cbd5f5',
    fontSize: 12,
    fontWeight: 600,
    padding: '8px 10px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }),
  sideContent: {
    padding: '0 14px 16px',
    overflowY: 'auto',
    display: 'grid',
    gap: 16,
    background: 'rgba(10, 16, 35, 0.65)',
  },
  section: {
    display: 'grid',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#cbd5f5',
  },
  mutedText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  heroSelector: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroPill: (active) => ({
    borderRadius: 999,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.6)'
      : '1px solid rgba(71, 85, 105, 0.5)',
    background: active ? 'rgba(37, 99, 235, 0.2)' : 'rgba(15, 23, 42, 0.7)',
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    color: active ? '#e0f2fe' : '#cbd5f5',
    cursor: 'pointer',
  }),
  roomList: {
    display: 'grid',
    gap: 10,
  },
  roomCard: (active) => ({
    borderRadius: 16,
    border: active
      ? '1px solid rgba(59, 130, 246, 0.55)'
      : '1px solid rgba(71, 85, 105, 0.45)',
    background: active ? 'rgba(30, 64, 175, 0.32)' : 'rgba(15, 23, 42, 0.6)',
    padding: '12px 14px',
    display: 'grid',
    gap: 6,
    cursor: 'pointer',
  }),
  cardTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
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
  conversation: {
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',
    borderRadius: 24,
    border: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(11, 18, 40, 0.96)',
    minHeight: 0,
    overflow: 'hidden',
  },
  conversationHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 18px',
    borderBottom: '1px solid rgba(71, 85, 105, 0.5)',
    background: 'rgba(12, 20, 45, 0.98)',
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
  messageViewport: {
    overflowY: 'auto',
    padding: '18px 0 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: 'rgba(4, 10, 28, 0.4)',
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
  messageName: (mine = false) => ({
    fontSize: 11,
    fontWeight: 700,
    color: mine ? '#bfdbfe' : '#f8fafc',
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
  messageBubble: (mine = false, variant = 'default') => {
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
    return {
      borderRadius: 12,
      border: tone.border,
      background: tone.background,
      padding: '4px 12px 6px',
      color: '#f8fafc',
      display: 'grid',
      gap: 4,
      minWidth: 0,
    }
  },
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

function derivePreviewText(record) {
  if (!record) return ''
  if (record.metadata?.plain_text) return record.metadata.plain_text
  if (record.text) return record.text
  if (record.metadata?.drafty?.txt) return record.metadata.drafty.txt
  return ''
}

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
  const [rooms, setRooms] = useState({ joined: [], available: [] })
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [dashboardError, setDashboardError] = useState(null)
  const [roomError, setRoomError] = useState(null)
  const [selectedHero, setSelectedHero] = useState(null)
  const [viewer, setViewer] = useState(null)
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
  const composerPanelRef = useRef(null)
  const composerToggleRef = useRef(null)
  const attachmentCacheRef = useRef(new Map())
  const longPressTimerRef = useRef(null)
  const longPressActiveRef = useRef(false)
  const videoControlTimerRef = useRef(null)
  const mediaPickerLongPressRef = useRef({ timer: null, active: false, id: null })
  const aiPendingMessageRef = useRef(null)

  const heroes = useMemo(() => (dashboard?.heroes ? dashboard.heroes : []), [dashboard])

  const activeRoomId = context?.type === 'chat-room' ? context.chatRoomId : null
  const viewingGlobal = context?.type === 'global'
  const activeSessionId = context?.type === 'session' ? context.sessionId : null

  const viewerToken = useMemo(() => normalizeId(viewer?.id || viewer?.owner_id), [viewer])

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
      let ownerToken = normalizeId(message.owner_id || message.user_id)
      let mine = Boolean(viewerToken && ownerToken && viewerToken === ownerToken)
      let actorToken = ownerToken || normalizeId(message.username) || `system-${index}`
      let displayName = message.username || '알 수 없음'
      let avatarUrl = message.avatar_url || null
      let initials = displayName.slice(0, 2)

      if (aiMeta?.type === 'response') {
        mine = false
        actorToken = `ai::${aiMeta.requestId || actorToken}`
        displayName = AI_ASSISTANT_NAME
        avatarUrl = null
        initials = 'AI'
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
          messages: [],
        }
        entries.push(currentGroup)
      }

      currentGroup.messages.push(message)
    })

    return entries
  }, [messages, viewerToken])

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
      if (onUnreadChange) {
        onUnreadChange(0)
      }
      return
    }

    let mounted = true

    const bootstrap = async () => {
      setLoadingDashboard(true)
      setDashboardError(null)
      try {
        const [snapshot, user] = await Promise.all([fetchChatDashboard({ limit: 24 }), getCurrentUser()])
        if (!mounted) return
        setDashboard(snapshot)
        setViewer(user)
        setSelectedHero((snapshot.heroes && snapshot.heroes[0]?.id) || null)
        setRooms({ joined: snapshot.rooms || [], available: snapshot.publicRooms || [] })
      } catch (error) {
        if (!mounted) return
        console.error('[chat] 대시보드 로드 실패:', error)
        setDashboardError(error)
      } finally {
        if (mounted) {
          setLoadingDashboard(false)
        }
      }
    }

    bootstrap()

    return () => {
      mounted = false
    }
  }, [open])

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
        setMessages(upsertMessageList([], result.messages || []))
        if (onUnreadChange) {
          onUnreadChange(0)
        }

        if (unsubscribeRef.current) {
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }

        unsubscribeRef.current = subscribeToMessages({
          onInsert: (record) => {
            setMessages((prev) => upsertMessageList(prev, record))
            const hidden = typeof document !== 'undefined' ? document.hidden : false
            if (onUnreadChange && (!context.focused || hidden)) {
              onUnreadChange((prevUnread) => Math.min(999, (prevUnread || 0) + 1))
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
  }, [open, context, viewer, onUnreadChange])

  useEffect(() => {
    if (!open) return
    const node = messageListRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, open])

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
        setRooms(snapshot)
      } catch (error) {
        console.error('[chat] 방 목록을 불러오지 못했습니다.', error)
        setRoomError(error)
      } finally {
        setLoadingRooms(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    if (activeTab === 'private' || activeTab === 'open') {
      refreshRooms()
    }
  }, [activeTab, open, refreshRooms])

  const handleSelectHero = useCallback((heroId) => {
    setSelectedHero(heroId)
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
    setComposerAttachments([])
    setAttachmentError(null)
    setAiRequest(null)
  }, [])

  const handleCreateRoom = useCallback(async () => {
    const name = window.prompt('새 비공개 채팅방 이름을 입력해 주세요.')
    if (!name) return
    try {
      await createChatRoom({ name, visibility: 'private', heroId: selectedHero || null })
      await refreshRooms()
    } catch (error) {
      console.error('[chat] 채팅방 생성 실패', error)
      alert('채팅방을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.')
    }
  }, [refreshRooms, selectedHero])

  const handleJoinRoom = useCallback(
    async (room) => {
      if (!room?.id) return
      const isGlobal = room.builtin === 'global' || normalizeId(room.id) === normalizeId(GLOBAL_ROOM.id)
      if (isGlobal) {
        handleSelectRoom({ ...GLOBAL_ROOM, ...room }, room.visibility || 'public')
        return
      }
      try {
        await joinChatRoom({ roomId: room.id, heroId: selectedHero || null })
        await refreshRooms()
        handleSelectRoom(room, room.visibility)
      } catch (error) {
        console.error('[chat] 채팅방 참여 실패', error)
        alert('채팅방에 참여할 수 없습니다.')
      }
    },
    [refreshRooms, handleSelectRoom, selectedHero],
  )

  const handleLeaveRoom = useCallback(
    async (room) => {
      if (!room?.id) return
      const isGlobal = room.builtin === 'global' || normalizeId(room.id) === normalizeId(GLOBAL_ROOM.id)
      if (isGlobal) {
        setContext((current) => (current?.type === 'global' ? null : current))
        setMessages([])
        return
      }
      const confirmLeave = window.confirm('이 채팅방에서 나가시겠습니까?')
      if (!confirmLeave) return
      try {
        await leaveChatRoom({ roomId: room.id })
        await refreshRooms()
        if (context?.type === 'chat-room' && context.chatRoomId === room.id) {
          setContext(null)
          setMessages([])
        }
      } catch (error) {
        console.error('[chat] 채팅방 나가기 실패', error)
        alert('채팅방을 나갈 수 없습니다.')
      }
    },
    [context, refreshRooms],
  )

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

  const renderInfoTab = () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={overlayStyles.section}>
        <h3 style={overlayStyles.sectionTitle}>사용할 캐릭터</h3>
        <div style={overlayStyles.heroSelector}>
          {heroes.length ? (
            heroes.map((hero) => (
              <button
                key={hero.id}
                type="button"
                onClick={() => handleSelectHero(hero.id)}
                style={overlayStyles.heroPill(selectedHero === hero.id)}
              >
                {hero.name || '이름 없는 캐릭터'}
              </button>
            ))
          ) : (
            <span style={overlayStyles.mutedText}>등록된 캐릭터가 없습니다.</span>
          )}
        </div>
      </section>
      <section style={overlayStyles.section}>
        <h3 style={overlayStyles.sectionTitle}>참여중인 세션</h3>
        <div style={overlayStyles.roomList}>
          {(dashboard?.sessions || []).map((session) => {
            const key = session.session_id || session.id
            const active = activeSessionId && key === activeSessionId
            const latest = derivePreviewText(session.latestMessage || null)
            return (
              <div
                key={key}
                style={overlayStyles.roomCard(active)}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectSession(session)}
              >
                <span style={overlayStyles.cardTitle}>{session.game_name || '매치 세션'}</span>
                <span style={overlayStyles.cardSubtitle}>{latest || '메시지를 불러옵니다.'}</span>
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

  const renderRoomList = (visibility) => {
    let list = visibility === 'open' ? rooms.available || [] : rooms.joined || []
    if (visibility === 'open') {
      const filtered = list.filter(
        (room) => normalizeId(room.id) !== normalizeId(GLOBAL_ROOM.id),
      )
      list = [GLOBAL_ROOM, ...filtered]
    }

    if (!list.length) {
      return <span style={overlayStyles.mutedText}>표시할 채팅방이 없습니다.</span>
    }

    return (
      <div style={overlayStyles.roomList}>
        {list.map((room) => {
          const roomId = normalizeId(room.id)
          const isGlobal = room.builtin === 'global' || roomId === normalizeId(GLOBAL_ROOM.id)
          const active = isGlobal ? viewingGlobal : activeRoomId === room.id
          const latest = derivePreviewText(room.latestMessage || null)
          return (
            <div
              key={room.id}
              style={overlayStyles.roomCard(active)}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectRoom(room, visibility)}
            >
              <span style={overlayStyles.cardTitle}>{room.name || '채팅방'}</span>
              <span style={overlayStyles.cardSubtitle}>{latest || '최근 메시지가 없습니다.'}</span>
              {visibility === 'open' ? (
                isGlobal ? (
                  <span style={{ ...overlayStyles.mutedText, marginTop: 6 }}>기본 채널</span>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleJoinRoom(room)
                    }}
                    style={{ ...overlayStyles.actionButton('ghost'), marginTop: 6 }}
                  >
                    참여하기
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleLeaveRoom(room)
                  }}
                  style={{ ...overlayStyles.actionButton('ghost'), marginTop: 6 }}
                >
                  나가기
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

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
            {visibility === 'private' ? (
              <button type="button" onClick={handleCreateRoom} style={overlayStyles.actionButton('ghost')}>
                새 방
              </button>
            ) : null}
          </div>
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

    return (
      <aside style={overlayStyles.sidePanel}>
        <div style={overlayStyles.sideTabs}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              style={overlayStyles.sideTabButton(activeTab === tab.key)}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={overlayStyles.sideContent}>{content}</div>
      </aside>
    )
  }

  const renderMessageColumn = () => {
    const hasContext = Boolean(context)

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

    const hasReadyAttachment = composerAttachments.some((attachment) => attachment?.status === 'ready')
    const aiActive = Boolean(aiRequest?.active)
    const disableSend =
      !hasContext ||
      sending ||
      (aiActive ? !messageInput.trim() : !messageInput.trim() && !hasReadyAttachment)
    const promptPreview = aiActive
      ? truncateText(((aiRequest?.prompt ?? messageInput) || '').trim(), 120)
      : null

    return (
      <section style={overlayStyles.conversation}>
        <header style={overlayStyles.conversationHeader}>
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
            <button
              type="button"
              onClick={onClose}
              style={overlayStyles.headerButton('primary')}
            >
              닫기
            </button>
          </div>
        </header>
        <div ref={messageListRef} style={overlayStyles.messageViewport}>
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

                const { mine, displayName, avatarUrl, initials, messages: groupMessages } = entry
                const avatarNode = !mine ? (
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
                ) : null

                return (
                  <div key={entry.key} style={overlayStyles.messageGroup(mine)}>
                    {avatarNode}
                    <div style={overlayStyles.messageContent(mine)}>
                      <span style={overlayStyles.messageName(mine)}>{displayName}</span>
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
                              <div style={overlayStyles.messageBubble(mine, bubbleVariant)}>
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
                                  <p style={overlayStyles.messageText}>{displayText || ' '}</p>
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
        <div style={overlayStyles.composerContainer}>
          {composerAttachments.length ? (
            <div style={overlayStyles.attachmentStrip}>
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
          <div style={overlayStyles.composer}>
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
      </section>
    )
  }

  const focused = Boolean(context)

  const detailAttachments = expandedMessage ? getMessageAttachments(expandedMessage) : []
  const mediaSelectionCount = mediaLibrary.selection?.size || 0
  const mediaPickerTitle = mediaLibrary.action === 'video' ? '최근 동영상' : '최근 사진'
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

  return (
    <>
      {mediaPickerOverlay}
      {expandedMessageOverlay}
      {attachmentViewerOverlay}
      <SurfaceOverlay
        open={open}
        onClose={onClose}
        title="채팅"
        width="min(1200px, 98vw)"
        hideHeader
        contentStyle={{ padding: 0, background: 'transparent' }}
        frameStyle={{ border: 'none', background: 'transparent', boxShadow: 'none' }}
      >
        <div style={overlayStyles.frame}>
          <div style={overlayStyles.root(focused)}>
            {!focused ? renderListColumn() : null}
            {renderMessageColumn()}
          </div>
        </div>
      </SurfaceOverlay>
    </>
  )
}
