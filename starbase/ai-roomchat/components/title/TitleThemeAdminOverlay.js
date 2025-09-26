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

function FileInputRow({ label, onFileSelect, accept }) {
  const inputId = React.useId()

  return (
    <div style={styles.inputRow}>
      <label htmlFor={inputId} style={styles.label}>
        {label}
      </label>
      <input
        id={inputId}
        type="file"
        accept={accept}
        onChange={async (event) => {
          const [file] = event.target.files || []
          if (!file) return
          try {
            const dataUrl = await readFileAsDataUrl(file)
            onFileSelect({ dataUrl, file })
          } catch (error) {
            console.error('파일을 읽지 못했습니다.', error)
            alert('파일을 불러오는 중 문제가 발생했습니다.')
          } finally {
            event.target.value = ''
          }
        }}
        style={styles.fileInput}
      />
    </div>
  )
}

function TextInputRow({ label, value, onChange, placeholder }) {
  const inputId = React.useId()

  return (
    <div style={styles.inputRow}>
      <label htmlFor={inputId} style={styles.label}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={styles.textInput}
      />
    </div>
  )
}

export default function TitleThemeAdminOverlay() {
  const { theme, updateTheme, adminVisible, setAdminVisible, defaultTheme } =
    useTitleThemeContext()
  const [panelOpen, setPanelOpen] = React.useState(false)

  React.useEffect(() => {
    if (!adminVisible) {
      setPanelOpen(false)
    }
  }, [adminVisible])

  if (!adminVisible) {
    return null
  }

  const handleBackgroundUpload = async ({ dataUrl, file }) => {
    updateTheme({
      backgroundImage: dataUrl,
      backgroundName: file?.name || '',
    })
  }

  const handleBgmUpload = async ({ dataUrl, file }) => {
    updateTheme({
      bgmSource: dataUrl,
      bgmName: file?.name || '',
    })
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
        {panelOpen ? '닫기' : '타이틀 편집'}
      </button>

      {panelOpen ? (
        <div style={styles.panel}>
          <header style={styles.panelHeader}>
            <div>
              <strong style={{ fontSize: 16 }}>타이틀 편집 모드</strong>
              <p style={styles.helperText}>텍스트, 이미지, 브금을 바로 수정하고 저장할 수 있습니다.</p>
            </div>
            <button
              type="button"
              onClick={() => setAdminVisible(false)}
              style={{ ...styles.secondaryButton, marginLeft: 'auto' }}
            >
              숨기기
            </button>
          </header>

          <section style={styles.section}>
            <TextInputRow
              label="타이틀"
              value={theme.titleText || ''}
              placeholder="표시할 타이틀 텍스트"
              onChange={(next) => updateTheme({ titleText: next })}
            />
            <TextInputRow
              label="부제"
              value={theme.subtitleText || ''}
              placeholder="선택 사항"
              onChange={(next) => updateTheme({ subtitleText: next })}
            />
          </section>

          <section style={styles.section}>
            <TextInputRow
              label="배경 이미지 URL"
              value={theme.backgroundImage?.startsWith('data:') ? '' : theme.backgroundImage || ''}
              placeholder="http(s)://로 시작하는 이미지 경로"
              onChange={(value) => {
                updateTheme({ backgroundImage: value || defaultTheme.backgroundImage })
              }}
            />
            <FileInputRow label="배경 이미지 업로드" accept="image/*" onFileSelect={handleBackgroundUpload} />
            {theme.backgroundName ? (
              <p style={styles.metaText}>현재 파일: {theme.backgroundName}</p>
            ) : null}
          </section>

          <section style={styles.section}>
            <TextInputRow
              label="BGM URL"
              value={theme.bgmSource?.startsWith('data:') ? '' : theme.bgmSource || ''}
              placeholder="http(s)://로 시작하는 오디오 경로"
              onChange={(value) => {
                updateTheme({ bgmSource: value })
              }}
            />
            <FileInputRow label="BGM 업로드" accept="audio/*" onFileSelect={handleBgmUpload} />
            {theme.bgmName ? <p style={styles.metaText}>현재 파일: {theme.bgmName}</p> : null}
          </section>

          <footer style={styles.footer}>
            <button
              type="button"
              onClick={() => updateTheme({
                backgroundImage: defaultTheme.backgroundImage,
                backgroundName: '',
                bgmSource: '',
                bgmName: '',
                titleText: defaultTheme.titleText,
                subtitleText: defaultTheme.subtitleText,
              })}
              style={styles.secondaryButton}
            >
              기본값으로 초기화
            </button>
            <button type="button" onClick={() => setPanelOpen(false)} style={styles.primaryButton}>
              완료
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  )
}

const styles = {
  host: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    zIndex: 4000,
    display: 'flex',
    alignItems: 'flex-end',
    gap: 16,
    pointerEvents: 'none',
  },
  fab: {
    pointerEvents: 'auto',
    border: 'none',
    borderRadius: 24,
    padding: '12px 20px',
    color: '#e2e8f0',
    fontWeight: 600,
    fontSize: 14,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.35)',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, background 0.2s ease',
  },
  panel: {
    pointerEvents: 'auto',
    width: 360,
    maxHeight: '70vh',
    overflowY: 'auto',
    borderRadius: 20,
    padding: 20,
    background: 'rgba(15, 23, 42, 0.95)',
    color: '#e2e8f0',
    boxShadow: '0 18px 48px rgba(15, 23, 42, 0.6)',
    display: 'grid',
    gap: 20,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  helperText: {
    margin: '6px 0 0',
    fontSize: 12,
    color: '#cbd5f5',
  },
  section: {
    display: 'grid',
    gap: 12,
  },
  inputRow: {
    display: 'grid',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#cbd5f5',
  },
  textInput: {
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.65)',
    padding: '10px 12px',
    color: '#e2e8f0',
    fontSize: 14,
  },
  fileInput: {
    borderRadius: 12,
    border: '1px dashed rgba(148, 163, 184, 0.5)',
    padding: '14px 12px',
    background: 'rgba(30, 41, 59, 0.6)',
    color: '#cbd5f5',
    fontSize: 13,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
  },
  primaryButton: {
    borderRadius: 999,
    border: 'none',
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryButton: {
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    padding: '10px 20px',
    background: 'rgba(15, 23, 42, 0.6)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
  metaText: {
    fontSize: 12,
    color: '#94a3b8',
  },
}

