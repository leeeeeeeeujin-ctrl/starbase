import { useCallback, useEffect, useMemo, useState } from 'react';

import styles from './AnnouncementManager.module.css';

function formatDate(value) {
  if (!value) return '게시 시각 미정';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '게시 시각 미정';
  }
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AnnouncementManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState(null);
  const [meta, setMeta] = useState({ missingTable: false });
  const [announcements, setAnnouncements] = useState([]);

  const hasForm = useMemo(() => title.trim().length > 0 && body.trim().length > 0, [title, body]);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch('/api/admin/announcements');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '공지 정보를 불러오지 못했습니다.');
      }

      const payload = await response.json();
      setMeta(payload.meta || { missingTable: false });
      setAnnouncements(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      console.error('Failed to load announcements', error);
      setStatus({ type: 'error', message: error.message || '공지 정보를 불러오지 못했습니다.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = useCallback(
    async event => {
      event.preventDefault();
      if (!hasForm || saving) {
        return;
      }

      setSaving(true);
      setStatus(null);

      try {
        const response = await fetch('/api/admin/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || '공지를 저장하지 못했습니다.');
        }

        setTitle('');
        setBody('');
        setStatus({ type: 'success', message: '새 공지를 등록했습니다.' });
        await load();
      } catch (error) {
        console.error('Failed to create announcement', error);
        setStatus({ type: 'error', message: error.message || '공지를 저장하지 못했습니다.' });
      } finally {
        setSaving(false);
      }
    },
    [body, hasForm, load, saving, title]
  );

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>공지 관리</h2>
          <p className={styles.subtitle}>
            로스터와 랜딩에서 노출되는 공지를 작성하고, 최신 순으로 정리합니다.
          </p>
        </div>
      </header>

      {meta.missingTable && (
        <div className={styles.callout} role="alert">
          <p className={styles.calloutTitle}>`rank_announcements` 테이블이 필요합니다.</p>
          <p className={styles.calloutBody}>
            <code>id uuid primary key default gen_random_uuid()</code>, <code>title text</code>,{' '}
            <code>body text</code>,<code>published_at timestamptz</code>,{' '}
            <code>created_at timestamptz default now()</code>,
            <code>updated_at timestamptz default now()</code> 컬럼을 추천합니다.
          </p>
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="announcement-title">
          제목
        </label>
        <input
          id="announcement-title"
          className={styles.input}
          type="text"
          placeholder="예: 11월 2주차 업데이트 노트"
          value={title}
          onChange={event => setTitle(event.target.value)}
          disabled={saving}
        />

        <label className={styles.label} htmlFor="announcement-body">
          본문
        </label>
        <textarea
          id="announcement-body"
          className={styles.textarea}
          rows={5}
          placeholder={`주요 변경 사항을 간단히 적어주세요.\n- 신규 모드 공개\n- 밸런스 조정`}
          value={body}
          onChange={event => setBody(event.target.value)}
          disabled={saving}
        />

        <div className={styles.actions}>
          <button className={styles.button} type="submit" disabled={!hasForm || saving}>
            {saving ? '등록 중…' : '공지 등록'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={load}
            disabled={loading || saving}
          >
            새로 고침
          </button>
        </div>

        {status && (
          <p className={status.type === 'error' ? styles.statusError : styles.statusSuccess}>
            {status.message}
          </p>
        )}
      </form>

      <div className={styles.listWrapper}>
        <h3 className={styles.listTitle}>최근 공지</h3>
        {loading ? (
          <p className={styles.empty}>공지 목록을 불러오는 중입니다…</p>
        ) : announcements.length === 0 ? (
          <p className={styles.empty}>등록된 공지가 없습니다. 첫 공지를 작성해 주세요.</p>
        ) : (
          <ul className={styles.list}>
            {announcements.map(item => (
              <li key={item.id} className={styles.listItem}>
                <div className={styles.listHeader}>
                  <p className={styles.listTitleText}>{item.title}</p>
                  <time className={styles.listTimestamp}>{formatDate(item.publishedAt)}</time>
                </div>
                <p className={styles.listBody}>{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
