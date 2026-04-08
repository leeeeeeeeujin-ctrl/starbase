'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../../lib/supabase';
import { uploadHeroImageBundle } from '../../utils/heroIngameImage';
import { generateHeroCutoutPreview } from '../../utils/heroIngameImage';
import { uploadAsset } from '../../utils/uploader';
import { withTable } from '../../lib/supabaseTables';
import {
  normalizePokerogueProfileDraft,
  serializePokerogueProfileDraft,
} from '../../lib/pokerogue/profileDraft';

function revokeUrl(url) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export function useHeroCreator({ onSaved } = {}) {
  const [preview, setPreview] = useState(null);
  const [ingamePreview, setIngamePreview] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);

  const [backgroundPreview, setBackgroundPreview] = useState(null);
  const [backgroundBlob, setBackgroundBlob] = useState(null);
  const [backgroundError, setBackgroundError] = useState('');

  const [bgmLabel, setBgmLabel] = useState('');
  const [bgmBlob, setBgmBlob] = useState(null);
  const [bgmDuration, setBgmDuration] = useState(null);
  const [bgmError, setBgmError] = useState('');

  const [pokerogueEnabled, setPokerogueEnabled] = useState(false);
  const [pokerogueRegion, setPokerogueRegion] = useState('');
  const [pokerogueTier, setPokerogueTier] = useState('common');
  const [pokeroguePlayable, setPokeroguePlayable] = useState(true);
  const [pokerogueFrontPreview, setPokerogueFrontPreview] = useState(null);
  const [pokerogueBackPreview, setPokerogueBackPreview] = useState(null);
  const [pokerogueIconPreview, setPokerogueIconPreview] = useState(null);
  const [pokerogueFrontFile, setPokerogueFrontFile] = useState(null);
  const [pokerogueBackFile, setPokerogueBackFile] = useState(null);
  const [pokerogueIconFile, setPokerogueIconFile] = useState(null);
  const [pokerogueProfileDraft, setPokerogueProfileDraft] = useState(() =>
    normalizePokerogueProfileDraft({})
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sceneBackgroundDescription, setSceneBackgroundDescription] = useState('');
  const [ability1, setAbility1] = useState('');
  const [ability2, setAbility2] = useState('');
  const [ability3, setAbility3] = useState('');
  const [ability4, setAbility4] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      revokeUrl(preview);
      revokeUrl(ingamePreview);
      revokeUrl(backgroundPreview);
      revokeUrl(pokerogueFrontPreview);
      revokeUrl(pokerogueBackPreview);
      revokeUrl(pokerogueIconPreview);
    };
  }, [
    backgroundPreview,
    ingamePreview,
    pokerogueBackPreview,
    pokerogueFrontPreview,
    pokerogueIconPreview,
    preview,
  ]);

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
      if (ingamePreview) {
        revokeUrl(ingamePreview);
      }
      setImageBlob(blob);
      setPreview(URL.createObjectURL(blob));
      try {
        setIngamePreview(await generateHeroCutoutPreview(file));
      } catch (error) {
        console.error('Failed to generate ingame preview:', error);
        setIngamePreview(null);
      }
    },
    [preview, ingamePreview]
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

  const selectPokerogueSprite = useCallback(async (file, currentPreview, setPreviewUrl, setFile) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 사용할 수 있습니다.');
      return;
    }
    if (file.type === 'image/gif' || /\.gif$/i.test(file.name || '')) {
      alert('움짤(GIF)은 사용할 수 없습니다.');
      return;
    }
    const buffer = await file.arrayBuffer();
    const blob = new Blob([new Uint8Array(buffer)], { type: file.type || 'image/png' });
    if (currentPreview) {
      revokeUrl(currentPreview);
    }
    setFile(new File([blob], file.name || 'pokerogue-sprite.png', { type: blob.type }));
    setPreviewUrl(URL.createObjectURL(blob));
  }, []);

  const clearPokerogueSprite = useCallback((currentPreview, setPreviewUrl, setFile) => {
    revokeUrl(currentPreview);
    setPreviewUrl(null);
    setFile(null);
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
      let ingameImageUrl = null;
      let backgroundUrl = null;
      let bgmUrl = null;
      let bgmDurationSeconds = null;
      let bgmMime = null;
      let pokerogueFrontSpriteUrl = null;
      let pokerogueBackSpriteUrl = null;
      let pokerogueIconUrl = null;

      if (imageBlob) {
        const file = new File([imageBlob], `${sanitizeFileName(name)}.jpg`, { type: imageBlob.type || 'image/jpeg' });
        const up = await uploadHeroImageBundle(file, sanitizeFileName(name), { gameId: 'heroes' });
        imageUrl = up.imageUrl;
        ingameImageUrl = up.ingameImageUrl;
      }

      if (backgroundBlob) {
        const ext = (backgroundBlob.type && backgroundBlob.type.split('/')[1]) || 'jpg';
        const file = new File([backgroundBlob], `${sanitizeFileName(name, 'background')}.${ext}`, { type: backgroundBlob.type || 'image/jpeg' });
        const up = await uploadAsset(file, { gameId: 'heroes' });
        backgroundUrl = up.url;
      }

      if (bgmBlob) {
        const ext = (bgmBlob.type && bgmBlob.type.split('/')[1]) || 'mp3';
        const file = new File([bgmBlob], `${sanitizeFileName(name, 'bgm')}.${ext}`, { type: bgmBlob.type || 'audio/mpeg' });
        const up = await uploadAsset(file, { gameId: 'heroes' });
        bgmUrl = up.url;
        bgmDurationSeconds = Number.isFinite(bgmDuration) ? bgmDuration : null;
        bgmMime = bgmBlob.type || null;
      }

      if (pokerogueEnabled) {
        if (pokerogueFrontFile) {
          const ext = (pokerogueFrontFile.type && pokerogueFrontFile.type.split('/')[1]) || 'png';
          const file = new File([pokerogueFrontFile], `${sanitizeFileName(name, 'pokerogue-front')}.${ext}`, {
            type: pokerogueFrontFile.type || 'image/png',
          });
          const up = await uploadAsset(file, { gameId: 'heroes' });
          pokerogueFrontSpriteUrl = up.url;
        }
        if (pokerogueBackFile) {
          const ext = (pokerogueBackFile.type && pokerogueBackFile.type.split('/')[1]) || 'png';
          const file = new File([pokerogueBackFile], `${sanitizeFileName(name, 'pokerogue-back')}.${ext}`, {
            type: pokerogueBackFile.type || 'image/png',
          });
          const up = await uploadAsset(file, { gameId: 'heroes' });
          pokerogueBackSpriteUrl = up.url;
        }
        if (pokerogueIconFile) {
          const ext = (pokerogueIconFile.type && pokerogueIconFile.type.split('/')[1]) || 'png';
          const file = new File([pokerogueIconFile], `${sanitizeFileName(name, 'pokerogue-icon')}.${ext}`, {
            type: pokerogueIconFile.type || 'image/png',
          });
          const up = await uploadAsset(file, { gameId: 'heroes' });
          pokerogueIconUrl = up.url;
        }
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
          ingame_image_url: ingameImageUrl,
          scene_background_description: sceneBackgroundDescription,
          background_url: backgroundUrl,
          bgm_url: bgmUrl,
          bgm_duration_seconds: bgmDurationSeconds,
          bgm_mime: bgmMime,
          pokerogue_enabled: pokerogueEnabled,
          pokerogue_front_sprite_url: pokerogueEnabled ? pokerogueFrontSpriteUrl : null,
          pokerogue_back_sprite_url: pokerogueEnabled ? pokerogueBackSpriteUrl : null,
          pokerogue_icon_url: pokerogueEnabled ? pokerogueIconUrl : null,
          pokerogue_region: pokerogueEnabled ? pokerogueRegion.trim() : '',
          pokerogue_tier: pokerogueEnabled ? pokerogueTier : 'common',
          pokerogue_playable: pokerogueEnabled ? pokeroguePlayable : true,
          pokerogue_profile: pokerogueEnabled
            ? serializePokerogueProfileDraft(pokerogueProfileDraft)
            : {},
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
    sceneBackgroundDescription,
    imageBlob,
    name,
    onSaved,
    pokerogueBackFile,
    pokerogueEnabled,
    pokerogueFrontFile,
    pokerogueIconFile,
    pokeroguePlayable,
    pokerogueProfileDraft,
    pokerogueRegion,
    pokerogueTier,
    sanitizeFileName,
  ]);

  return {
    state: {
      preview,
      ingamePreview,
      backgroundPreview,
      backgroundError,
      bgmLabel,
      bgmDuration,
      bgmError,
      pokerogueEnabled,
      pokerogueRegion,
      pokerogueTier,
      pokeroguePlayable,
      pokerogueFrontPreview,
      pokerogueBackPreview,
      pokerogueIconPreview,
      pokerogueProfileDraft,
      name,
      description,
      sceneBackgroundDescription,
      ability1,
      ability2,
      ability3,
      ability4,
      loading,
    },
    actions: {
      setName,
      setDescription,
      setSceneBackgroundDescription,
      setAbility1,
      setAbility2,
      setAbility3,
      setAbility4,
      setPokerogueEnabled,
      setPokerogueRegion,
      setPokerogueTier,
      setPokeroguePlayable,
      setPokerogueProfileDraft,
      selectImage,
      selectBackground,
      clearBackground,
      selectBgm,
      clearBgm,
      selectPokerogueFront: file =>
        selectPokerogueSprite(
          file,
          pokerogueFrontPreview,
          setPokerogueFrontPreview,
          setPokerogueFrontFile
        ),
      selectPokerogueBack: file =>
        selectPokerogueSprite(
          file,
          pokerogueBackPreview,
          setPokerogueBackPreview,
          setPokerogueBackFile
        ),
      selectPokerogueIcon: file =>
        selectPokerogueSprite(
          file,
          pokerogueIconPreview,
          setPokerogueIconPreview,
          setPokerogueIconFile
        ),
      clearPokerogueFront: () =>
        clearPokerogueSprite(pokerogueFrontPreview, setPokerogueFrontPreview, setPokerogueFrontFile),
      clearPokerogueBack: () =>
        clearPokerogueSprite(pokerogueBackPreview, setPokerogueBackPreview, setPokerogueBackFile),
      clearPokerogueIcon: () =>
        clearPokerogueSprite(pokerogueIconPreview, setPokerogueIconPreview, setPokerogueIconFile),
      save,
    },
  };
}

//
