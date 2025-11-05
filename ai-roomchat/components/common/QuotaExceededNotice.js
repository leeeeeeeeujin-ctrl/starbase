"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { subscribeQuotaExceeded } from '@/utils/quotaNotice';

export default function QuotaExceededNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const off = subscribeQuotaExceeded(() => setOpen(true));
    return () => off();
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  if (!open) return null;

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true" aria-label="스토리지 한도 초과 안내">
      <div style={styles.sheet}>
        <div style={styles.header}>⛔ 업로드가 일시 중지되었습니다</div>
        <p style={styles.body}>
          운영비 내기 싫어서 온갖 무료 할당량 있는 서버 다 끌어다 썼는데 전부 차버렸습니다.
          돈 생길 때 까지만 기다려주세요ㅜㅠ
        </p>
        <button type="button" onClick={handleClose} style={styles.button}>
          닫기
        </button>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 2000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(2, 6, 23, 0.6)', backdropFilter: 'blur(6px)'
  },
  sheet: {
    width: 'min(520px, 92vw)',
    borderRadius: 16,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.95)',
    color: '#e2e8f0',
    padding: 20,
    display: 'grid', gap: 12,
  },
  header: { fontSize: 18, fontWeight: 800, color: '#f8fafc' },
  body: { margin: 0, lineHeight: 1.7 },
  button: {
    justifySelf: 'end',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(30, 41, 59, 0.8)',
    color: '#f8fafc',
    padding: '8px 14px',
    cursor: 'pointer',
  },
};
