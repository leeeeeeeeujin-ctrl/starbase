import crypto from 'crypto'

const STORAGE_BUCKET = 'title-backgrounds'
const MAX_FILE_BYTES = 8 * 1024 * 1024

import { parseCookies } from '@/lib/server/cookies'
import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'rank_admin_portal_session'
const TABLE_NAME = 'rank_title_settings'
const TITLE_SLUG = 'main'

function getConfiguredPassword() {
  const value = process.env.ADMIN_PORTAL_PASSWORD
  if (!value || !value.trim()) {
    return null
  }
  return value
}

function getSessionToken(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

function ensureAuthorised(req) {
  const password = getConfiguredPassword()
  if (!password) {
    return { ok: false, status: 500, message: 'Admin portal password is not configured' }
  }

  const cookieHeader = req.headers.cookie || ''
  const cookies = parseCookies(cookieHeader)
  const sessionToken = cookies[COOKIE_NAME]

  if (!sessionToken) {
    return { ok: false, status: 401, message: 'Missing session token' }
  }

  const expected = getSessionToken(password)
  if (sessionToken !== expected) {
    return { ok: false, status: 401, message: 'Invalid session token' }
  }

  return { ok: true }
}

function mapSettings(row) {
  if (!row) return null
  return {
    slug: row.slug,
    backgroundUrl: row.background_url || '',
    note: row.update_note || null,
    updatedAt: row.updated_at || null,
  }
}

function normaliseExtension(name, mime) {
  const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']
  const fromName = typeof name === 'string' ? name.split('.').pop()?.toLowerCase() : ''
  const fromMime = typeof mime === 'string' ? mime.split('/').pop()?.toLowerCase() : ''
  const candidate = [fromName, fromMime].find((ext) => ext && allowed.includes(ext))
  if (candidate) {
    return candidate === 'jpeg' ? 'jpg' : candidate
  }
  return 'jpg'
}

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!match) return null
  const [, mime, base64Payload] = match
  try {
    const buffer = Buffer.from(base64Payload, 'base64')
    return { mime, buffer }
  } catch (error) {
    return null
  }
}

async function handleGet(req, res) {
  const auth = ensureAuthorised(req)
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('slug, background_url, update_note, updated_at')
      .eq('slug', TITLE_SLUG)
      .limit(1)

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return res.status(200).json({ settings: null, meta: { missingTable: true, missingBucket: false } })
      }
      console.error('Failed to fetch title settings:', error)
      return res.status(500).json({ error: 'Failed to load title settings' })
    }

    const settings = Array.isArray(data) && data.length > 0 ? mapSettings(data[0]) : null
    return res.status(200).json({ settings, meta: { missingTable: false, missingBucket: false } })
  } catch (error) {
    console.error('Unexpected error when loading title settings:', error)
    return res.status(500).json({ error: 'Failed to load title settings' })
  }
}

async function handlePut(req, res) {
  const auth = ensureAuthorised(req)
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message })
  }

  try {
    const { data: existingData, error: existingError } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('slug, background_url, update_note, updated_at')
      .eq('slug', TITLE_SLUG)
      .limit(1)

    if (existingError) {
      if (isMissingSupabaseTable(existingError)) {
        return res.status(200).json({ settings: null, meta: { missingTable: true, missingBucket: false } })
      }
      console.error('Failed to load current title settings before update:', existingError)
      return res.status(500).json({ error: '타이틀 배경을 저장하지 못했습니다.' })
    }

    const currentSettings = Array.isArray(existingData) && existingData.length > 0 ? existingData[0] : null
    const { file, note } = req.body || {}
    const trimmedNote = typeof note === 'string' ? note.trim() : ''
    const normalizedNote = trimmedNote ? trimmedNote : null

    let nextBackgroundUrl = currentSettings?.background_url || ''
    let meta = { missingTable: false, missingBucket: false }

    if (file) {
      const { name, type, dataUrl } = file
      if (!type?.startsWith('image/')) {
        return res.status(400).json({ error: '이미지 파일만 업로드할 수 있습니다.' })
      }

      const decoded = decodeDataUrl(dataUrl)
      if (!decoded) {
        return res.status(400).json({ error: '이미지 파일을 해석하지 못했습니다. 다시 업로드해주세요.' })
      }

      if (decoded.buffer.length > MAX_FILE_BYTES) {
        return res
          .status(400)
          .json({ error: '파일 용량이 너무 큽니다. 8MB 이하 이미지를 업로드해주세요.', meta })
      }

      const extension = normaliseExtension(name, type || decoded.mime)
      const objectPath = `main/${Date.now()}-${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, decoded.buffer, {
          contentType: type || decoded.mime || 'image/jpeg',
          upsert: true,
        })

      if (uploadError) {
        const message = uploadError?.message || ''
        const missingBucket = /does not exist/i.test(message) || /not found/i.test(message)
        meta = { ...meta, missingBucket }
        console.error('Failed to upload title background:', uploadError)
        return res
          .status(500)
          .json({ error: missingBucket ? '스토리지 버킷을 먼저 준비해주세요.' : '배경 이미지를 업로드하지 못했습니다.', meta })
      }

      const { data: publicData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath)
      if (!publicData?.publicUrl) {
        return res
          .status(500)
          .json({ error: '업로드한 이미지를 공개 URL로 변환하지 못했습니다. 버킷 공개 정책을 확인해주세요.', meta })
      }

      nextBackgroundUrl = publicData.publicUrl
    }

    if (!nextBackgroundUrl) {
      return res.status(400).json({ error: '배경 이미지를 업로드해주세요.' })
    }

    const now = new Date().toISOString()
    const payload = {
      slug: TITLE_SLUG,
      background_url: nextBackgroundUrl,
      update_note: normalizedNote,
      updated_at: now,
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(payload, { onConflict: 'slug' })
      .select('slug, background_url, update_note, updated_at')
      .eq('slug', TITLE_SLUG)
      .limit(1)

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return res.status(200).json({ settings: null, meta: { missingTable: true, missingBucket: false } })
      }
      console.error('Failed to update title settings:', error)
      return res.status(500).json({ error: '타이틀 배경을 저장하지 못했습니다.' })
    }

    const settings = Array.isArray(data) && data.length > 0 ? mapSettings(data[0]) : null
    return res.status(200).json({ settings, meta: { missingTable: false, missingBucket: meta.missingBucket } })
  } catch (error) {
    console.error('Unexpected error when saving title settings:', error)
    return res.status(500).json({ error: '타이틀 배경을 저장하지 못했습니다.' })
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res)
  }

  if (req.method === 'PUT') {
    return handlePut(req, res)
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  return res.status(405).json({ error: 'Method Not Allowed' })
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
}
