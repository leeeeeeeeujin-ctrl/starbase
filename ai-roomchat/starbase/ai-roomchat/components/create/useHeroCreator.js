'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../../lib/supabase';
import { withTable } from '../../lib/supabaseTables';

function revokeUrl(url) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export function useHeroCreator({ onSaved } = {}) {
  const [preview, setPreview] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);

  const [backgroundPreview, setBackgroundPreview] = useState(null);
  const [backgroundBlob, setBackgroundBlob] = useState(null);
  const [backgroundError, setBackgroundError] = useState('');

  const [bgmLabel, setBgmLabel] = useState('');
  const [bgmBlob, setBgmBlob] = useState(null);
  const [bgmDuration, setBgmDuration] = useState(null);
  const [bgmError, setBgmError] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ability1, setAbility1] = useState('');
  const [ability2, setAbility2] = useState('');
  const [ability3, setAbility3] = useState('');
  const [ability4, setAbility4] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      revokeUrl(preview);
      revokeUrl(backgroundPreview);
    };
  }, [preview, backgroundPreview]);

  const sanitizeFileName = useCallback((base, fallback = 'asset') => {
    const safe = String(base || fallback)
      .normalize('NFKD')
      .replace(/[^\w\d-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return safe || fallback;
  }, []);

  const selectImage = useCallback(
    async file => {
      if (!file) return;
      if (file.type === 'image/gif' || /\.gif$/i.test(file.name || '')) {
        alert('움짤(GIF)은 사용할 수 없습니다.');
        return;
      }
      const buffer = await file.arrayBuffer();
      const blob = new Blob([new Uint8Array(buffer)], { type: file.type });
      if (preview) {
        revokeUrl(preview);
      }
      setImageBlob(blob);
      setPreview(URL.createObjectURL(blob));
    },
    [preview]
  );

  const clearBackground = useCallback(() => {
    revokeUrl(backgroundPreview);
    setBackgroundBlob(null);
    setBackgroundPreview(null);
    setBackgroundError('');
  }, [backgroundPreview]);

  const selectBackground = useCallback(
    async file => {
      setBackgroundError('');
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setBackgroundError('이미지 파일만 사용할 수 있습니다.');
        return;
      }
      if (file.type === 'image/gif' || /\.gif$/i.test(file.name || '')) {
        setBackgroundError('움짤(GIF)은 배경으로 사용할 수 없습니다.');
        return;
      }
      const buffer = await file.arrayBuffer();
      const blob = new Blob([new Uint8Array(buffer)], { type: file.type });
      if (backgroundPreview) {
        revokeUrl(backgroundPreview);
      }
      setBackgroundBlob(blob);
      setBackgroundPreview(URL.createObjectURL(blob));
    },
    [backgroundPreview]
  );

  const clearBgm = useCallback(() => {
    setBgmBlob(null);
    setBgmLabel('');
    setBgmDuration(null);
    setBgmError('');
  }, []);

  const selectBgm = useCallback(
    async file => {
      clearBgm();
      if (!file) return;
      if (!file.type.startsWith('audio/')) {
        setBgmError('오디오 파일만 사용할 수 있습니다.');
        return;
      }
      if (/wav/i.test(file.type) || /\.wav$/i.test(file.name || '')) {
        setBgmError('용량이 큰 WAV 형식은 지원되지 않습니다.');
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setBgmError('파일 크기가 너무 큽니다. 15MB 이하로 줄여주세요.');
        return;
      }
      const tempUrl = URL.createObjectURL(file);
      try {
        const duration = await new Promise((resolve, reject) => {
          const audio = document.createElement('audio');
          audio.preload = 'metadata';
          audio.onloadedmetadata = () => {
            if (!Number.isFinite(audio.duration)) {
              reject(new Error('재생 시간을 확인할 수 없습니다.'));
              return;
            }
            resolve(audio.duration);
          };
          audio.onerror = () => {
            reject(new Error('오디오 정보를 불러올 수 없습니다.'));
          };
          audio.src = tempUrl;
        });
        if (duration > 240) {
          setBgmError('BGM 길이는 4분(240초)을 넘을 수 없습니다.');
          return;
        }
        const buffer = await file.arrayBuffer();
        const blob = new Blob([new Uint8Array(buffer)], { type: file.type });
        setBgmBlob(blob);
        setBgmDuration(Math.round(duration));
        setBgmLabel(file.name || '배경 음악');
      } catch (error) {
        setBgmError(error.message || '오디오를 분석할 수 없습니다.');
      } finally {
        URL.revokeObjectURL(tempUrl);
      }
    },
    [clearBgm]
  );

  const save = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert('로그인이 필요합니다.');
        return;
      }

      let imageUrl = null;
      let backgroundUrl = null;
      let bgmUrl = null;
      let bgmDurationSeconds = null;
      let bgmMime = null;

      if (imageBlob) {
        const path = `heroes/${Date.now()}-${sanitizeFileName(name)}.jpg`;
        const { error } = await supabase.storage
          .from('heroes')
          .upload(path, imageBlob, { upsert: true, contentType: imageBlob.type || 'image/jpeg' });
        if (error) throw error;
        imageUrl = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl;
      }

      if (backgroundBlob) {
        const extension = (backgroundBlob.type && backgroundBlob.type.split('/')[1]) || 'jpg';
        const path = `hero-backgrounds/${Date.now()}-${sanitizeFileName(name, 'background')}.${extension}`;
        const { error } = await supabase.storage.from('heroes').upload(path, backgroundBlob, {
          upsert: true,
          contentType: backgroundBlob.type || 'image/jpeg',
        });
        if (error) throw error;
        backgroundUrl = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl;
      }

      if (bgmBlob) {
        const extension = (bgmBlob.type && bgmBlob.type.split('/')[1]) || 'mp3';
        const path = `hero-bgm/${Date.now()}-${sanitizeFileName(name, 'bgm')}.${extension}`;
        const { error } = await supabase.storage
          .from('heroes')
          .upload(path, bgmBlob, { upsert: true, contentType: bgmBlob.type || 'audio/mpeg' });
        if (error) throw error;
        bgmUrl = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl;
        bgmDurationSeconds = Number.isFinite(bgmDuration) ? bgmDuration : null;
        bgmMime = bgmBlob.type || null;
      }

      const { error: insertError } = await withTable(supabase, 'heroes', table =>
        supabase.from(table).insert({
          owner_id: user.id,
          name,
          description,
          ability1,
          ability2,
          ability3,
          ability4,
          image_url: imageUrl,
          background_url: backgroundUrl,
          bgm_url: bgmUrl,
          bgm_duration_seconds: bgmDurationSeconds,
          bgm_mime: bgmMime,
        })
      );
      if (insertError) throw insertError;

      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      alert('저장 실패: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  }, [
    ability1,
    ability2,
    ability3,
    ability4,
    backgroundBlob,
    bgmBlob,
    bgmDuration,
    description,
    imageBlob,
    name,
    onSaved,
    sanitizeFileName,
  ]);

  return {
    state: {
      preview,
      backgroundPreview,
      backgroundError,
      bgmLabel,
      bgmDuration,
      bgmError,
      name,
      description,
      ability1,
      ability2,
      ability3,
      ability4,
      loading,
    },
    actions: {
      setName,
      setDescription,
      setAbility1,
      setAbility2,
      setAbility3,
      setAbility4,
      selectImage,
      selectBackground,
      clearBackground,
      selectBgm,
      clearBgm,
      save,
    },
  };
}

//
