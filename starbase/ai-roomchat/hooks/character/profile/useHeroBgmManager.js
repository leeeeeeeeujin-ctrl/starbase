import { useCallback, useRef, useState } from 'react'

import { extractFileName } from '../../../utils/characterAssets'

const MAX_BGM_SIZE = 10 * 1024 * 1024
const MAX_BGM_DURATION = 240

export function useHeroBgmManager({ setEdit }) {
  const bgmInputRef = useRef(null)
  const [bgmBlob, setBgmBlob] = useState(null)
  const [bgmLabel, setBgmLabel] = useState('')
  const [bgmDuration, setBgmDuration] = useState(null)
  const [bgmMime, setBgmMime] = useState(null)
  const [bgmError, setBgmError] = useState('')

  const syncFromHero = useCallback((hero) => {
    setBgmBlob(null)
    setBgmLabel(hero?.bgm_url ? extractFileName(hero.bgm_url) : '')
    setBgmDuration(hero?.bgm_duration_seconds || null)
    setBgmMime(hero?.bgm_mime || null)
    setBgmError('')
    if (bgmInputRef.current) {
      bgmInputRef.current.value = ''
    }
  }, [])

  const handleBgmUpload = useCallback(
    (file) => {
      setBgmError('')
      if (!file) {
        setBgmBlob(null)
        setBgmDuration(null)
        setBgmMime(null)
        setBgmLabel('')
        setEdit((prev) => ({ ...prev, bgm_url: '' }))
        return
      }
      if (!file.type.startsWith('audio/')) {
        setBgmError('오디오 파일만 업로드할 수 있습니다.')
        return
      }
      if (file.size > MAX_BGM_SIZE) {
        setBgmError('오디오 파일은 10MB를 넘을 수 없습니다.')
        return
      }
      const tempUrl = URL.createObjectURL(file)
      ;(async () => {
        try {
          const duration = await new Promise((resolve, reject) => {
            const audio = document.createElement('audio')
            audio.preload = 'metadata'
            audio.onloadedmetadata = () => {
              if (!Number.isFinite(audio.duration)) {
                reject(new Error('재생 시간을 확인할 수 없습니다.'))
                return
              }
              resolve(audio.duration)
            }
            audio.onerror = () => reject(new Error('오디오 정보를 불러올 수 없습니다.'))
            audio.src = tempUrl
          })
          if (duration > MAX_BGM_DURATION) {
            setBgmError('BGM은 4분(240초)을 넘을 수 없습니다.')
            return
          }
          const buffer = await file.arrayBuffer()
          const blobFile = new Blob([new Uint8Array(buffer)], { type: file.type })
          setBgmBlob(blobFile)
          setBgmDuration(Math.round(duration))
          setBgmMime(file.type || null)
          setBgmLabel(file.name || '배경 음악')
          setEdit((prev) => ({ ...prev, bgm_url: '' }))
        } catch (error) {
          setBgmError(error.message || '오디오를 분석할 수 없습니다.')
        } finally {
          URL.revokeObjectURL(tempUrl)
        }
      })()
    },
    [setEdit]
  )

  const handleClearBgm = useCallback(() => {
    setBgmBlob(null)
    setBgmDuration(null)
    setBgmMime(null)
    setBgmLabel('')
    setBgmError('')
    setEdit((prev) => ({ ...prev, bgm_url: '' }))
    if (bgmInputRef.current) {
      bgmInputRef.current.value = ''
    }
  }, [setEdit])

  const handleSaveComplete = useCallback(({ url, duration, mime }) => {
    setBgmBlob(null)
    setBgmError('')
    if (bgmInputRef.current) {
      bgmInputRef.current.value = ''
    }
    setBgmLabel(url ? extractFileName(url) : '')
    setBgmDuration(duration ?? null)
    setBgmMime(mime || null)
  }, [])

  return {
    bgmInputRef,
    bgmBlob,
    bgmLabel,
    bgmDuration,
    bgmMime,
    bgmError,
    onBgmUpload: handleBgmUpload,
    onClearBgm: handleClearBgm,
    onHeroChange: syncFromHero,
    onSaveComplete: handleSaveComplete,
  }
}
