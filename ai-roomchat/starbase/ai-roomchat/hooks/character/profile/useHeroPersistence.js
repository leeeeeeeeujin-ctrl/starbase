import { useCallback, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { withTable } from '../../../lib/supabaseTables';
import { sanitizeFileName } from '../../../utils/characterAssets';
import { clearHeroCache, writeHeroCache } from '../../../utils/heroCache';

export function useHeroPersistence({
  heroId,
  hero,
  edit,
  setHero,
  setEdit,
  background,
  bgm,
  onDeleted,
  router,
}) {
  const [saving, setSaving] = useState(false);
  const { backgroundBlob, onSaveComplete: completeBackgroundSave } = background;
  const { bgmBlob, bgmDuration, bgmMime, onSaveComplete: completeBgmSave } = bgm;

  const handleSave = useCallback(
    async nextEdit => {
      setSaving(true);
      try {
        const source = nextEdit || edit;

        let backgroundUrl = source.background_url || null;
        if (backgroundBlob) {
          const extension = (backgroundBlob.type && backgroundBlob.type.split('/')[1]) || 'jpg';
          const path = `hero-background/${Date.now()}-${sanitizeFileName(source.name || hero?.name || 'background')}.${extension}`;
          const { error: bgUploadError } = await supabase.storage
            .from('heroes')
            .upload(path, backgroundBlob, {
              upsert: true,
              contentType: backgroundBlob.type || 'image/jpeg',
            });
          if (bgUploadError) throw bgUploadError;
          backgroundUrl = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl;
        }

        let bgmUrl = source.bgm_url || null;
        let bgmDurationSeconds =
          bgmDuration != null ? bgmDuration : hero?.bgm_duration_seconds || null;
        let bgmMimeValue = bgmMime || hero?.bgm_mime || null;
        if (bgmBlob) {
          const extension = (bgmBlob.type && bgmBlob.type.split('/')[1]) || 'mp3';
          const path = `hero-bgm/${Date.now()}-${sanitizeFileName(source.name || hero?.name || 'bgm')}.${extension}`;
          const { error: bgmUploadError } = await supabase.storage
            .from('heroes')
            .upload(path, bgmBlob, { upsert: true, contentType: bgmBlob.type || 'audio/mpeg' });
          if (bgmUploadError) throw bgmUploadError;
          bgmUrl = supabase.storage.from('heroes').getPublicUrl(path).data.publicUrl;
          bgmDurationSeconds = bgmDuration != null ? bgmDuration : bgmDurationSeconds;
          bgmMimeValue = bgmMime || bgmBlob.type || bgmMimeValue;
        }
        if (!bgmUrl) {
          bgmDurationSeconds = null;
          bgmMimeValue = null;
        }

        const payload = {
          name: source.name,
          description: source.description,
          ability1: source.ability1,
          ability2: source.ability2,
          ability3: source.ability3,
          ability4: source.ability4,
          background_url: backgroundUrl,
          bgm_url: bgmUrl,
          bgm_duration_seconds: bgmDurationSeconds,
          bgm_mime: bgmMimeValue,
        };

        const { error } = await withTable(supabase, 'heroes', table =>
          supabase.from(table).update(payload).eq('id', heroId)
        );
        if (error) throw error;

        const nextHero = {
          ...(hero || { id: heroId }),
          ...payload,
          id: heroId,
          background_url: backgroundUrl || '',
          bgm_url: bgmUrl || '',
          bgm_duration_seconds: bgmDurationSeconds || null,
          bgm_mime: bgmMimeValue || null,
        };

        setHero(prev => (prev ? { ...prev, ...nextHero } : nextHero));
        setEdit(prev => ({
          ...(prev || {}),
          name: payload.name,
          description: payload.description,
          ability1: payload.ability1,
          ability2: payload.ability2,
          ability3: payload.ability3,
          ability4: payload.ability4,
          background_url: backgroundUrl || '',
          bgm_url: bgmUrl || '',
        }));

        writeHeroCache(nextHero);

        completeBackgroundSave(backgroundUrl);
        completeBgmSave({ url: bgmUrl, duration: bgmDurationSeconds, mime: bgmMimeValue });

        alert('저장 완료');
      } catch (error) {
        alert(error.message || error);
      } finally {
        setSaving(false);
      }
    },
    [
      backgroundBlob,
      completeBackgroundSave,
      completeBgmSave,
      edit,
      hero,
      heroId,
      setEdit,
      setHero,
      bgmBlob,
      bgmDuration,
      bgmMime,
    ]
  );

  const handleDelete = useCallback(async () => {
    if (!confirm('정말 삭제할까? 복구할 수 없습니다.')) return;
    const { error } = await withTable(supabase, 'heroes', table =>
      supabase.from(table).delete().eq('id', heroId)
    );
    if (error) {
      alert(error.message);
      return;
    }
    clearHeroCache(heroId);
    onDeleted?.();
    router.replace('/roster');
  }, [heroId, onDeleted, router]);

  return {
    saving,
    onSave: handleSave,
    onDelete: handleDelete,
  };
}
