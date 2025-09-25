// pages/create.js
'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../lib/supabase'
import { withTable } from '@/lib/supabaseTables'

export default function Create() {
  const router = useRouter()
  const fileRef = useRef(null)
  const backgroundRef = useRef(null)
  const bgmRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [blob, setBlob] = useState(null)
  const [backgroundPreview, setBackgroundPreview] = useState(null)
  const [backgroundBlob, setBackgroundBlob] = useState(null)
  const [backgroundError, setBackgroundError] = useState('')
  const [bgmLabel, setBgmLabel] = useState('')
  const [bgmBlob, setBgmBlob] = useState(null)
  const [bgmDuration, setBgmDuration] = useState(null)
  const [bgmError, setBgmError] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [ability1, setAbility1] = useState('')
  const [ability2, setAbility2] = useState('')
  const [ability3, setAbility3] = useState('')
  const [ability4, setAbility4] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    return () => {
      if (backgroundPreview) {
        URL.revokeObjectURL(backgroundPreview)
      }
      if (preview) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [backgroundPreview, preview])

  function sanitizeFileName(base, fallback = 'asset') {
    const safe = String(base || fallback)
      .normalize('NFKD')
      .replace(/[^\w\d-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
    return safe || fallback
  }

  async function handleFile(f) {
    if (f.type === 'image/gif' || /\.gif$/i.test(f.name || '')) {
      alert('움짤(GIF)은 사용할 수 없습니다.')
      return
    }
    const b = await f.arrayBuffer()
    const bb = new Blob([new Uint8Array(b)], { type: f.type })
    setBlob(bb)
    if (preview) {
      URL.revokeObjectURL(preview)
    }
    setPreview(URL.createObjectURL(bb))
  }

  async function handleBackgroundFile(file) {
    setBackgroundError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setBackgroundError('이미지 파일만 사용할 수 있습니다.')
      return
    }
    if (file.type === 'image/gif' || /\.gif$/i.test(file.name || '')) {
      setBackgroundError('움짤(GIF)은 배경으로 사용할 수 없습니다.')
      return
    }
    const buffer = await file.arrayBuffer()
    const blobFile = new Blob([new Uint8Array(buffer)], { type: file.type })
    if (backgroundPreview) {
      URL.revokeObjectURL(backgroundPreview)
    }
    setBackgroundBlob(blobFile)
    const url = URL.createObjectURL(blobFile)
    setBackgroundPreview(url)
  }

  async function handleBgmFile(file) {
    setBgmError('')
    setBgmLabel('')
    setBgmBlob(null)
    setBgmDuration(null)
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      setBgmError('오디오 파일만 사용할 수 있습니다.')
      return
    }
    if (/wav/i.test(file.type) || /\.wav$/i.test(file.name || '')) {
      setBgmError('용량이 큰 WAV 형식은 지원되지 않습니다.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setBgmError('파일 크기가 너무 큽니다. 15MB 이하로 줄여주세요.')
      return
    }

    const tempUrl = URL.createObjectURL(file)
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
        audio.onerror = () => {
          reject(new Error('오디오 정보를 불러올 수 없습니다.'))
        }
        audio.src = tempUrl
      })
      if (duration > 240) {
        setBgmError('BGM 길이는 4분(240초)을 넘을 수 없습니다.')
        return
      }
      const buffer = await file.arrayBuffer()
      const blobFile = new Blob([new Uint8Array(buffer)], { type: file.type })
      setBgmBlob(blobFile)
      setBgmDuration(Math.round(duration))
      setBgmLabel(file.name || '배경 음악')
    } catch (err) {
      setBgmError(err.message || '오디오를 분석할 수 없습니다.')
    } finally {
      URL.revokeObjectURL(tempUrl)
    }
  }

  async function save() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('로그인이 필요합니다.'); setLoading(false); return }

      let image_url = null
      let background_url = null
      let bgm_url = null
      let bgm_duration_seconds = null
      let bgm_mime = null
      if (blob) {
        const path = `heroes/${Date.now()}-${sanitizeFileName(name)}.jpg`
        const { error: upErr } = await supabase.storage
          .from('heroes')
          .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' })
        if (upErr) throw upErr
        image_url = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl
      }

      if (backgroundBlob) {
        const extension = (backgroundBlob.type && backgroundBlob.type.split('/')[1]) || 'jpg'
        const path = `hero-backgrounds/${Date.now()}-${sanitizeFileName(name, 'background')}.${extension}`
        const { error: bgErr } = await supabase.storage
          .from('heroes')
          .upload(path, backgroundBlob, {
            upsert: true,
            contentType: backgroundBlob.type || 'image/jpeg',
          })
        if (bgErr) throw bgErr
        background_url = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl
      }

      if (bgmBlob) {
        const extension = (bgmBlob.type && bgmBlob.type.split('/')[1]) || 'mp3'
        const path = `hero-bgm/${Date.now()}-${sanitizeFileName(name, 'bgm')}.${extension}`
        const { error: bgmErr } = await supabase.storage
          .from('heroes')
          .upload(path, bgmBlob, { upsert: true, contentType: bgmBlob.type || 'audio/mpeg' })
        if (bgmErr) throw bgmErr
        bgm_url = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl
        bgm_duration_seconds = Number.isFinite(bgmDuration) ? bgmDuration : null
        bgm_mime = bgmBlob.type || null
      }

      const { error: insErr } = await withTable(supabase, 'heroes', (table) =>
        supabase.from(table).insert({
          owner_id: user.id,
          name,
          description: desc,
          ability1,
          ability2,
          ability3,
          ability4,
          image_url,
          background_url,
          bgm_url,
          bgm_duration_seconds,
          bgm_mime,
        })
      )
      if (insErr) throw insErr

      // ✅ 저장 완료 → 로스터로 이동
      router.replace('/roster')
    } catch (e) {
      alert('저장 실패: ' + (e.message || e))
    } finally { setLoading(false) }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        backgroundImage: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        color: '#fff',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '32px 16px 140px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(15, 23, 42, 0.4)',
              color: '#e2e8f0',
              fontWeight: 600,
              backdropFilter: 'blur(8px)',
            }}
          >
            ← 로스터로
          </button>
          <h1 style={{ margin: 0, fontSize: 24 }}>새 캐릭터 만들기</h1>
          <div style={{ width: 90 }} />
        </header>

        <section
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: 24,
            padding: '24px 20px 32px',
            boxShadow: '0 24px 60px -36px rgba(15, 23, 42, 0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 260,
                height: 260,
                borderRadius: 32,
                overflow: 'hidden',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(15, 23, 42, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="미리보기"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ color: '#94a3b8', fontSize: 13 }}>이미지를 선택하세요</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: '10px 20px',
                  borderRadius: 999,
                  background: '#38bdf8',
                  color: '#0f172a',
                  fontWeight: 700,
                }}
              >
                이미지 업로드
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleFile(file)
                }}
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: 12, color: '#cbd5f5' }}>
                정사각형 이미지가 가장 잘 어울려요.
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 16,
              padding: '20px 16px',
              borderRadius: 24,
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
            }}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>배경 이미지</div>
              <div
                style={{
                  width: '100%',
                  borderRadius: 18,
                  border: '1px dashed rgba(148, 163, 184, 0.45)',
                  background: 'rgba(15, 23, 42, 0.65)',
                  minHeight: 140,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {backgroundPreview ? (
                  <img
                    src={backgroundPreview}
                    alt="배경 미리보기"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>배경 이미지를 선택하세요 (움짤 제외)</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => backgroundRef.current?.click()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    background: '#38bdf8',
                    color: '#0f172a',
                    fontWeight: 700,
                  }}
                >
                  배경 업로드
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (backgroundPreview) {
                      URL.revokeObjectURL(backgroundPreview)
                    }
                    setBackgroundBlob(null)
                    setBackgroundPreview(null)
                    setBackgroundError('')
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    background: 'rgba(148, 163, 184, 0.25)',
                    color: '#e2e8f0',
                    fontWeight: 600,
                  }}
                >
                  초기화
                </button>
              </div>
              <input
                ref={backgroundRef}
                type="file"
                accept="image/*"
                onChange={(event) => handleBackgroundFile(event.target.files?.[0] || null)}
                style={{ display: 'none' }}
              />
              {backgroundError && (
                <div style={{ color: '#fca5a5', fontSize: 12 }}>{backgroundError}</div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>배경 음악</div>
              <div
                style={{
                  borderRadius: 18,
                  border: '1px dashed rgba(148, 163, 184, 0.45)',
                  background: 'rgba(15, 23, 42, 0.65)',
                  padding: '18px 16px',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
                  {bgmLabel || '선택된 파일이 없습니다.'}
                </div>
                <div style={{ fontSize: 12, color: '#cbd5f5' }}>
                  MP3 등 스트리밍형 오디오만 지원하며 WAV 형식과 4분을 초과하는 곡은 사용할 수 없습니다.
                </div>
                {bgmDuration != null && (
                  <div style={{ fontSize: 12, color: '#38bdf8' }}>재생 시간: {bgmDuration}초</div>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => bgmRef.current?.click()}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: '#fb7185',
                      color: '#0f172a',
                      fontWeight: 700,
                    }}
                  >
                    배경 음악 업로드
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBgmBlob(null)
                      setBgmLabel('')
                      setBgmDuration(null)
                      setBgmError('')
                      if (bgmRef.current) bgmRef.current.value = ''
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 999,
                      background: 'rgba(148, 163, 184, 0.25)',
                      color: '#e2e8f0',
                      fontWeight: 600,
                    }}
                  >
                    음악 제거
                  </button>
                </div>
                <input
                  ref={bgmRef}
                  type="file"
                  accept="audio/*"
                  onChange={(event) => handleBgmFile(event.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                {bgmError && <div style={{ color: '#fca5a5', fontSize: 12 }}>{bgmError}</div>}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>이름</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="캐릭터 이름을 입력하세요"
                style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  color: '#f8fafc',
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>설명</span>
              <textarea
                value={desc}
                onChange={(event) => setDesc(event.target.value)}
                placeholder="캐릭터의 배경이나 특징을 적어 주세요"
                rows={4}
                style={{
                  padding: '14px',
                  borderRadius: 20,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(15, 23, 42, 0.55)',
                  color: '#e2e8f0',
                  resize: 'vertical',
                }}
              />
            </label>

            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>능력 1</span>
                <input
                  value={ability1}
                  onChange={(event) => setAbility1(event.target.value)}
                  placeholder="첫 번째 능력을 입력하세요"
                  style={abilityInputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>능력 2</span>
                <input
                  value={ability2}
                  onChange={(event) => setAbility2(event.target.value)}
                  placeholder="두 번째 능력"
                  style={abilityInputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>능력 3</span>
                <input
                  value={ability3}
                  onChange={(event) => setAbility3(event.target.value)}
                  placeholder="세 번째 능력"
                  style={abilityInputStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>능력 4</span>
                <input
                  value={ability4}
                  onChange={(event) => setAbility4(event.target.value)}
                  placeholder="네 번째 능력"
                  style={abilityInputStyle}
                />
              </label>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 12,
              marginTop: 12,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={save}
              disabled={loading}
              style={{
                padding: '12px 32px',
                borderRadius: 999,
                border: 'none',
                background: loading ? 'rgba(148, 163, 184, 0.35)' : '#38bdf8',
                color: '#0f172a',
                fontWeight: 800,
                fontSize: 16,
                minWidth: 180,
                transition: 'transform 0.2s ease',
              }}
            >
              {loading ? '저장 중…' : '캐릭터 생성'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              style={{
                padding: '12px 28px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.4)',
                background: 'transparent',
                color: '#cbd5f5',
                fontWeight: 600,
                minWidth: 150,
              }}
            >
              취소
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

const abilityInputStyle = {
  padding: '12px 14px',
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.55)',
  color: '#f8fafc',
}

// 
