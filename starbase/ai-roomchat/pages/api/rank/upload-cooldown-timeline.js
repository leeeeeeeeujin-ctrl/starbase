import { isTeamDriveUploadConfigured, uploadExportToTeamDrive } from '../../../lib/rank/teamDriveUploader'

function methodNotAllowed(res, methods = ['POST']) {
  res.setHeader('Allow', methods)
  res.status(405).json({ error: 'method_not_allowed' })
}

function decodeBase64File(data) {
  if (typeof data !== 'string' || !data.trim()) {
    throw new Error('파일 데이터가 비어 있습니다.')
  }
  try {
    return Buffer.from(data, 'base64')
  } catch (error) {
    throw new Error('파일 데이터를 해석하지 못했습니다.')
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    methodNotAllowed(res)
    return
  }

  const { filename, mimeType, fileData, metadata } = req.body || {}

  if (!filename || typeof filename !== 'string') {
    res.status(400).json({ error: 'invalid_filename' })
    return
  }

  if (!fileData || typeof fileData !== 'string') {
    res.status(400).json({ error: 'invalid_file_data' })
    return
  }

  const normalizedMimeType = typeof mimeType === 'string' && mimeType ? mimeType : 'application/octet-stream'

  if (!isTeamDriveUploadConfigured()) {
    res.status(202).json({ status: 'skipped', reason: 'team_drive_not_configured' })
    return
  }

  try {
    const buffer = decodeBase64File(fileData)
    const result = await uploadExportToTeamDrive({
      filename,
      mimeType: normalizedMimeType,
      buffer,
      metadata,
    })

    res.status(200).json({ status: 'uploaded', result })
  } catch (error) {
    res.status(500).json({ error: 'upload_failed', message: error.message })
  }
}
