import React from 'react'

import { useTitleThemeContext } from '@/hooks/title/TitleThemeContext'

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function Section({ title, description, children }) {
  return (
    <section style={styles.section}>
      <header>
        <strong style={styles.sectionTitle}>{title}</strong>
        {description ? <p style={styles.sectionDescription}>{description}</p> : null}
      </header>
      <div style={styles.sectionBody}>{children}</div>
    </section>
  )
}

function TextInputRow({ label, value, onChange, placeholder }) {
  const inputId = React.useId()
  return (
    <label htmlFor={inputId} style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <input
        id={inputId}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        style={styles.input}
      />
    </label>
  )
}

function TextAreaRow({ label, value, onChange, placeholder, rows = 3 }) {
  const inputId = React.useId()
  return (
    <label htmlFor={inputId} style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <textarea
        id={inputId}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        style={{ ...styles.input, resize: 'vertical', minHeight: rows * 24 }}
      />
    </label>
  )
}

function FileInputRow({ label, accept, onSelect }) {
  const inputId = React.useId()
  return (
    <label htmlFor={inputId} style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <input
        id={inputId}
        type="file"
        accept={accept}
        onChange={async (event) => {
          const [file] = event.target.files || []
          if (!file) return
          try {
            const dataUrl = await readFileAsDataUrl(file)
            onSelect({ dataUrl, file })
          } catch (error) {
            console.error('파일 읽기 실패', error)
            alert('파일을 불러오는 중 문제가 발생했습니다.')
          } finally {
            event.target.value = ''
          }
        }}
        style={styles.fileInput}
      />
    </label>
  )
}

export default function TitleThemeAdminOverlay() {
  const {
    theme,
    updateTheme,
    resetTheme,
    adminVisible,
    setAdminVisible,
    defaultTheme,
    saveTheme,
    loading,
    saving,
    dirty,
  } = useTitleThemeContext()
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [statusMessage, setStatusMessage] = React.useState('')
  const [errorMessage, setErrorMessage] = React.useState('')

  React.useEffect(() => {
    if (!adminVisible) {
      setPanelOpen(false)
      setStatusMessage('')
      setErrorMessage('')
    }
  }, [adminVisible])

  if (!adminVisible) return null

  const handleBackgroundUpload = ({ dataUrl, file }) => {
    updateTheme({
      backgroundImage: dataUrl,
      backgroundName: file?.name || '',
    })
    setStatusMessage('배경 이미지가 임시로 적용되었습니다.')
    setErrorMessage('')
  }

  const handleBgmUpload = ({ dataUrl, file }) => {
    updateTheme({
      bgmSource: dataUrl,
      bgmName: file?.name || '',
    })
    setStatusMessage('BGM이 임시로 적용되었습니다.')
    setErrorMessage('')
  }

  const handleFontUpload = ({ dataUrl, file }) => {
    const inferredFamily = file?.name?.replace(/\.[^/.]+$/, '') || theme.numericFontFamily || ''
    updateTheme({
      numericFontSource: dataUrl,
      numericFontName: file?.name || '',
      numericFontFamily: inferredFamily,
    })
    setStatusMessage('숫자 폰트가 임시로 적용되었습니다.')
    setErrorMessage('')
  }

  const handleSave = async () => {
    try {
      setErrorMessage('')
      setStatusMessage('변경 사항을 저장하는 중입니다…')
      await saveTheme()
      setStatusMessage('모든 플레이어에게 적용되었습니다.')
    } catch (error) {
      console.error('타이틀 테마 저장 실패', error)
      setErrorMessage('저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')
      setStatusMessage('')
    }
  }

  const handleReset = () => {
    resetTheme()
    setStatusMessage('기본 테마가 적용되었습니다. 저장을 눌러 반영하세요.')
    setErrorMessage('')
  }

  const handleClose = () => {
    setPanelOpen(false)
  }

  const renderStatus = () => {
    if (loading) {
      return <span style={styles.statusNote}>설정을 불러오는 중…</span>
    }
    if (saving) {
      return <span style={styles.statusNote}>저장 중…</span>
    }
    if (errorMessage) {
      return <span style={{ ...styles.statusNote, color: '#fca5a5' }}>{errorMessage}</span>
    }
    if (statusMessage) {
      return <span style={styles.statusNote}>{statusMessage}</span>
    }
    if (dirty) {
      return <span style={styles.statusNote}>저장되지 않은 변경 사항이 있습니다.</span>
    }
    return <span style={{ ...styles.statusNote, color: '#94a3b8' }}>모든 플레이어와 공유되는 테마입니다.</span>
  }

  return (
    <div style={styles.host}>
      <button
        type="button"
        onClick={() => setPanelOpen((prev) => !prev)}
        style={{
          ...styles.fab,
          background: panelOpen ? '#0f172a' : '#1e293b',
        }}
      >
        {panelOpen ? '닫기' : '관리자 패널'}
      </button>

      {panelOpen ? (
        <div style={styles.panel}>
          <header style={styles.header}>
            <div>
              <strong style={styles.headerTitle}>게임 테마 관리자</strong>
              <p style={styles.headerSubtitle}>
                여기서 수정한 내용은 저장 시 모든 이용자의 UI와 사운드에 적용됩니다.
              </p>
            </div>
            <button type="button" onClick={() => setAdminVisible(false)} style={styles.secondaryButton}>
              숨기기
            </button>
          </header>

          <div style={styles.statusBar}>{renderStatus()}</div>

          <Section title="타이틀 텍스트" description="로그인 화면의 제목과 부제를 바꿉니다.">
            <TextInputRow
              label="타이틀"
              value={theme.titleText || ''}
              placeholder="게임 이름"
              onChange={(value) => updateTheme({ titleText: value })}
            />
            <TextInputRow
              label="부제"
              value={theme.subtitleText || ''}
              placeholder="선택 사항"
              onChange={(value) => updateTheme({ subtitleText: value })}
            />
            <TextAreaRow
              label="공지 메시지"
              rows={4}
              value={theme.announcement || ''}
              placeholder="유저에게 보여줄 공지 문구 (향후 공지 탭에서 활용 예정)"
              onChange={(value) => updateTheme({ announcement: value })}
            />
          </Section>

          <Section title="배경 이미지" description="전체 화면에 표시될 배경을 설정합니다.">
            <TextInputRow
              label="이미지 URL"
              value={theme.backgroundImage?.startsWith('data:') ? '' : theme.backgroundImage || ''}
              placeholder="https://로 시작하는 이미지 주소"
              onChange={(value) =>
                updateTheme({ backgroundImage: value || defaultTheme.backgroundImage, backgroundName: '' })
              }
            />
            <FileInputRow label="이미지 업로드" accept="image/*" onSelect={handleBackgroundUpload} />
            {theme.backgroundName ? (
              <p style={styles.metaText}>현재 업로드한 파일: {theme.backgroundName}</p>
            ) : null}
          </Section>

          <Section title="타이틀 BGM" description="로그인 화면에서 재생될 음악을 지정합니다.">
            <TextInputRow
              label="BGM URL"
              value={theme.bgmSource?.startsWith('data:') ? '' : theme.bgmSource || ''}
              placeholder="https://로 시작하는 오디오 주소"
              onChange={(value) => {
                updateTheme({ bgmSource: value, bgmName: '' })
                setStatusMessage(value ? 'BGM URL이 임시로 변경되었습니다.' : '')
                setErrorMessage('')
              }}
            />
            <FileInputRow label="오디오 업로드" accept="audio/*" onSelect={handleBgmUpload} />
            {theme.bgmName ? <p style={styles.metaText}>현재 업로드한 파일: {theme.bgmName}</p> : null}
          </Section>

          <Section title="인게임 숫자 폰트" description="전투/랭크 화면의 숫자 전용 서체를 지정합니다.">
            <TextInputRow
              label="폰트 패밀리"
              value={theme.numericFontFamily || ''}
              placeholder="예: Orbitron"
              onChange={(value) => updateTheme({ numericFontFamily: value })}
            />
            <TextInputRow
              label="폰트 URL"
              value={theme.numericFontSource?.startsWith('data:') ? '' : theme.numericFontSource || ''}
              placeholder="https:// 로 시작하는 웹 폰트 주소"
              onChange={(value) => {
                updateTheme({
                  numericFontSource: value,
                  numericFontName: '',
                  numericFontFamily: theme.numericFontFamily,
                })
                setStatusMessage(value ? '폰트 URL이 임시로 적용되었습니다.' : '')
                setErrorMessage('')
              }}
            />
            <FileInputRow
              label="폰트 업로드 (.woff, .woff2, .ttf, .otf)"
              accept=".woff,.woff2,.ttf,.otf,application/font-woff,application/font-woff2,font/ttf,font/otf"
              onSelect={handleFontUpload}
            />
            {theme.numericFontName ? (
              <p style={styles.metaText}>현재 업로드한 폰트: {theme.numericFontName}</p>
            ) : null}
            <div style={styles.previewBlock}>
              <span style={styles.previewLabel}>미리보기</span>
              <div data-numeric style={styles.previewDigits}>
                0123456789 · 123,456 · 98%
              </div>
            </div>
            <div style={styles.inlineActions}>
              <button
                type="button"
                onClick={() => {
                  updateTheme({ numericFontSource: '', numericFontName: '', numericFontFamily: '' })
                  setStatusMessage('숫자 폰트가 기본값으로 돌아갔습니다.')
                  setErrorMessage('')
                }}
                style={styles.linkButton}
              >
                업로드한 폰트 제거
              </button>
            </div>
          </Section>

          <footer style={styles.footer}>
            <div style={styles.footerLeft}>
              <button type="button" onClick={handleReset} style={styles.secondaryButton}>
                기본값으로 되돌리기
              </button>
            </div>
            <div style={styles.footerRight}>
              <button type="button" onClick={handleClose} style={styles.secondaryButton}>
                닫기
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  ...styles.primaryButton,
                  opacity: dirty ? 1 : 0.6,
                  cursor: dirty && !saving ? 'pointer' : 'not-allowed',
                }}
                disabled={!dirty || saving}
              >
                {saving ? '저장 중…' : '모든 이용자에게 저장'}
              </button>
            </div>
          </footer>
        </div>
      ) : null}
    </div>
  )
}

const styles = {
  host: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 4000,
    display: 'flex',
    alignItems: 'flex-end',
    gap: 16,
    pointerEvents: 'none',
  },
  fab: {
    pointerEvents: 'auto',
    border: 'none',
    borderRadius: 999,
    padding: '12px 20px',
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: 14,
    boxShadow: '0 14px 38px rgba(15, 23, 42, 0.45)',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, background 0.2s ease',
  },
  panel: {
    pointerEvents: 'auto',
    width: 420,
    maxHeight: '72vh',
    overflowY: 'auto',
    borderRadius: 20,
    padding: 24,
    background: 'rgba(15, 23, 42, 0.96)',
    color: '#e2e8f0',
    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.65)',
    display: 'grid',
    gap: 24,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
  },
  headerTitle: {
    fontSize: 18,
    margin: 0,
  },
  headerSubtitle: {
    margin: '6px 0 0',
    fontSize: 12,
    color: '#cbd5f5',
  },
  statusBar: {
    padding: '8px 12px',
    borderRadius: 12,
    background: 'rgba(30, 41, 59, 0.55)',
  },
  statusNote: {
    fontSize: 12,
    color: '#cbd5f5',
  },
  section: {
    display: 'grid',
    gap: 12,
    padding: '12px 16px',
    borderRadius: 16,
    background: 'rgba(30, 41, 59, 0.55)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
  },
  sectionTitle: {
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
  },
  sectionDescription: {
    margin: '6px 0 0',
    fontSize: 12,
    color: '#a5b4fc',
  },
  sectionBody: {
    display: 'grid',
    gap: 12,
  },
  field: {
    display: 'grid',
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#cbd5f5',
  },
  input: {
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.7)',
    padding: '10px 12px',
    color: '#e2e8f0',
    fontSize: 14,
  },
  fileInput: {
    borderRadius: 12,
    border: '1px dashed rgba(148, 163, 184, 0.45)',
    padding: '14px 12px',
    background: 'rgba(15, 23, 42, 0.5)',
    color: '#cbd5f5',
    fontSize: 13,
  },
  metaText: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  previewBlock: {
    borderRadius: 12,
    padding: '12px 14px',
    background: 'rgba(15, 23, 42, 0.6)',
    display: 'grid',
    gap: 8,
  },
  previewLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  previewDigits: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '0.08em',
  },
  inlineActions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: '#60a5fa',
    fontSize: 12,
    cursor: 'pointer',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  footerLeft: {
    display: 'flex',
  },
  footerRight: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    borderRadius: 999,
    border: 'none',
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    fontWeight: 700,
  },
  secondaryButton: {
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#cbd5f5',
    padding: '10px 18px',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
