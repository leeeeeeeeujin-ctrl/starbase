import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import styles from './TitleBackgroundEditor.module.css';

const MAX_FILE_SIZE = 8 * 1024 * 1024;

export default function TitleBackgroundEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [initialUrl, setInitialUrl] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(null);
  const [meta, setMeta] = useState({ missingTable: false, missingBucket: false });
  const [fileInfo, setFileInfo] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const fileInputRef = useRef(null);

  const hasChanges = useMemo(() => {
    if (pendingUpload) return true;
    return Boolean(note && note.trim());
  }, [pendingUpload, note]);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch('/api/admin/title-settings');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const supa = payload.meta?.supabase;
        const extra =
          supa?.code || supa?.message
            ? ` (supabase: ${supa?.code || ''} ${supa?.message || ''})`
            : '';
        throw new Error((payload.error || '타이틀 배경을 불러오지 못했습니다.') + extra);
      }

      const payload = await response.json();
      setMeta({
        missingTable: Boolean(payload.meta?.missingTable),
        missingBucket: Boolean(payload.meta?.missingBucket),
      });

      const nextUrl = payload.settings?.backgroundUrl || '';
      setPreviewUrl(nextUrl);
      setInitialUrl(nextUrl);
      setPendingUpload(null);
      setFileInfo(null);
      if (fileInputRef.current) {
        // eslint-disable-next-line no-param-reassign
        fileInputRef.current.value = '';
      }

      setNote('');
      setStatus(null);
    } catch (error) {
      console.error('Failed to load title settings', error);
      setStatus({ type: 'error', message: error.message || '타이틀 배경을 불러오지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFileChange = useCallback(
    event => {
      const file = event.target.files?.[0];
      setStatus(null);

      if (!file) {
        setPendingUpload(null);
        setFileInfo(null);
        setPreviewUrl(initialUrl);
        return;
      }

      if (!file.type?.startsWith('image/')) {
        setStatus({ type: 'error', message: '이미지 파일만 업로드할 수 있습니다.' });
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setStatus({
          type: 'error',
          message: '파일 용량이 너무 큽니다. 8MB 이하 이미지를 선택해주세요.',
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          setStatus({ type: 'error', message: '이미지를 불러오지 못했습니다. 다시 시도해주세요.' });
          return;
        }

        setPendingUpload({
          name: file.name || 'title-background',
          type: file.type || 'image/jpeg',
          dataUrl: result,
          size: file.size,
        });
        setFileInfo({ name: file.name || '새 배경 이미지', size: file.size });
        setPreviewUrl(result);
      };
      reader.onerror = () => {
        setStatus({ type: 'error', message: '이미지 파일을 읽는 중 오류가 발생했습니다.' });
      };
      reader.readAsDataURL(file);
    },
    [initialUrl]
  );

  const handleSubmit = useCallback(
    async event => {
      event.preventDefault();
      if (saving) return;

      setSaving(true);
      setStatus(null);

      try {
        const response = await fetch('/api/admin/title-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: pendingUpload, note }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (payload.meta) {
            setMeta({
              missingTable: Boolean(payload.meta?.missingTable),
              missingBucket: Boolean(payload.meta?.missingBucket),
            });
          }
          const supa = payload.meta?.supabase;
          const extra =
            supa?.code || supa?.message
              ? ` (supabase: ${supa?.code || ''} ${supa?.message || ''})`
              : '';
          throw new Error((payload.error || '타이틀 배경을 저장하지 못했습니다.') + extra);
        }

        setMeta({
          missingTable: Boolean(payload.meta?.missingTable),
          missingBucket: Boolean(payload.meta?.missingBucket),
        });

        const nextUrl = payload.settings?.backgroundUrl || '';
        setInitialUrl(nextUrl);
        setPreviewUrl(nextUrl);
        setNote('');
        setPendingUpload(null);
        setFileInfo(null);
        if (fileInputRef.current) {
          // eslint-disable-next-line no-param-reassign
          fileInputRef.current.value = '';
        }
        setStatus({ type: 'success', message: '타이틀 화면 배경을 저장했습니다.' });
      } catch (error) {
        console.error('Failed to save title settings', error);
        setStatus({
          type: 'error',
          message: error.message || '타이틀 배경을 저장하지 못했습니다.',
        });
      } finally {
        setSaving(false);
      }
    },
    [pendingUpload, note, saving]
  );

  const previewStyle = useMemo(() => {
    const url = previewUrl.trim();
    if (!url) {
      return {};
    }
    return {
      backgroundImage: `linear-gradient(180deg, rgba(5, 8, 21, 0.82) 0%, rgba(5, 8, 21, 0.9) 70%, rgba(5, 8, 21, 0.96) 100%), url('${url}')`,
    };
  }, [previewUrl]);

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
            <code>slug text primary key</code>, <code>background_url text</code>,{' '}
            <code>update_note text</code>,<code>updated_at timestamptz default now()</code> 컬럼을
            가진 테이블을 생성하고 기본 행으로 <code>slug='main'</code>을 준비해주세요.
          </p>
        </div>
      )}
      {meta.missingBucket && (
        <div className={styles.callout} role="alert">
          <p className={styles.calloutTitle}>`title-backgrounds` 스토리지 버킷이 필요합니다.</p>
          <p className={styles.calloutBody}>
            공개 읽기 정책이 적용된 <code>title-backgrounds</code> 버킷을 생성하고, 서비스 롤에서
            업로드할 수 있도록 권한을 열어주세요.
          </p>
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.fileField}>
          <label className={styles.label} htmlFor="title-background-file">
            배경 이미지 업로드
          </label>
          <input
            id="title-background-file"
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={loading || saving}
          />
          <p className={styles.fileHint}>
            JPG, PNG, WebP 이미지를 권장하며 최대 8MB까지 업로드할 수 있습니다. 이미지는 자동으로
            전체 화면에 맞춰집니다.
          </p>
          {fileInfo && (
            <p className={styles.fileMeta}>
              선택한 파일: <strong>{fileInfo.name}</strong>{' '}
              <span>({(fileInfo.size / (1024 * 1024)).toFixed(2)}MB)</span>
            </p>
          )}
        </div>

        <label className={styles.label} htmlFor="title-background-note">
          변경 메모 (선택)
        </label>
        <input
          id="title-background-note"
          className={styles.input}
          type="text"
          placeholder="예: 시즌 3 런칭 아트웍 적용"
          value={note}
          onChange={event => setNote(event.target.value)}
          disabled={saving}
        />

        <div className={styles.actions}>
          <button className={styles.button} type="submit" disabled={saving || !hasChanges}>
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
          <p className={status.type === 'error' ? styles.statusError : styles.statusSuccess}>
            {status.message}
          </p>
        )}
      </form>

      <div className={styles.preview} style={previewStyle}>
        <div className={styles.previewOverlay}>
          <span className={styles.previewBadge}>미리보기</span>
          <p className={styles.previewCopy}>
            솔라리스의 바다를 소개하는 타이틀 화면이 이렇게 보입니다.
          </p>
        </div>
      </div>
    </section>
  );
}
