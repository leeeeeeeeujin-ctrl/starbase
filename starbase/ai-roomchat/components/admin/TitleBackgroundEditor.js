import { useCallback, useEffect, useMemo, useState } from 'react'

import styles from './TitleBackgroundEditor.module.css'

export default function TitleBackgroundEditor() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [initialUrl, setInitialUrl] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState(null)
  const [meta, setMeta] = useState({ missingTable: false })

  const hasChanges = useMemo(() => backgroundUrl.trim() !== initialUrl.trim() || (note && note.trim()), [backgroundUrl, initialUrl, note])

  const load = useCallback(async () => {
    setLoading(true)
    setStatus(null)

    try {
      const response = await fetch('/api/admin/title-settings')
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || '타이틀 배경을 불러오지 못했습니다.')
      }

      const payload = await response.json()
      setMeta(payload.meta || { missingTable: false })

      if (payload.settings?.backgroundUrl) {
        setBackgroundUrl(payload.settings.backgroundUrl)
        setInitialUrl(payload.settings.backgroundUrl)
      } else {
        setBackgroundUrl('')
        setInitialUrl('')
      }

      setNote('')
      setStatus(null)
    } catch (error) {
      console.error('Failed to load title settings', error)
      setStatus({ type: 'error', message: error.message || '타이틀 배경을 불러오지 못했습니다.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      if (saving) return

      setSaving(true)
      setStatus(null)

      try {
        const response = await fetch('/api/admin/title-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backgroundUrl, note }),
        })

        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(payload.error || '타이틀 배경을 저장하지 못했습니다.')
        }

        setMeta(payload.meta || { missingTable: false })

        if (payload.settings?.backgroundUrl) {
          setInitialUrl(payload.settings.backgroundUrl)
          setBackgroundUrl(payload.settings.backgroundUrl)
        }
        setNote('')
        setStatus({ type: 'success', message: '타이틀 화면 배경을 저장했습니다.' })
      } catch (error) {
        console.error('Failed to save title settings', error)
        setStatus({ type: 'error', message: error.message || '타이틀 배경을 저장하지 못했습니다.' })
      } finally {
        setSaving(false)
      }
    },
    [backgroundUrl, note, saving],
  )

  const previewStyle = useMemo(() => {
    const url = backgroundUrl.trim()
    if (!url) {
      return {}
    }
    return {
      backgroundImage: `linear-gradient(180deg, rgba(5, 8, 21, 0.82) 0%, rgba(5, 8, 21, 0.9) 70%, rgba(5, 8, 21, 0.96) 100%), url('${url}')`,
    }
  }, [backgroundUrl])

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>타이틀 화면 배경</h2>
          <p className={styles.subtitle}>
            랜딩 히어로의 배경 이미지를 교체하고, 변경 의도를 간단히 남겨두세요.
          </p>
        </div>
      </header>

      {meta.missingTable && (
        <div className={styles.callout} role="alert">
          <p className={styles.calloutTitle}>`rank_title_settings` 테이블이 필요합니다.</p>
          <p className={styles.calloutBody}>
            <code>slug text primary key</code>, <code>background_url text</code>, <code>update_note text</code>,
            <code>updated_at timestamptz default now()</code> 컬럼을 가진 테이블을 생성하고 기본 행으로 <code>slug='main'</code>을 준비해주세요.
          </p>
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="title-background-url">
          배경 이미지 URL
        </label>
        <input
          id="title-background-url"
          className={styles.input}
          type="url"
          placeholder="https://example.com/background.jpg"
          value={backgroundUrl}
          onChange={(event) => setBackgroundUrl(event.target.value)}
          disabled={loading || saving}
        />

        <label className={styles.label} htmlFor="title-background-note">
          변경 메모 (선택)
        </label>
        <input
          id="title-background-note"
          className={styles.input}
          type="text"
          placeholder="예: 시즌 3 런칭 아트웍 적용"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={saving}
        />

        <div className={styles.actions}>
          <button className={styles.button} type="submit" disabled={saving || !backgroundUrl.trim() || !hasChanges}>
            {saving ? '저장 중…' : '배경 저장'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={load}
            disabled={loading || saving}
          >
            다시 불러오기
          </button>
        </div>

        {status && (
          <p className={status.type === 'error' ? styles.statusError : styles.statusSuccess}>{status.message}</p>
        )}
      </form>

      <div className={styles.preview} style={previewStyle}>
        <div className={styles.previewOverlay}>
          <span className={styles.previewBadge}>미리보기</span>
          <p className={styles.previewCopy}>솔라리스의 바다를 소개하는 타이틀 화면이 이렇게 보입니다.</p>
        </div>
      </div>
    </section>
  )
}
