import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_BACKGROUND_SIZE = 8 * 1024 * 1024

export function useHeroBackgroundManager({ setEdit }) {
  const backgroundInputRef = useRef(null)
  const [backgroundBlob, setBackgroundBlob] = useState(null)
  const [backgroundPreview, setBackgroundPreview] = useState(null)
  const [backgroundPreviewLocal, setBackgroundPreviewLocal] = useState(false)
  const [backgroundError, setBackgroundError] = useState('')

  const resetBackgroundPreview = useCallback(() => {
    if (backgroundPreviewLocal && backgroundPreview) {
      URL.revokeObjectURL(backgroundPreview)
    }
    setBackgroundPreview(null)
    setBackgroundPreviewLocal(false)
  }, [backgroundPreview, backgroundPreviewLocal])

  useEffect(() => () => resetBackgroundPreview(), [resetBackgroundPreview])

  const syncFromHero = useCallback(
    (hero) => {
      resetBackgroundPreview()
      setBackgroundBlob(null)
      setBackgroundError('')
      if (backgroundInputRef.current) {
        backgroundInputRef.current.value = ''
      }
      if (hero?.background_url) {
        setBackgroundPreview(hero.background_url)
        setBackgroundPreviewLocal(false)
      }
    },
    [resetBackgroundPreview]
  )

  const handleBackgroundUpload = useCallback(
    (file) => {
      setBackgroundError('')
      if (!file) {
        setBackgroundBlob(null)
        resetBackgroundPreview()
        setEdit((prev) => ({ ...prev, background_url: '' }))
        return
      }
      if (!file.type.startsWith('image/')) {
        setBackgroundError('이미지 파일만 업로드할 수 있습니다.')
        return
      }
      if (file.size > MAX_BACKGROUND_SIZE) {
        setBackgroundError('이미지 크기는 8MB를 넘을 수 없습니다.')
        return
      }
      resetBackgroundPreview()
      const blobFile = file.slice(0, file.size, file.type)
      const objectUrl = URL.createObjectURL(blobFile)
      setBackgroundBlob(blobFile)
      setBackgroundPreview(objectUrl)
      setBackgroundPreviewLocal(true)
      setEdit((prev) => ({ ...prev, background_url: '' }))
    },
    [resetBackgroundPreview, setEdit]
  )

  const handleClearBackground = useCallback(() => {
    resetBackgroundPreview()
    setBackgroundBlob(null)
    setBackgroundError('')
    setEdit((prev) => ({ ...prev, background_url: '' }))
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = ''
    }
  }, [resetBackgroundPreview, setEdit])

  const handleSaveComplete = useCallback(
    (nextUrl) => {
      setBackgroundBlob(null)
      setBackgroundError('')
      if (backgroundInputRef.current) {
        backgroundInputRef.current.value = ''
      }
      resetBackgroundPreview()
      if (nextUrl) {
        setBackgroundPreview(nextUrl)
        setBackgroundPreviewLocal(false)
      }
    },
    [resetBackgroundPreview]
  )

  return {
    backgroundInputRef,
    backgroundBlob,
    backgroundPreview,
    backgroundError,
    onBackgroundUpload: handleBackgroundUpload,
    onClearBackground: handleClearBackground,
    onHeroChange: syncFromHero,
    onSaveComplete: handleSaveComplete,
  }
}
