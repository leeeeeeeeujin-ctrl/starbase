import fs from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'

let driveClientPromise = null

function getSanitizedFilename(filename, fallback = 'cooldown-export') {
  const base = (filename || fallback).trim()
  const sanitized = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ')
  return sanitized || fallback
}

function getMetadataDescription(metadata) {
  if (!metadata || typeof metadata !== 'object') return undefined
  try {
    const filtered = Object.entries(metadata).reduce((acc, [key, value]) => {
      if (value === undefined || value === null) return acc
      if (typeof value === 'object') {
        acc[key] = JSON.stringify(value)
      } else {
        acc[key] = String(value)
      }
      return acc
    }, {})
    const serialized = JSON.stringify(filtered)
    if (serialized.length > 1024) {
      return serialized.slice(0, 1021) + '...'
    }
    return serialized
  } catch (error) {
    return undefined
  }
}

export function isTeamDriveUploadConfigured() {
  if (!process.env.TEAM_DRIVE_FOLDER_ID) {
    return Boolean(process.env.TEAM_DRIVE_EXPORT_DIR)
  }
  const hasDriveCredentials =
    Boolean(process.env.TEAM_DRIVE_SERVICE_ACCOUNT_EMAIL) &&
    Boolean(process.env.TEAM_DRIVE_PRIVATE_KEY)
  return hasDriveCredentials || Boolean(process.env.TEAM_DRIVE_EXPORT_DIR)
}

async function getDriveClient() {
  if (!process.env.TEAM_DRIVE_SERVICE_ACCOUNT_EMAIL || !process.env.TEAM_DRIVE_PRIVATE_KEY) {
    return null
  }

  if (!driveClientPromise) {
    driveClientPromise = (async () => {
      const { google } = await import('googleapis')
      const privateKey = process.env.TEAM_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n')
      const auth = new google.auth.JWT(
        process.env.TEAM_DRIVE_SERVICE_ACCOUNT_EMAIL,
        undefined,
        privateKey,
        ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
      )
      await auth.authorize()
      return google.drive({ version: 'v3', auth })
    })().catch((error) => {
      driveClientPromise = null
      throw error
    })
  }

  return driveClientPromise
}

export async function uploadExportToTeamDrive({ filename, mimeType, buffer, metadata }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('업로드할 데이터 버퍼가 필요합니다.')
  }

  const sanitizedFilename = getSanitizedFilename(filename)
  const folderId = process.env.TEAM_DRIVE_FOLDER_ID
  const description = getMetadataDescription(metadata)

  if (process.env.TEAM_DRIVE_EXPORT_DIR) {
    const exportDir = path.resolve(process.env.TEAM_DRIVE_EXPORT_DIR)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const finalName = sanitizedFilename.includes(timestamp)
      ? sanitizedFilename
      : `${timestamp}-${sanitizedFilename}`
    const finalPath = path.join(exportDir, finalName)
    await fs.mkdir(path.dirname(finalPath), { recursive: true })
    await fs.writeFile(finalPath, buffer)
    return {
      strategy: 'filesystem',
      path: finalPath,
    }
  }

  const drive = await getDriveClient()
  if (!drive) {
    throw new Error('Team Drive 인증 정보가 설정되지 않았습니다.')
  }

  const bodyStream = Readable.from(buffer)
  const requestBody = {
    name: sanitizedFilename,
    parents: folderId ? [folderId] : undefined,
    description,
    supportsAllDrives: true,
  }

  const media = {
    mimeType: mimeType || 'application/octet-stream',
    body: bodyStream,
  }

  const response = await drive.files.create({
    requestBody,
    media,
    fields: 'id, name, webViewLink, webContentLink, parents',
    supportsAllDrives: true,
  })

  return {
    strategy: 'google-drive',
    id: response.data?.id,
    name: response.data?.name,
    webViewLink: response.data?.webViewLink,
    webContentLink: response.data?.webContentLink,
    parents: response.data?.parents || [],
  }
}

export function resetDriveClientForTesting() {
  driveClientPromise = null
}
