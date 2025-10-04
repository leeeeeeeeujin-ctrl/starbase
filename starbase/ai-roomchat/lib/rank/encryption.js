'use strict'

import crypto from 'crypto'

const SECRET = process.env.RANK_API_KEY_SECRET || ''

if (!SECRET.trim()) {
  throw new Error('Missing RANK_API_KEY_SECRET environment variable')
}

const KEY = crypto.createHash('sha256').update(SECRET, 'utf8').digest()
const CURRENT_VERSION = 1

export function encryptText(plainText) {
  if (typeof plainText !== 'string') {
    throw new TypeError('encryptText expects a string value')
  }

  const normalized = plainText.normalize('NFC')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    version: CURRENT_VERSION,
  }
}

export function decryptText({ ciphertext, iv, tag, version }) {
  if (version && Number(version) !== CURRENT_VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`)
  }
  if (!ciphertext || !iv || !tag) {
    throw new Error('decryptText requires ciphertext, iv, and tag')
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    KEY,
    Buffer.from(iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(tag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

