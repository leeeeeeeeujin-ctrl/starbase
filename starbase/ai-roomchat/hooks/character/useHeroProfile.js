import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'
import { extractFileName, sanitizeFileName } from '../../utils/characterAssets'
import { ABILITY_KEYS } from '../../utils/characterStats'

const MAX_BACKGROUND_SIZE = 8 * 1024 * 1024
const MAX_BGM_SIZE = 10 * 1024 * 1024
const MAX_BGM_DURATION = 240

export default function useHeroProfile({ heroId, onRequireAuth, onMissingHero, onDeleted }) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hero, setHero] = useState(null)
  const [edit, setEdit] = useState({
    name: '',
    description: '',
    ability1: '',
    ability2: '',
    ability3: '',
    ability4: '',
    background_url: '',
    bgm_url: '',
  })

  const backgroundInputRef = useRef(null)
  const [backgroundBlob, setBackgroundBlob] = useState(null)
  const [backgroundPreview, setBackgroundPreview] = useState(null)
  const [backgroundPreviewLocal, setBackgroundPreviewLocal] = useState(false)
  const [backgroundError, setBackgroundError] = useState('')

  const bgmInputRef = useRef(null)
  const [bgmBlob, setBgmBlob] = useState(null)
  const [bgmLabel, setBgmLabel] = useState('')
  const [bgmDuration, setBgmDuration] = useState(null)
  const [bgmMime, setBgmMime] = useState(null)
  const [bgmError, setBgmError] = useState('')

  const resetBackgroundPreview = useCallback(() => {
    if (backgroundPreviewLocal && backgroundPreview) {
      URL.revokeObjectURL(backgroundPreview)
    }
    setBackgroundPreview(null)
    setBackgroundPreviewLocal(false)
  }, [backgroundPreview, backgroundPreviewLocal])

  useEffect(() => () => resetBackgroundPreview(), [resetBackgroundPreview])

  const applyHero = useCallback((data) => {
    setHero(data)
    setEdit({
      name: data.name || '',
      description: data.description || '',
      ability1: data.ability1 || '',
      ability2: data.ability2 || '',
      ability3: data.ability3 || '',
      ability4: data.ability4 || '',
      background_url: data.background_url || '',
      bgm_url: data.bgm_url || '',
    })
    if (data.background_url) {
      resetBackgroundPreview()
      setBackgroundPreview(data.background_url)
      setBackgroundPreviewLocal(false)
    } else {
      resetBackgroundPreview()
    }
    setBackgroundBlob(null)
    setBackgroundError('')
    setBgmBlob(null)
    setBgmLabel(data.bgm_url ? extractFileName(data.bgm_url) : '')
    setBgmDuration(data.bgm_duration_seconds || null)
    setBgmMime(data.bgm_mime || null)
    setBgmError('')
  }, [resetBackgroundPreview])

  const loadHero = useCallback(async () => {
    if (!heroId) {
      setLoading(false)
      setHero(null)
      return
    }

    setLoading(true)

    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) {
      onRequireAuth?.()
      setLoading(false)
      return
    }

    const { data, error } = await withTable(supabase, 'heroes', (table) =>
      supabase
        .from(table)
        .select(
          'id,name,image_url,description,ability1,ability2,ability3,ability4,background_url,bgm_url,bgm_duration_seconds,bgm_mime,owner_id,created_at'
        )
        .eq('id', heroId)
        .single()
    )

    if (error || !data) {
      alert('캐릭터를 불러오지 못했습니다.')
      onMissingHero?.()
      setLoading(false)
      return
    }

    applyHero(data)
    setLoading(false)
  }, [applyHero, heroId, onMissingHero, onRequireAuth])

  useEffect(() => {
    loadHero()
  }, [loadHero])

  const handleChangeEdit = useCallback((key, value) => {
    setEdit((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleAddAbility = useCallback(() => {
    const nextKey = ABILITY_KEYS.find((key) => !(edit[key] && edit[key].trim()))
    if (!nextKey) {
      alert('추가할 수 있는 빈 능력이 없습니다.')
      return
    }
    setEdit((prev) => ({ ...prev }))
  }, [edit])

  const handleReverseAbilities = useCallback(() => {
    setEdit((prev) => {
      const values = ABILITY_KEYS.map((key) => prev[key] || '')
      const reversed = [...values].reverse()
      const next = { ...prev }
      ABILITY_KEYS.forEach((key, index) => {
        next[key] = reversed[index] || ''
      })
      return next
    })
  }, [])

  const handleClearAbility = useCallback((key) => {
    setEdit((prev) => ({ ...prev, [key]: '' }))
  }, [])

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
    [resetBackgroundPreview],
  )

  const handleClearBackground = useCallback(() => {
    resetBackgroundPreview()
    setBackgroundBlob(null)
    setBackgroundError('')
    setEdit((prev) => ({ ...prev, background_url: '' }))
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = ''
    }
  }, [resetBackgroundPreview])

  const handleBgmUpload = useCallback((file) => {
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
  }, [])

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
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      let backgroundUrl = edit.background_url || null
      if (backgroundBlob) {
        const extension = (backgroundBlob.type && backgroundBlob.type.split('/')[1]) || 'jpg'
        const path = `hero-background/${Date.now()}-${sanitizeFileName(edit.name || hero?.name || 'background')}.${extension}`
        const { error: bgUploadError } = await supabase.storage
          .from('heroes')
          .upload(path, backgroundBlob, {
            upsert: true,
            contentType: backgroundBlob.type || 'image/jpeg',
          })
        if (bgUploadError) throw bgUploadError
        backgroundUrl = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl
      }

      let bgmUrl = edit.bgm_url || null
      let bgmDurationSeconds = bgmDuration != null ? bgmDuration : hero?.bgm_duration_seconds || null
      let bgmMimeValue = bgmMime || hero?.bgm_mime || null
      if (bgmBlob) {
        const extension = (bgmBlob.type && bgmBlob.type.split('/')[1]) || 'mp3'
        const path = `hero-bgm/${Date.now()}-${sanitizeFileName(edit.name || hero?.name || 'bgm')}.${extension}`
        const { error: bgmUploadError } = await supabase.storage
          .from('heroes')
          .upload(path, bgmBlob, { upsert: true, contentType: bgmBlob.type || 'audio/mpeg' })
        if (bgmUploadError) throw bgmUploadError
        bgmUrl = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl
        bgmDurationSeconds = bgmDuration != null ? bgmDuration : bgmDurationSeconds
        bgmMimeValue = bgmMime || bgmBlob.type || bgmMimeValue
      }
      if (!bgmUrl) {
        bgmDurationSeconds = null
        bgmMimeValue = null
      }

      const payload = {
        name: edit.name,
        description: edit.description,
        ability1: edit.ability1,
        ability2: edit.ability2,
        ability3: edit.ability3,
        ability4: edit.ability4,
        background_url: backgroundUrl,
        bgm_url: bgmUrl,
        bgm_duration_seconds: bgmDurationSeconds,
        bgm_mime: bgmMimeValue,
      }

      const { error } = await withTable(supabase, 'heroes', (table) =>
        supabase.from(table).update(payload).eq('id', heroId)
      )
      if (error) throw error

      setHero((prev) => (prev ? { ...prev, ...payload } : prev))
      setEdit((prev) => ({
        ...prev,
        background_url: backgroundUrl || '',
        bgm_url: bgmUrl || '',
      }))

      if (backgroundBlob) {
        setBackgroundBlob(null)
        resetBackgroundPreview()
        if (backgroundUrl) {
          setBackgroundPreview(backgroundUrl)
          setBackgroundPreviewLocal(false)
        }
      } else if (!backgroundUrl) {
        resetBackgroundPreview()
      }

      if (bgmBlob) {
        setBgmBlob(null)
      }
      setBgmLabel(bgmUrl ? extractFileName(bgmUrl) : '')
      setBgmDuration(bgmDurationSeconds)
      setBgmMime(bgmMimeValue)

      alert('저장 완료')
    } catch (error) {
      alert(error.message || error)
    } finally {
      setSaving(false)
    }
  }, [backgroundBlob, bgmBlob, bgmDuration, bgmMime, edit, hero?.bgm_duration_seconds, hero?.bgm_mime, hero?.name, heroId, resetBackgroundPreview])

  const handleDelete = useCallback(async () => {
    if (!confirm('정말 삭제할까? 복구할 수 없습니다.')) return
    const { error } = await withTable(supabase, 'heroes', (table) =>
      supabase.from(table).delete().eq('id', heroId)
    )
    if (error) {
      alert(error.message)
      return
    }
    onDeleted?.()
    router.replace('/roster')
  }, [heroId, onDeleted, router])

  return {
    loading,
    saving,
    hero,
    edit,
    backgroundInputRef,
    backgroundPreview,
    backgroundError,
    bgmInputRef,
    bgmBlob,
    bgmLabel,
    bgmDuration,
    bgmMime,
    bgmError,
    onChangeEdit: handleChangeEdit,
    onAddAbility: handleAddAbility,
    onReverseAbilities: handleReverseAbilities,
    onClearAbility: handleClearAbility,
    onBackgroundUpload: handleBackgroundUpload,
    onClearBackground: handleClearBackground,
    onBgmUpload: handleBgmUpload,
    onClearBgm: handleClearBgm,
    onSave: handleSave,
    onDelete: handleDelete,
    reload: loadHero,
  }
}

//
