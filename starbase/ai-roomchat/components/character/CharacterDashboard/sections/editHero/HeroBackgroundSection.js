import { modalStyles } from './styles'

export default function HeroBackgroundSection({
  backgroundSource,
  onUpload,
  onClear,
  inputRef,
  error,
}) {
  return (
    <div style={modalStyles.sectionBox}>
      <div style={modalStyles.sectionHeader}>
        <div>
          <div style={modalStyles.sectionTitle}>배경 이미지</div>
          <div style={modalStyles.sectionHelp}>JPG, PNG 등 일반 이미지 형식을 권장합니다.</div>
        </div>
        <div style={modalStyles.sectionActions}>
          <button type="button" onClick={() => inputRef.current?.click()} style={modalStyles.uploadButton}>
            배경 업로드
          </button>
          <button type="button" onClick={onClear} style={modalStyles.clearButton}>
            배경 제거
          </button>
        </div>
      </div>
      {backgroundSource ? (
        <div style={modalStyles.previewFrame}>
          <img src={backgroundSource} alt="배경 미리보기" style={modalStyles.previewImage} />
        </div>
      ) : (
        <div style={modalStyles.emptyPreview}>등록된 배경이 없습니다.</div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const node = event.target
          const file = node.files?.[0]
          if (file) {
            onUpload(file)
            node.value = ''
          }
        }}
        style={{ display: 'none' }}
      />
      {error ? <div style={modalStyles.errorText}>{error}</div> : null}
    </div>
  )
}
