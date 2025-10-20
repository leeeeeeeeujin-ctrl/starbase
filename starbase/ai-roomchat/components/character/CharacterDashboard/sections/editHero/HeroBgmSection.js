import { modalStyles } from './styles'

function extractFileName(url) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/')
    return parts[parts.length - 1] || url
  } catch (error) {
    const pieces = String(url).split('/')
    return pieces[pieces.length - 1] || url
  }
}

export default function HeroBgmSection({
  label,
  duration,
  fallbackUrl,
  onUpload,
  onClear,
  inputRef,
  error,
}) {
  const displayLabel = label || (fallbackUrl ? extractFileName(fallbackUrl) : '등록된 BGM이 없습니다.')

  return (
    <div style={modalStyles.sectionBox}>
      <div style={modalStyles.sectionHeader}>
        <div>
          <div style={modalStyles.sectionTitle}>배경 음악</div>
          <div style={modalStyles.sectionHelp}>
            MP3 등 스트리밍형 오디오만 지원하며 4분 이내 파일만 등록할 수 있습니다.
          </div>
        </div>
        <div style={modalStyles.sectionActions}>
          <button type="button" onClick={() => inputRef.current?.click()} style={modalStyles.musicButton}>
            음악 업로드
          </button>
          <button type="button" onClick={onClear} style={modalStyles.clearButton}>
            음악 제거
          </button>
        </div>
      </div>
      <div style={modalStyles.musicInfo}>
        <div style={modalStyles.musicLabel}>{displayLabel}</div>
        {duration != null ? <div style={modalStyles.musicDuration}>재생 시간: {duration}초</div> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        onChange={(event) => onUpload(event.target.files?.[0] || null)}
        style={{ display: 'none' }}
      />
      {error ? <div style={modalStyles.errorText}>{error}</div> : null}
    </div>
  )
}
