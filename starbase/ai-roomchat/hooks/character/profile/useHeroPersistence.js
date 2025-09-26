import { useCallback, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'
import { sanitizeFileName } from '../../../utils/characterAssets'

export function useHeroPersistence({
  heroId,
  hero,
  getDraftSnapshot,
  applyHero,
  background,
  bgm,
  onDeleted,
  router,
}) {
  const [saving, setSaving] = useState(false)
  const { backgroundBlob, onSaveComplete: completeBackgroundSave } = background
  const { bgmBlob, bgmDuration, bgmMime, onSaveComplete: completeBgmSave } = bgm

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const edit = getDraftSnapshot()
      const baseHeroId = hero?.id || heroId
      if (!edit || !baseHeroId) {
        throw new Error('저장할 캐릭터 정보를 찾지 못했습니다.')
      }

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

      const { error: clearError } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .update({
            name: '',
            description: '',
            ability1: '',
            ability2: '',
            ability3: '',
            ability4: '',
            background_url: null,
            bgm_url: null,
            bgm_duration_seconds: null,
            bgm_mime: null,
          })
          .eq('id', baseHeroId)
      )
      if (clearError) throw clearError

      const { data: updatedHero, error } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .update(payload)
          .eq('id', baseHeroId)
          .select(
            'id,name,description,ability1,ability2,ability3,ability4,background_url,bgm_url,bgm_duration_seconds,bgm_mime,owner_id,created_at'
          )
          .single()
      )
      if (error) throw error

      const nextHero = updatedHero || { ...hero, ...payload, id: baseHeroId }
      applyHero(nextHero)

      completeBackgroundSave(backgroundUrl)
      completeBgmSave({ url: bgmUrl, duration: bgmDurationSeconds, mime: bgmMimeValue })

      alert('저장 완료')
    } catch (error) {
      alert(error.message || error)
    } finally {
      setSaving(false)
    }
  }, [
    backgroundBlob,
    completeBackgroundSave,
    completeBgmSave,
    getDraftSnapshot,
    applyHero,
    hero?.bgm_duration_seconds,
    hero?.bgm_mime,
    hero?.name,
    heroId,
    bgmBlob,
    bgmDuration,
    bgmMime,
  ])

  const handleDelete = useCallback(async () => {
    if (!confirm('정말 삭제할까? 복구할 수 없습니다.')) return
    const { error } = await withTable(supabase, 'heroes', (table) => supabase.from(table).delete().eq('id', heroId))
    if (error) {
      alert(error.message)
      return
    }
    onDeleted?.()
    router.replace('/roster')
  }, [heroId, onDeleted, router])

  return {
    saving,
    onSave: handleSave,
    onDelete: handleDelete,
  }
}
