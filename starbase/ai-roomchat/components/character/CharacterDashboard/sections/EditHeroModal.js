import React from 'react'

export default function EditHeroModal({
  open,
  onClose,
  hero,
  edit,
  onChangeEdit,
  backgroundPreview,
  onBackgroundUpload,
  onClearBackground,
  backgroundInputRef,
  backgroundError,
  bgmLabel,
  bgmDuration,
  onBgmUpload,
  onClearBgm,
  bgmInputRef,
  bgmError,
  abilityCards,
  onAddAbility,
  onReverseAbilities,
  onClearAbility,
}) {
  if (!open) return null

  const backgroundSource = backgroundPreview || edit.background_url || hero?.background_url

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <header style={styles.header}>
          <h2 style={styles.title}>프로필 편집</h2>
          <button type="button" onClick={onClose} style={styles.closeButton}>
            닫기
          </button>
        </header>
        <div style={styles.grid}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>이름</label>
            <input
              type="text"
              value={edit.name}
              onChange={(event) => onChangeEdit('name', event.target.value)}
              style={styles.textInput}
              placeholder="영웅 이름을 입력하세요"
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>소개</label>
            <textarea
              value={edit.description}
              onChange={(event) => onChangeEdit('description', event.target.value)}
              rows={4}
              style={{ ...styles.textInput, resize: 'vertical', minHeight: 160 }}
              placeholder="영웅 소개를 입력하세요"
            />
          </div>
          <div style={styles.sectionBox}>
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.sectionTitle}>배경 이미지</div>
                <div style={styles.sectionHelp}>
                  JPG, PNG 등 일반 이미지 형식을 권장합니다.
                </div>
              </div>
              <div style={styles.sectionActions}>
                <button
                  type="button"
                  onClick={() => backgroundInputRef.current?.click()}
                  style={styles.uploadButton}
                >
                  배경 업로드
                </button>
                <button type="button" onClick={onClearBackground} style={styles.clearButton}>
                  배경 제거
                </button>
              </div>
            </div>
            {backgroundSource ? (
              <div style={styles.previewFrame}>
                <img src={backgroundSource} alt="배경 미리보기" style={styles.previewImage} />
              </div>
            ) : (
              <div style={styles.emptyPreview}>등록된 배경이 없습니다.</div>
            )}
            <input
              ref={backgroundInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => onBackgroundUpload(event.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            {backgroundError ? <div style={styles.errorText}>{backgroundError}</div> : null}
          </div>
          <div style={styles.sectionBox}>
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.sectionTitle}>배경 음악</div>
                <div style={styles.sectionHelp}>
                  MP3 등 스트리밍형 오디오만 지원하며 4분 이내 파일만 등록할 수 있습니다.
                </div>
              </div>
              <div style={styles.sectionActions}>
                <button type="button" onClick={() => bgmInputRef.current?.click()} style={styles.musicButton}>
                  음악 업로드
                </button>
                <button type="button" onClick={onClearBgm} style={styles.clearButton}>
                  음악 제거
                </button>
              </div>
            </div>
            <div style={styles.musicInfo}>
              <div style={styles.musicLabel}>
                {bgmLabel || (edit.bgm_url ? extractFileName(edit.bgm_url) : '등록된 BGM이 없습니다.')}
              </div>
              {bgmDuration != null ? (
                <div style={styles.musicDuration}>재생 시간: {bgmDuration}초</div>
              ) : null}
            </div>
            <input
              ref={bgmInputRef}
              type="file"
              accept="audio/*"
              onChange={(event) => onBgmUpload(event.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            {bgmError ? <div style={styles.errorText}>{bgmError}</div> : null}
          </div>
          <div style={styles.abilityGrid}>
            {abilityCards.map((ability, index) => (
              <div key={ability.key} style={styles.abilityCard}>
                <div style={styles.abilityHeader}>
                  <span style={styles.abilityTitle}>능력 {index + 1}</span>
                  {ability.value ? (
                    <button
                      type="button"
                      onClick={() => onClearAbility(ability.key)}
                      style={styles.removeAbility}
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
                <textarea
                  value={ability.value}
                  onChange={(event) => onChangeEdit(ability.key, event.target.value)}
                  rows={4}
                  style={{ ...styles.textInput, resize: 'vertical', minHeight: 140 }}
                  placeholder="능력 설명을 입력하세요."
                />
              </div>
            ))}
          </div>
          <div style={styles.abilityActions}>
            <button type="button" onClick={onAddAbility} style={styles.addAbility}>
              능력 생성
            </button>
            <button type="button" onClick={onReverseAbilities} style={styles.reorderAbility}>
              능력 순서 수정
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

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

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2, 6, 23, 0.88)',
    zIndex: 10,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '32px 16px',
  },
  modal: {
    width: '100%',
    maxWidth: 960,
    maxHeight: '90vh',
    overflowY: 'auto',
    borderRadius: 32,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(2, 6, 23, 0.96)',
    padding: 28,
    display: 'grid',
    gap: 24,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { margin: 0, fontSize: 24 },
  closeButton: {
    padding: '8px 16px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.65)',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  grid: { display: 'grid', gap: 20 },
  inputGroup: { display: 'grid', gap: 8 },
  label: { fontSize: 14, fontWeight: 600 },
  textInput: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.72)',
    color: '#e2e8f0',
    fontSize: 15,
    lineHeight: 1.6,
  },
  sectionBox: {
    display: 'grid',
    gap: 12,
    borderRadius: 24,
    padding: 18,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.6)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: { fontWeight: 700, fontSize: 14 },
  sectionHelp: { fontSize: 12, color: '#94a3b8' },
  sectionActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  uploadButton: {
    padding: '8px 16px',
    borderRadius: 999,
    background: '#38bdf8',
    color: '#0f172a',
    fontWeight: 700,
    border: 'none',
  },
  musicButton: {
    padding: '8px 16px',
    borderRadius: 999,
    background: '#fb7185',
    color: '#0f172a',
    fontWeight: 700,
    border: 'none',
  },
  clearButton: {
    padding: '8px 16px',
    borderRadius: 999,
    background: 'rgba(148, 163, 184, 0.25)',
    color: '#e2e8f0',
    fontWeight: 600,
    border: 'none',
  },
  previewFrame: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    border: '1px solid rgba(56, 189, 248, 0.35)',
  },
  previewImage: { width: '100%', display: 'block' },
  emptyPreview: {
    padding: 40,
    borderRadius: 18,
    border: '1px dashed rgba(148, 163, 184, 0.35)',
    textAlign: 'center',
    color: '#94a3b8',
  },
  musicInfo: { display: 'grid', gap: 8 },
  musicLabel: { fontSize: 13, color: '#e2e8f0', fontWeight: 600 },
  musicDuration: { fontSize: 12, color: '#38bdf8' },
  errorText: { color: '#fca5a5', fontSize: 12 },
  abilityGrid: { display: 'grid', gap: 16 },
  abilityCard: {
    borderRadius: 24,
    padding: 18,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'linear-gradient(180deg, rgba(30, 64, 175, 0.28) 0%, rgba(15, 23, 42, 0.92) 100%)',
    display: 'grid',
    gap: 10,
  },
  abilityHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  abilityTitle: { fontWeight: 700 },
  removeAbility: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(248, 113, 113, 0.4)',
    background: 'rgba(248, 113, 113, 0.16)',
    color: '#fecaca',
    fontWeight: 600,
  },
  abilityActions: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  addAbility: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(56, 189, 248, 0.55)',
    background: 'rgba(56, 189, 248, 0.18)',
    color: '#38bdf8',
    fontWeight: 700,
  },
  reorderAbility: {
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.65)',
    color: '#e2e8f0',
    fontWeight: 700,
  },
}

//
