import { useCallback, useEffect, useRef, useState } from 'react';
import { compressImage } from '@/lib/client/media/compress';

const MAX_BACKGROUND_SIZE = 8 * 1024 * 1024;

export function useHeroBackgroundManager({ setEdit }) {
  const backgroundInputRef = useRef(null);
  const localPreviewUrlRef = useRef(null);
  const [backgroundBlob, setBackgroundBlob] = useState(null);
  const [backgroundPreview, setBackgroundPreview] = useState(null);
  const [backgroundError, setBackgroundError] = useState('');

  const resetBackgroundPreview = useCallback(() => {
    const localUrl = localPreviewUrlRef.current;
    if (localUrl) {
      URL.revokeObjectURL(localUrl);
      localPreviewUrlRef.current = null;
    }
    setBackgroundPreview(prev => (prev !== null ? null : prev));
  }, []);

  useEffect(() => () => resetBackgroundPreview(), [resetBackgroundPreview]);

  const syncFromHero = useCallback(
    hero => {
      resetBackgroundPreview();
      setBackgroundBlob(null);
      setBackgroundError('');
      if (backgroundInputRef.current) {
        backgroundInputRef.current.value = '';
      }
      if (hero?.background_url) {
        localPreviewUrlRef.current = null;
        setBackgroundPreview(hero.background_url);
      }
    },
    [resetBackgroundPreview]
  );

  const handleBackgroundUpload = useCallback(
    async file => {
      setBackgroundError('');
      if (!file) {
        setBackgroundBlob(null);
        resetBackgroundPreview();
        setEdit(prev => ({ ...prev, background_url: '' }));
        return;
      }
      if (!file.type.startsWith('image/')) {
        setBackgroundError('이미지 파일만 업로드할 수 있습니다.');
        return;
      }
      try {
        // Always try to pre-compress to our standard budget; if original is too large,
        // compression may bring it under the limit.
        const compressed = await compressImage(file);
        if (compressed.size > MAX_BACKGROUND_SIZE) {
          setBackgroundError('압축 후에도 이미지가 너무 큽니다. 8MB 이하로 줄여주세요.');
          return;
        }
        resetBackgroundPreview();
        const objectUrl = URL.createObjectURL(compressed);
        localPreviewUrlRef.current = objectUrl;
        setBackgroundBlob(compressed);
        setBackgroundPreview(objectUrl);
        setEdit(prev => ({ ...prev, background_url: '' }));
      } catch (e) {
        setBackgroundError(e?.message || '이미지를 처리할 수 없습니다.');
      }
    },
    [resetBackgroundPreview, setEdit]
  );

  const handleClearBackground = useCallback(() => {
    resetBackgroundPreview();
    setBackgroundBlob(null);
    setBackgroundError('');
    setEdit(prev => ({ ...prev, background_url: '' }));
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = '';
    }
  }, [resetBackgroundPreview, setEdit]);

  const handleSaveComplete = useCallback(
    nextUrl => {
      setBackgroundBlob(null);
      setBackgroundError('');
      if (backgroundInputRef.current) {
        backgroundInputRef.current.value = '';
      }
      resetBackgroundPreview();
      if (nextUrl) {
        localPreviewUrlRef.current = null;
        setBackgroundPreview(nextUrl);
      }
    },
    [resetBackgroundPreview]
  );

  return {
    backgroundInputRef,
    backgroundBlob,
    backgroundPreview,
    backgroundError,
    onBackgroundUpload: handleBackgroundUpload,
    onClearBackground: handleClearBackground,
    onHeroChange: syncFromHero,
    onSaveComplete: handleSaveComplete,
  };
}
